import { ipcMain, shell, type BrowserWindow } from 'electron'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import * as fs from 'node:fs'
import * as path from 'node:path'

type Deps = {
  getDisplayWindow: () => BrowserWindow | null
  isDisplayReady: () => boolean
  getMainWindow: () => BrowserWindow | null
  getChatWindow: () => BrowserWindow | null
  getOrCreateDisplayWindow: () => Promise<{ win: BrowserWindow; ready: boolean }>
  getOrCreateSearchWindow: () => BrowserWindow
  showWeatherData: (data: unknown) => void
  setWanderingByState: (state: string) => void
  onClickthroughChanged: (enabled: boolean) => void
}

const CHAT_HIDE_DELAY_MS = 10_000 // 10秒会話がなければチャットウィンドウを非表示

// POSIX-shell single-quote escape so paths with spaces / quotes survive.
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}

// Render a voice-issued command + its captured output as ANSI-colored lines for the pty stream.
// Uses \r\n for terminal newlines so xterm renders correctly mid-prompt.
function formatVoiceLine(command: string, stdout: string, stderr: string): string {
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
// Authoritative: catches cc even before the welcome banner reaches the scrollback.
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
    // Match the Claude Code binary (claude or .../bin/claude), avoiding stray "claude" in unrelated paths.
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

export function registerCoreIpc(deps: Deps): void {
  let chatHideTimer: ReturnType<typeof setTimeout> | null = null
  let currentCwd = homedir()
  let currentRobotState = 'idle'
  let lastEmailSearch: { query: string; maxResults: number; account: string | undefined } | null = null
  let lastDriveSearch: { query: string; mimeType: string | undefined; maxResults: number | undefined; account: string | undefined } | null = null

  // Re-fetch and push whatever panel the user is currently viewing. Called after any
  // state-mutating tool so the visible screen reflects the new state without a manual reload.
  // Skips if the display window is hidden or destroyed (no point fetching for nobody).
  async function refreshActivePanel() {
    const w = deps.getDisplayWindow()
    if (!w || w.isDestroyed() || !w.isVisible()) return
    const { getCurrentPanelType, fetchPanelData, pushPayload, isPanelType } = await import('../display/show-panel')
    const active = getCurrentPanelType()
    if (!active) return
    // Search panels need their original query replayed; fetchPanelData has no state for them.
    if (active === 'email_search') {
      if (!lastEmailSearch) return
      const { searchEmails } = await import('../skills/gmail/index')
      const data = await searchEmails(lastEmailSearch.query, lastEmailSearch.maxResults, lastEmailSearch.account)
      pushPayload(w, { type: 'email_search', data, fetchedAt: Date.now() }, deps.isDisplayReady())
      return
    }
    if (active === 'drive_search') {
      if (!lastDriveSearch) return
      const { searchDriveFiles } = await import('../skills/drive/index')
      const data = await searchDriveFiles(lastDriveSearch)
      pushPayload(w, { type: 'drive_search', data, fetchedAt: Date.now() }, deps.isDisplayReady())
      return
    }
    if (!isPanelType(active)) return
    const payload = await fetchPanelData(active)
    pushPayload(w, payload, deps.isDisplayReady())
  }

  function resetChatHideTimer() {
    if (chatHideTimer) clearTimeout(chatHideTimer)
    chatHideTimer = setTimeout(() => {
      const chat = deps.getChatWindow()
      if (chat && !chat.isDestroyed() && chat.isVisible()) chat.hide()
    }, CHAT_HIDE_DELAY_MS)
  }
  // 確認ダイアログをメインウィンドウへ送れるよう初期化
  import('../skills/confirmation/index').then(({ initConfirmation }) => {
    initConfirmation(deps.getMainWindow)
  })

  // タイマー期限コールバック設定
  import('../skills/timer/index').then(({ setOnExpire, getTimerSnapshot }) => {
    setOnExpire(async () => {
      const { pushPayload } = await import('../display/show-panel')
      const w = deps.getDisplayWindow()
      if (w && !w.isDestroyed()) {
        pushPayload(w, { type: 'timer', data: getTimerSnapshot(), fetchedAt: Date.now() }, deps.isDisplayReady())
      }
    })
  })

  ipcMain.on('confirmation:respond', (_event, id: string, confirmed: boolean) => {
    import('../skills/confirmation/index').then(({ respondToConfirmation }) => {
      respondToConfirmation(id, confirmed)
    })
  })

  // Interactive PTY: hoist module once and coalesce per-keystroke broadcasts so
  // bursty output produces fewer IPC sends and fewer xterm writes downstream.
  let ptyMod: typeof import('../skills/shell/pty') | null = null
  let pendingPtyData = ''
  let ptyFlushScheduled = false
  import('../skills/shell/pty').then((mod) => {
    ptyMod = mod
    mod.ptySubscribe((data) => {
      pendingPtyData += data
      if (ptyFlushScheduled) return
      ptyFlushScheduled = true
      setImmediate(() => {
        const out = pendingPtyData
        pendingPtyData = ''
        ptyFlushScheduled = false
        const w = deps.getDisplayWindow()
        if (w && !w.isDestroyed()) w.webContents.send('pty:data', out)
      })
    })
  })

  ipcMain.on('pty:write', (_event, data: string) => ptyMod?.ptyWrite(data))
  ipcMain.on('pty:resize', (_event, cols: number, rows: number) => ptyMod?.ptyResize(cols, rows))
  ipcMain.handle('pty:get-buffer', () => ptyMod?.ptyGetBuffer() ?? '')

  async function showTerminalPanel() {
    const { pushPayload } = await import('../display/show-panel')
    const { win, ready } = await deps.getOrCreateDisplayWindow()
    win.show()
    pushPayload(win, { type: 'terminal_output', data: null, fetchedAt: Date.now() }, ready)
  }

  async function injectAndShowTerminal(command: string, stdout: string, stderr: string) {
    ptyMod?.ptyInject(formatVoiceLine(command, stdout, stderr))
    await showTerminalPanel()
  }

  ipcMain.handle('call-tool', async (_event, toolName: string, args: Record<string, unknown>) => {
    try {
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
      if (
        toolName === 'get_tasks' ||
        toolName === 'create_task' ||
        toolName === 'complete_task' ||
        toolName === 'complete_subtask' ||
        toolName === 'update_task' ||
        toolName === 'get_gmail_inbox' ||
        toolName === 'trash_gmail' ||
        toolName === 'archive_gmail' ||
        toolName === 'get_email_detail' ||
        toolName === 'create_calendar_event' ||
        toolName === 'web_search' ||
        toolName === 'get_weather' ||
        toolName === 'list_drive_recent' ||
        toolName === 'list_drive_folder' ||
        toolName === 'read_drive_file' ||
        toolName === 'create_drive_file' ||
        toolName === 'upload_drive_file' ||
        toolName === 'move_drive_item' ||
        toolName === 'copy_drive_item' ||
        toolName === 'trash_drive_item' ||
        toolName === 'share_drive_item'
      ) {
        const { executeTool } = await import('../skills/dispatcher')
        const result = await executeTool(toolName, args)
        if (toolName === 'get_weather') {
          deps.showWeatherData(result)
        }
        if (toolName === 'web_search') {
          const sw = deps.getOrCreateSearchWindow()
          // ウィンドウのロード完了後に送る
          if (sw.webContents.isLoading()) {
            sw.webContents.once('did-finish-load', () => sw.webContents.send('search:data', result))
          } else {
            sw.webContents.send('search:data', result)
          }
        }
        const mutating = new Set([
          'trash_gmail',
          'archive_gmail',
          'create_calendar_event',
          'create_task',
          'complete_task',
          'complete_subtask',
          'update_task',
          'create_drive_file',
          'upload_drive_file',
          'move_drive_item',
          'copy_drive_item',
          'trash_drive_item',
          'share_drive_item',
        ])
        if (mutating.has(toolName)) {
          await refreshActivePanel()
        }
        return { result }
      }
      if (toolName === 'show_panel') {
        const { showPanel, isPanelType } = await import('../display/show-panel')
        const t = args.type
        if (!isPanelType(t)) return { error: `invalid type: ${String(t)}` }
        return await showPanel(t, { getOrCreateWindow: deps.getOrCreateDisplayWindow })
      }
      if (toolName === 'search_gmail') {
        const { searchEmails } = await import('../skills/gmail/index')
        const { pushPayload } = await import('../display/show-panel')
        const query = String(args.query ?? '').trim()
        const maxResults = typeof args.maxResults === 'number' ? args.maxResults : 20
        const account = typeof args.account === 'string' ? args.account : undefined
        if (!query) return { error: 'query is required' }
        const result = await searchEmails(query, maxResults, account)
        lastEmailSearch = { query, maxResults, account }
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
        const { pushPayload } = await import('../display/show-panel')
        const query = String(args.query ?? '').trim()
        if (!query) return { error: 'query is required' }
        const driveSearchArgs = {
          query,
          mimeType: typeof args.mimeType === 'string' ? args.mimeType : undefined,
          maxResults: typeof args.maxResults === 'number' ? args.maxResults : undefined,
          account: typeof args.account === 'string' ? args.account : undefined,
        }
        const result = await searchDriveFiles(driveSearchArgs)
        lastDriveSearch = driveSearchArgs
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
      if (toolName === 'update_profile') {
        const { upsertProfileItem } = await import('../memory/store')
        const profile = await upsertProfileItem(
          String(args.key ?? ''),
          String(args.value ?? ''),
        )
        return { result: { ok: true, items: profile.items } }
      }
      if (toolName === 'delete_profile') {
        const { deleteProfileItem } = await import('../memory/store')
        const profile = await deleteProfileItem(String(args.key ?? ''))
        return { result: { ok: true, items: profile.items } }
      }
      if (toolName === 'cd') {
        const raw = String(args.path ?? '').trim()
        if (!raw) return { error: 'path is required' }
        const expanded = raw === '~' || raw.startsWith('~/') ? path.join(homedir(), raw.slice(2)) : raw
        const target = path.resolve(currentCwd, expanded)

        // Verify the target before changing state. If this returns an error, the caller
        // (Gemini) will see it and can retry with a corrected path.
        let stat: fs.Stats
        try {
          stat = fs.statSync(target)
        } catch (e) {
          return { error: `cd failed: ${(e as Error).message}` }
        }
        if (!stat.isDirectory()) return { error: `cd failed: not a directory: ${target}` }

        // Run ls first so the user (and Gemini) sees what's in the destination.
        const { runCommand } = await import('../skills/shell/index')
        const ls = await runCommand('ls -la', target)
        ptyMod?.ptyInject(formatVoiceLine(`ls -la ${target}`, ls.stdout, ls.stderr))

        // Then mirror cd into the live pty + update tracked cwd.
        // \x15 (Ctrl-U) wipes any partial input before the cd lands.
        currentCwd = target
        ptyMod?.ptyWrite(`\x15cd ${shellQuote(currentCwd)}\n`)
        await showTerminalPanel()
        return { ok: true, cwd: currentCwd, contents: ls.stdout, lsOk: ls.ok, lsExitCode: ls.exitCode, lsStderr: ls.stderr }
      }
      if (toolName === 'run_command') {
        const { runCommand } = await import('../skills/shell/index')
        const command = String(args.command ?? '')
        const cwd = (args.cwd as string | undefined) ?? currentCwd
        if (/^\s*(claude|cc)(\s|$)/.test(command)) {
          return { error: 'Claude Code commands are not allowed through run_command. Use run_claude for code work.' }
        }
        const result = await runCommand(command, cwd)
        await injectAndShowTerminal(command, result.stdout, result.stderr)
        return { result }
      }
      if (toolName === 'run_claude') {
        const prompt = String(args.prompt ?? '')
        const cwd = (args.cwd as string | undefined) ?? currentCwd
        const runId = `claude-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        _event.sender.send('claude:run:start', { runId, cwd, prompt })
        await showTerminalPanel()
        if (!ptyMod) return { error: 'terminal is not ready' }
        const pastePrompt = () => {
          // Bracketed paste lets Claude Code receive multiline prompts as one paste.
          ptyMod?.ptyWrite(`\x1b[200~${prompt}\x1b[201~\r`)
        }

        // Process check is authoritative; buffer heuristic is the fallback (process check
        // can fail if `ps` is sandboxed or cc was launched outside this PTY's process tree).
        const shellPid = ptyMod?.ptyPid?.() ?? null
        const ccActive =
          (shellPid !== null && hasClaudeDescendant(shellPid)) ||
          looksLikeClaudeCodePrompt(ptyMod?.ptyGetBuffer() ?? '')

        if (ccActive) {
          pastePrompt()
        } else {
          ptyMod?.ptyWrite(`\x15cd ${shellQuote(cwd)}\ncc\n`)
          setTimeout(pastePrompt, 1500)
        }

        _event.sender.send('claude:run:done', {
          runId,
          exitCode: 0,
          durationMs: 0,
        })
        await showTerminalPanel()
        return {
          result: {
            ok: true,
            mode: 'interactive-pty',
            cwd,
            message: 'Claude Codeへ入力しました。完了結果はターミナルパネルで確認してください。',
          },
        }
      }
      if (
        toolName === 'start_timer' ||
        toolName === 'pause_timer' ||
        toolName === 'resume_timer' ||
        toolName === 'cancel_timer' ||
        toolName === 'start_stopwatch' ||
        toolName === 'pause_stopwatch' ||
        toolName === 'resume_stopwatch' ||
        toolName === 'stop_stopwatch'
      ) {
        const timerMod = await import('../skills/timer/index')
        const { pushPayload } = await import('../display/show-panel')
        let result: unknown
        if (toolName === 'start_timer') {
          result = timerMod.startTimer(String(args.name ?? ''), Number(args.duration_seconds))
        } else if (toolName === 'pause_timer') {
          result = timerMod.pauseTimer(String(args.id ?? ''))
        } else if (toolName === 'resume_timer') {
          result = timerMod.resumeTimer(String(args.id ?? ''))
        } else if (toolName === 'cancel_timer') {
          result = timerMod.cancelTimer(String(args.id ?? ''))
        } else if (toolName === 'start_stopwatch') {
          result = timerMod.startStopwatch(String(args.name ?? ''))
        } else if (toolName === 'pause_stopwatch') {
          result = timerMod.pauseStopwatch(String(args.id ?? ''))
        } else if (toolName === 'resume_stopwatch') {
          result = timerMod.resumeStopwatch(String(args.id ?? ''))
        } else {
          result = timerMod.stopStopwatch(String(args.id ?? ''))
        }
        const { win, ready } = await deps.getOrCreateDisplayWindow()
        win.show()
        pushPayload(win, { type: 'timer', data: timerMod.getTimerSnapshot(), fetchedAt: Date.now() }, ready)
        return { result }
      }
      return { error: `Unknown tool: ${toolName}` }
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.on('weather:close', () => {
    // WeatherApp から閉じるリクエスト — ウィンドウは index.ts が管理するので
    // ここでは hide のみ。ウィンドウ参照がないので BrowserWindow.getFocusedWindow() で対処
    const { BrowserWindow: BW } = require('electron') as typeof import('electron')
    BW.getAllWindows().forEach((w) => {
      const url = w.webContents.getURL()
      if (url.includes('#weather') || url.endsWith('hash=weather')) w.hide()
    })
  })

  ipcMain.on('search:close', () => {
    const sw = deps.getOrCreateSearchWindow()
    if (!sw.isDestroyed()) sw.hide()
  })

  ipcMain.handle('shell:open-url', (_event, url: string) => {
    shell.openExternal(url)
  })

  ipcMain.on('display:close', () => {
    const w = deps.getDisplayWindow()
    if (w && !w.isDestroyed()) w.hide()
    import('../display/show-panel').then(({ clearCurrentPanelType }) => clearCurrentPanelType())
  })

  ipcMain.handle('display:refresh', async (_event, type: unknown) => {
    const { fetchPanelData, isPanelType, pushPayload } = await import('../display/show-panel')
    if (!isPanelType(type)) return { error: `invalid type: ${String(type)}` }
    const payload = await fetchPanelData(type)
    const w = deps.getDisplayWindow()
    if (w && !w.isDestroyed()) {
      pushPayload(w, payload, deps.isDisplayReady())
    }
    return { ok: !payload.error }
  })

  ipcMain.on('chat-messages', (_event, messages: unknown) => {
    deps.getChatWindow()?.webContents.send('chat-messages', messages)
  })

  ipcMain.on('set-clickthrough', (_event, enabled: boolean) => deps.onClickthroughChanged(enabled))

  // ロボット窓→チャット窓へエラー転送
  ipcMain.on('connection-error', (_event, err: unknown) => {
    deps.getChatWindow()?.webContents.send('connection-error', err)
  })

  // チャット窓→ロボット窓へリトライ転送
  ipcMain.on('gemini:retry', () => {
    deps.getMainWindow()?.webContents.send('gemini:retry')
  })

  // ---- 通知監視 IPC ----

  // アプリ起動直後（index.ts の app.whenReady）から watch を開始する
  ipcMain.handle('notification:start-watch', () => {
    import('../skills/notifications/index').then(({ startNotificationWatch }) => {
      startNotificationWatch(
        (notif) => {
          deps.getMainWindow()?.webContents.send('notification:incoming', [notif])
        },
        () => currentRobotState,
      )
    }).catch((e) => console.error('[notification] watch start failed:', e))
  })

  // Gemini セッション接続完了時に renderer が呼ぶ → preSessionBuffer を返す
  ipcMain.handle('notification:session-ready', async () => {
    const { notificationSessionReady } = await import('../skills/notifications/index')
    return notificationSessionReady()
  })

  ipcMain.on('robot-state', (_event, state: string, processor?: string) => {
    const wasActive = currentRobotState !== 'idle'
    currentRobotState = state
    deps.setWanderingByState(state)
    const chat = deps.getChatWindow()
    if (chat && !chat.isDestroyed()) {
      // 会話中はチャットウィンドウを表示、タイマーをリセット
      if (state !== 'idle') {
        if (!chat.isVisible()) chat.show()
        resetChatHideTimer()
      } else {
        // idle になったら10秒タイマー開始
        resetChatHideTimer()
      }
      chat.webContents.send('robot-state', state, processor)
    }
    // idle 復帰時に会話中バッファを flush
    if (state === 'idle' && wasActive) {
      import('../skills/notifications/index').then(({ flushActiveNotifications }) => {
        const notifs = flushActiveNotifications()
        if (notifs.length > 0) {
          deps.getMainWindow()?.webContents.send('notification:incoming', notifs)
        }
      }).catch(() => {/* ignore if notification module not loaded */})
    }
  })

  ipcMain.on('chat:close', () => {
    const chat = deps.getChatWindow()
    if (chat && !chat.isDestroyed()) chat.hide()
  })

  ipcMain.on('chat-set-interactive', (_event, enabled: boolean) => {
    const chat = deps.getChatWindow()
    if (!chat) return
    if (enabled) chat.setIgnoreMouseEvents(false)
    else chat.setIgnoreMouseEvents(true, { forward: true })
  })

  ipcMain.on('set-language', (_event, lang: string) => {
    deps.getMainWindow()?.webContents.send('language-change', lang)
    deps.getChatWindow()?.webContents.send('language-change', lang)
  })
}
