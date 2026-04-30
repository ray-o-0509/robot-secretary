import { ipcMain, shell, type BrowserWindow } from 'electron'

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

export function registerCoreIpc(deps: Deps): void {
  let chatHideTimer: ReturnType<typeof setTimeout> | null = null

  function resetChatHideTimer() {
    if (chatHideTimer) clearTimeout(chatHideTimer)
    chatHideTimer = setTimeout(() => {
      const chat = deps.getChatWindow()
      if (chat && !chat.isDestroyed() && chat.isVisible()) chat.hide()
    }, CHAT_HIDE_DELAY_MS)
  }
  // 確認ダイアログをメインウィンドウへ送れるよう初期化
  import('../tools/confirmation').then(({ initConfirmation }) => {
    initConfirmation(deps.getMainWindow)
  })

  ipcMain.on('confirmation:respond', (_event, id: string, confirmed: boolean) => {
    import('../tools/confirmation').then(({ respondToConfirmation }) => {
      respondToConfirmation(id, confirmed)
    })
  })

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
        const question = (args.question as string | undefined) ?? '画面に何が表示されているか教えてくれ'
        const result = await runClaudeTask({ task: question, includeScreenshot: true })
        return { result }
      }
      if (
        toolName === 'get_tasks' ||
        toolName === 'create_task' ||
        toolName === 'complete_task' ||
        toolName === 'complete_subtask' ||
        toolName === 'update_task' ||
        toolName === 'get_email_detail' ||
        toolName === 'web_search' ||
        toolName === 'get_weather'
      ) {
        const { executeTool } = await import('../tools/dispatcher')
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
        return { result }
      }
      if (toolName === 'show_panel') {
        const { showPanel, isPanelType } = await import('../display/show-panel')
        const t = args.type
        if (!isPanelType(t)) return { error: `invalid type: ${String(t)}` }
        return await showPanel(t, { getOrCreateWindow: deps.getOrCreateDisplayWindow })
      }
      if (toolName === 'open_app') {
        const { openApp } = await import('../tools/openApp')
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

  ipcMain.on('robot-state', (_event, state: string, processor?: string) => {
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
