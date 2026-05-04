import type { WebContents } from 'electron'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { executeTool } from '../skills/dispatcher'
import { pushPayload, showPanel, isPanelType } from '../display/show-panel'
import {
  upsertProfileItem,
  deleteProfileItem,
  addProcedure,
  removeProcedure,
} from '../memory/store'
import { runCommand } from '../skills/shell/index'
import * as timerMod from '../skills/timer/index'

type PtyMod = typeof import('../skills/shell/pty')

export type EmailSearchState = {
  query: string
  maxResults: number
  account: string | undefined
}

export type DriveSearchState = {
  query: string
  mimeType: string | undefined
  maxResults: number | undefined
  account: string | undefined
}

export type DispatchDeps = {
  getOrCreateDisplayWindow: () => Promise<{ win: Electron.BrowserWindow; ready: boolean }>
  getOrCreateSearchWindow: () => Electron.BrowserWindow
  showWeatherData: (data: unknown) => void
  getPty: () => PtyMod | null
  getCwd: () => string
  setCwd: (cwd: string) => void
  refreshActivePanel: () => Promise<void>
  setLastEmailSearch: (state: EmailSearchState | null) => void
  setLastDriveSearch: (state: DriveSearchState | null) => void
  showTerminalPanel: () => Promise<void>
  injectAndShowTerminal: (command: string, stdout: string, stderr: string) => Promise<void>
}

// POSIX-shell single-quote escape so paths with spaces / quotes survive.
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}

// Render a voice-issued command + its captured output as ANSI-colored lines for the pty stream.
export function formatVoiceLine(command: string, stdout: string, stderr: string): string {
  const toLF = (s: string) => s.replace(/\r?\n/g, '\r\n')
  const head = `\r\n\x1b[36;1m[voice]\x1b[0m \x1b[1m${command}\x1b[0m\r\n`
  const out = stdout ? toLF(stdout) + '\r\n' : ''
  const err = stderr ? '\x1b[31m' + toLF(stderr) + '\x1b[0m\r\n' : ''
  return head + out + err
}

function looksLikeClaudeCodePrompt(buffer: string): boolean {
  const tail = buffer.slice(-8000)
  return tail.includes('Claude Code') && (
    tail.includes('bypass permissions on') ||
    tail.includes('Try "') ||
    tail.includes('bypass permissions')
  )
}

// Walk descendants of `rootPid` and return true if any process's argv looks like Claude Code.
function hasClaudeDescendant(rootPid: number): boolean {
  try {
    const out = execFileSync('ps', ['-axo', 'pid=,ppid=,args='], { encoding: 'utf8', timeout: 1000 })
    type Proc = { pid: number; ppid: number; args: string }
    const procs: Proc[] = []
    for (const line of out.split('\n')) {
      const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/)
      if (m) procs.push({ pid: Number(m[1]), ppid: Number(m[2]), args: m[3] })
    }
    const childrenOf = new Map<number, Proc[]>()
    for (const p of procs) {
      const arr = childrenOf.get(p.ppid) ?? []
      arr.push(p)
      childrenOf.set(p.ppid, arr)
    }
    const isClaude = (args: string) => /(?:^|\/)claude(?:\s|$|\b)/.test(args)
    const stack = [rootPid]
    const seen = new Set<number>()
    while (stack.length) {
      const pid = stack.pop()!
      if (seen.has(pid)) continue
      seen.add(pid)
      for (const child of childrenOf.get(pid) ?? []) {
        if (isClaude(child.args)) return true
        stack.push(child.pid)
      }
    }
    return false
  } catch {
    return false
  }
}

const DISPATCHER_PURE_TOOLS = new Set([
  'get_tasks',
  'create_task',
  'complete_task',
  'complete_subtask',
  'update_task',
  'get_gmail_inbox',
  'get_email_detail',
  'reply_gmail',
  'trash_gmail',
  'archive_gmail',
  'get_calendar_events',
  'create_calendar_event',
  'web_search',
  'get_weather',
  'get_dashboard_entry',
  'list_drive_recent',
  'list_drive_folder',
  'read_drive_file',
  'create_drive_file',
  'upload_drive_file',
  'move_drive_item',
  'copy_drive_item',
  'trash_drive_item',
  'share_drive_item',
])

const MUTATING_TOOLS = new Set([
  'trash_gmail',
  'archive_gmail',
  'create_calendar_event',
  'create_task',
  'complete_task',
  'update_task',
  'create_drive_file',
  'upload_drive_file',
  'move_drive_item',
  'copy_drive_item',
  'trash_drive_item',
  'share_drive_item',
])

const TIMER_HANDLERS: Record<string, (args: Record<string, unknown>) => unknown> = {
  start_timer: (a) => timerMod.startTimer(String(a.name ?? ''), Number(a.duration_seconds)),
  pause_timer: (a) => timerMod.pauseTimer(String(a.id ?? '')),
  resume_timer: (a) => timerMod.resumeTimer(String(a.id ?? '')),
  cancel_timer: (a) => timerMod.cancelTimer(String(a.id ?? '')),
  start_stopwatch: (a) => timerMod.startStopwatch(String(a.name ?? '')),
  pause_stopwatch: (a) => timerMod.pauseStopwatch(String(a.id ?? '')),
  resume_stopwatch: (a) => timerMod.resumeStopwatch(String(a.id ?? '')),
  stop_stopwatch: (a) => timerMod.stopStopwatch(String(a.id ?? '')),
}

export async function dispatchTool(
  toolName: string,
  args: Record<string, unknown>,
  deps: DispatchDeps,
  sender: WebContents,
): Promise<unknown> {
  if (toolName === 'delegate_task') {
    const { runClaudeTask } = await import('../agent/claude')
    const result = await runClaudeTask({
      task: args.task as string,
      includeScreenshot: args.includeScreenshot as boolean | undefined,
    })
    return { result }
  }

  if (toolName === 'analyze_screen') {
    const { runClaudeTask } = await import('../agent/claude')
    const question = (args.question as string | undefined) ?? 'Tell me what is on the screen'
    const result = await runClaudeTask({ task: question, includeScreenshot: true })
    return { result }
  }

  if (DISPATCHER_PURE_TOOLS.has(toolName)) {
    const result = await executeTool(toolName, args)
    if (toolName === 'get_weather') deps.showWeatherData(result)
    if (toolName === 'web_search') {
      const sw = deps.getOrCreateSearchWindow()
      if (sw.webContents.isLoading()) {
        sw.webContents.once('did-finish-load', () => sw.webContents.send('search:data', result))
      } else {
        sw.webContents.send('search:data', result)
      }
    }
    if (MUTATING_TOOLS.has(toolName)) {
      await deps.refreshActivePanel()
    }
    return { result }
  }

  if (toolName === 'show_panel') {
    const t = args.type
    if (!isPanelType(t)) return { error: `invalid type: ${String(t)}` }
    return await showPanel(t, { getOrCreateWindow: deps.getOrCreateDisplayWindow })
  }

  if (toolName === 'search_gmail') {
    const { searchEmails } = await import('../skills/gmail/index')
    const query = String(args.query ?? '').trim()
    const maxResults = typeof args.maxResults === 'number' ? args.maxResults : 20
    const account = typeof args.account === 'string' ? args.account : undefined
    if (!query) return { error: 'query is required' }
    const result = await searchEmails(query, maxResults, account)
    deps.setLastEmailSearch({ query, maxResults, account })
    const { win, ready } = await deps.getOrCreateDisplayWindow()
    win.show()
    pushPayload(win, { type: 'email_search', data: result, fetchedAt: Date.now() }, ready)
    return {
      ok: true,
      totalCount: result.messages.length,
      accounts: result.accounts.map((a) => `${a.account} (${a.count} items)`),
    }
  }

  if (toolName === 'search_drive') {
    const { searchDriveFiles } = await import('../skills/drive/index')
    const query = String(args.query ?? '').trim()
    if (!query) return { error: 'query is required' }
    const driveSearchArgs: DriveSearchState = {
      query,
      mimeType: typeof args.mimeType === 'string' ? args.mimeType : undefined,
      maxResults: typeof args.maxResults === 'number' ? args.maxResults : undefined,
      account: typeof args.account === 'string' ? args.account : undefined,
    }
    const result = await searchDriveFiles(driveSearchArgs)
    deps.setLastDriveSearch(driveSearchArgs)
    const { win, ready } = await deps.getOrCreateDisplayWindow()
    win.show()
    pushPayload(win, { type: 'drive_search', data: result, fetchedAt: Date.now() }, ready)
    return {
      ok: true,
      account: result.account,
      query: result.query,
      totalCount: result.files.length,
    }
  }

  if (toolName === 'open_app') {
    const { openApp } = await import('../skills/open-app/index')
    return await openApp(args.app_name as string)
  }

  if (toolName === 'type_text') {
    const { typeText } = await import('../skills/keyboard/index')
    return await typeText(String(args.text ?? ''))
  }

  if (toolName === 'press_keys') {
    const { pressKeys } = await import('../skills/keyboard/index')
    return await pressKeys(String(args.combo ?? ''))
  }

  if (toolName === 'wait') {
    const { wait } = await import('../skills/keyboard/index')
    return await wait(typeof args.seconds === 'number' ? args.seconds : Number(args.seconds))
  }

  if (toolName === 'update_profile') {
    const profile = await upsertProfileItem(String(args.key ?? ''), String(args.value ?? ''))
    return { result: { ok: true, items: profile.items } }
  }

  if (toolName === 'delete_profile') {
    const profile = await deleteProfileItem(String(args.key ?? ''))
    return { result: { ok: true, items: profile.items } }
  }

  if (toolName === 'learn_procedure') {
    const name = String(args.name ?? '').trim()
    const description = String(args.description ?? '').trim()
    if (!name || !description) return { error: 'name and description are required' }
    const memory = await addProcedure(name, description)
    return { result: { ok: true, name, count: memory.procedures.length } }
  }

  if (toolName === 'forget_procedure') {
    const name = String(args.name ?? '').trim()
    if (!name) return { error: 'name is required' }
    const memory = await removeProcedure(name)
    return { result: { ok: true, name, count: memory.procedures.length } }
  }

  if (toolName === 'cd') {
    const raw = String(args.path ?? '').trim()
    if (!raw) return { error: 'path is required' }
    const expanded = raw === '~' || raw.startsWith('~/') ? path.join(homedir(), raw.slice(2)) : raw
    const target = path.resolve(deps.getCwd(), expanded)

    let stat: fs.Stats
    try {
      stat = fs.statSync(target)
    } catch (e) {
      return { error: `cd failed: ${(e as Error).message}` }
    }
    if (!stat.isDirectory()) return { error: `cd failed: not a directory: ${target}` }

    const ls = await runCommand('ls -la', target)
    deps.getPty()?.ptyInject(formatVoiceLine(`ls -la ${target}`, ls.stdout, ls.stderr))

    deps.setCwd(target)
    deps.getPty()?.ptyWrite(`\x15cd ${shellQuote(target)}\n`)
    await deps.showTerminalPanel()
    return { ok: true, cwd: target, contents: ls.stdout, lsOk: ls.ok, lsExitCode: ls.exitCode, lsStderr: ls.stderr }
  }

  if (toolName === 'run_command') {
    const command = String(args.command ?? '')
    const cwd = (args.cwd as string | undefined) ?? deps.getCwd()
    if (/^\s*(claude|cc)(\s|$)/.test(command)) {
      return { error: 'Claude Code commands are not allowed through run_command. Use run_claude for code work.' }
    }
    const result = await runCommand(command, cwd)
    await deps.injectAndShowTerminal(command, result.stdout, result.stderr)
    return { result }
  }

  if (toolName === 'run_claude') {
    const prompt = String(args.prompt ?? '')
    const cwd = (args.cwd as string | undefined) ?? deps.getCwd()
    const runId = `claude-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    sender.send('claude:run:start', { runId, cwd, prompt })
    await deps.showTerminalPanel()
    const pty = deps.getPty()
    if (!pty) return { error: 'terminal is not ready' }
    const pastePrompt = () => {
      pty.ptyWrite(`\x1b[200~${prompt}\x1b[201~\r`)
    }

    const shellPid = pty.ptyPid?.() ?? null
    const ccActive =
      (shellPid !== null && hasClaudeDescendant(shellPid)) ||
      looksLikeClaudeCodePrompt(pty.ptyGetBuffer())

    if (ccActive) {
      pastePrompt()
    } else {
      pty.ptyWrite(`\x15cd ${shellQuote(cwd)}\ncc\n`)
      setTimeout(pastePrompt, 1500)
    }

    sender.send('claude:run:done', { runId, exitCode: 0, durationMs: 0 })
    await deps.showTerminalPanel()
    return {
      result: {
        ok: true,
        mode: 'interactive-pty',
        cwd,
        message: 'Claude Codeへ入力しました。完了結果はターミナルパネルで確認してください。',
      },
    }
  }

  const timerHandler = TIMER_HANDLERS[toolName]
  if (timerHandler) {
    const result = timerHandler(args)
    const { win, ready } = await deps.getOrCreateDisplayWindow()
    win.show()
    pushPayload(win, { type: 'timer', data: timerMod.getTimerSnapshot(), fetchedAt: Date.now() }, ready)
    return { result }
  }

  return { error: `Unknown tool: ${toolName}` }
}
