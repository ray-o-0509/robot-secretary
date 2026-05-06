import { ipcMain, shell, type BrowserWindow } from 'electron'
import { homedir } from 'node:os'
import { dispatchTool, formatVoiceLine, type DispatchDeps, type EmailSearchState, type DriveSearchState } from './dispatchTool'
import { registerNotificationHandlers, flushActiveNotifications } from './handlers/notifications'
import { registerPtyHandlers } from './handlers/pty'

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
const EXTERNAL_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function isSafeExternalUrl(raw: string): boolean {
  try {
    return EXTERNAL_URL_PROTOCOLS.has(new URL(raw).protocol)
  } catch {
    return false
  }
}

export function registerCoreIpc(deps: Deps): void {
  let chatHideTimer: ReturnType<typeof setTimeout> | null = null
  let currentCwd = homedir()
  let currentRobotState = 'idle'
  let lastEmailSearch: EmailSearchState | null = null
  let lastDriveSearch: DriveSearchState | null = null

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

  const { getPty } = registerPtyHandlers({ getDisplayWindow: deps.getDisplayWindow })

  registerNotificationHandlers({
    getMainWindow: deps.getMainWindow,
    getCurrentRobotState: () => currentRobotState,
  })

  async function showTerminalPanel(tab: 'claude' | 'shell' = 'shell') {
    const { pushPayload } = await import('../display/show-panel')
    const { win, ready } = await deps.getOrCreateDisplayWindow()
    win.show()
    pushPayload(win, { type: 'terminal_output', data: { activeTab: tab }, fetchedAt: Date.now() }, ready)
  }

  async function injectAndShowTerminal(command: string, stdout: string, stderr: string) {
    getPty()?.ptyInjectTo('shell', formatVoiceLine(command, stdout, stderr))
    await showTerminalPanel('shell')
  }

  const dispatchDeps: DispatchDeps = {
    getOrCreateDisplayWindow: deps.getOrCreateDisplayWindow,
    getOrCreateSearchWindow: deps.getOrCreateSearchWindow,
    showWeatherData: deps.showWeatherData,
    getCwd: () => currentCwd,
    setCwd: (cwd: string) => { currentCwd = cwd },
    refreshActivePanel,
    setLastEmailSearch: (state) => { lastEmailSearch = state },
    setLastDriveSearch: (state) => { lastDriveSearch = state },
    showTerminalPanel,
    injectAndShowTerminal,
  }

  ipcMain.handle('call-tool', async (event, toolName: string, args: Record<string, unknown>) => {
    try {
      return await dispatchTool(toolName, args, dispatchDeps, event.sender)
    } catch (err) {
      console.error(`[call-tool] unhandled error in ${toolName}:`, err)
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
    if (typeof url !== 'string' || !isSafeExternalUrl(url)) {
      throw new Error(`Blocked external URL: ${String(url)}`)
    }
    return shell.openExternal(url)
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

  ipcMain.on('robot-state', (_event, state: string, processor?: string) => {
    const wasActive = currentRobotState !== 'idle'
    currentRobotState = state
    deps.setWanderingByState(state)
    const chat = deps.getChatWindow()
    if (chat && !chat.isDestroyed()) {
      if (state !== 'idle') {
        // 会話中はチャットウィンドウを表示し、タイマーを止める
        if (!chat.isVisible()) chat.show()
        if (chatHideTimer) { clearTimeout(chatHideTimer); chatHideTimer = null }
      } else {
        // idle になったら10秒タイマー開始
        resetChatHideTimer()
      }
      chat.webContents.send('robot-state', state, processor)
    }
    // idle 復帰時に会話中バッファを flush
    if (state === 'idle' && wasActive) {
      flushActiveNotifications().then((notifs) => {
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
