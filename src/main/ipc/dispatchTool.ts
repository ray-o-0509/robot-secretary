import type { WebContents } from 'electron'
import { homedir } from 'node:os'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { executeTool } from '../skills/dispatcher'
import { pushPayload } from '../display/show-panel'
import { runCommand, shellQuote } from '../skills/shell/index'
import * as timerMod from '../skills/timer/index'
import { ptyWriteTo, ptyInjectTo } from '../skills/shell/pty'
import { pasteToClaudePty } from '../skills/shell/claudePty'

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
  getCwd: () => string
  setCwd: (cwd: string) => void
  refreshActivePanel: () => Promise<void>
  setLastEmailSearch: (state: EmailSearchState | null) => void
  setLastDriveSearch: (state: DriveSearchState | null) => void
  showTerminalPanel: (tab?: 'claude' | 'shell') => Promise<void>
  injectAndShowTerminal: (command: string, stdout: string, stderr: string) => Promise<void>
}

// Render a voice-issued command + its captured output as ANSI-colored lines for the pty stream.
export function formatVoiceLine(command: string, stdout: string, stderr: string): string {
  const toLF = (s: string) => s.replace(/\r?\n/g, '\r\n')
  const head = `\r\n\x1b[36;1m[voice]\x1b[0m \x1b[1m${command}\x1b[0m\r\n`
  const out = stdout ? toLF(stdout) + '\r\n' : ''
  const err = stderr ? '\x1b[31m' + toLF(stderr) + '\x1b[0m\r\n' : ''
  return head + out + err
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
  'untrash_gmail',
  'block_sender',
  'unblock_sender',
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
  'search_gmail',
  'open_app',
  'type_text',
  'press_keys',
  'wait',
  'update_profile',
  'delete_profile',
  'learn_procedure',
  'forget_procedure',
  'start_timer',
  'pause_timer',
  'resume_timer',
  'cancel_timer',
  'start_stopwatch',
  'pause_stopwatch',
  'resume_stopwatch',
  'stop_stopwatch',
  'run_command',
  'show_panel',
])

const TIMER_TOOLS = new Set([
  'start_timer', 'pause_timer', 'resume_timer', 'cancel_timer',
  'start_stopwatch', 'pause_stopwatch', 'resume_stopwatch', 'stop_stopwatch',
])

const MUTATING_TOOLS = new Set([
  'trash_gmail',
  'archive_gmail',
  'untrash_gmail',
  'block_sender',
  'unblock_sender',
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
    // Inject Gemini's session cwd into run_command when caller didn't specify one.
    // The Claude API agent path bypasses this and falls back to homedir() inside executeTool.
    let toolArgs = args
    if (toolName === 'run_command' && typeof args.cwd !== 'string') {
      toolArgs = { ...args, cwd: deps.getCwd() }
    }

    const result = await executeTool(toolName, toolArgs)

    if (toolName === 'get_weather') deps.showWeatherData(result)
    if (toolName === 'web_search') {
      const sw = deps.getOrCreateSearchWindow()
      if (sw.webContents.isLoading()) {
        sw.webContents.once('did-finish-load', () => sw.webContents.send('search:data', result))
      } else {
        sw.webContents.send('search:data', result)
      }
    }
    if (toolName === 'search_gmail') {
      const r = result as {
        messages: unknown[]
        accounts: { account: string; count: number }[]
      }
      const query = String(args.query ?? '').trim()
      const maxResults = typeof args.maxResults === 'number' ? args.maxResults : 20
      const account = typeof args.account === 'string' ? args.account : undefined
      deps.setLastEmailSearch({ query, maxResults, account })
      const { win, ready } = await deps.getOrCreateDisplayWindow()
      win.show()
      pushPayload(win, { type: 'email_search', data: r, fetchedAt: Date.now() }, ready)
      // Return abbreviated form so Gemini doesn't read the full message list aloud.
      return {
        result: {
          ok: true,
          totalCount: r.messages.length,
          accounts: r.accounts.map((a) => `${a.account} (${a.count} items)`),
        },
      }
    }
    if (toolName === 'run_command') {
      // The command was actually typed into the shell PTY by executeTool, so the panel
      // already reflects it. Just bring the shell tab forward.
      await deps.showTerminalPanel('shell')
    }
    if (TIMER_TOOLS.has(toolName)) {
      const { win, ready } = await deps.getOrCreateDisplayWindow()
      win.show()
      pushPayload(win, { type: 'timer', data: timerMod.getTimerSnapshot(), fetchedAt: Date.now() }, ready)
    }
    if (MUTATING_TOOLS.has(toolName)) {
      await deps.refreshActivePanel()
    }
    return { result }
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
    // Mirror the cd visually into the shell PTY (no execution — just for the user to see).
    ptyInjectTo('shell', formatVoiceLine(`cd ${target}`, ls.stdout, ls.stderr))
    ptyWriteTo('shell', `\x15cd ${shellQuote(target)}\n`)

    deps.setCwd(target)
    await deps.showTerminalPanel('shell')
    return { ok: true, cwd: target, contents: ls.stdout, lsOk: ls.ok, lsExitCode: ls.exitCode, lsStderr: ls.stderr }
  }

  if (toolName === 'run_claude') {
    const prompt = String(args.prompt ?? '')
    const cwd = deps.getCwd()
    const runId = `claude-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    sender.send('claude:run:start', { runId, cwd, prompt })
    await deps.showTerminalPanel('claude')

    try {
      await pasteToClaudePty(prompt)
    } catch (err) {
      return { error: `Claude Code is not ready: ${(err as Error).message}` }
    }

    sender.send('claude:run:done', { runId, exitCode: 0, durationMs: 0 })
    return {
      result: {
        ok: true,
        mode: 'interactive-pty',
        cwd,
        message: 'Claude Codeへ入力しました。完了結果はターミナルパネルで確認してください。',
      },
    }
  }

  return { error: `Unknown tool: ${toolName}` }
}
