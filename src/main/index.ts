import { app, BrowserWindow, desktopCapturer, ipcMain, Menu, nativeImage, screen, shell, systemPreferences } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as dotenv from 'dotenv'
import { uIOhook, UiohookKey } from 'uiohook-napi'
import { initMemory, shutdownMemory } from './memory'
import { registerCoreIpc } from './ipc/registerCoreIpc'

const debugLogPath = path.join(app.getPath('userData'), 'debug.log')
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
}

function writeDebugLog(level: 'log' | 'warn' | 'error', args: unknown[]) {
  try {
    fs.mkdirSync(path.dirname(debugLogPath), { recursive: true })
    const line = args.map((arg) => {
      if (typeof arg === 'string') return arg
      try {
        return JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    }).join(' ')
    fs.appendFileSync(debugLogPath, `${new Date().toISOString()} [${level}] ${line}\n`)
  } catch {
    // ログ書き込み失敗でアプリ本体を止めない
  }
}

console.log = (...args: unknown[]) => {
  originalConsole.log(...args)
  writeDebugLog('log', args)
}
console.warn = (...args: unknown[]) => {
  originalConsole.warn(...args)
  writeDebugLog('warn', args)
}
console.error = (...args: unknown[]) => {
  originalConsole.error(...args)
  writeDebugLog('error', args)
}

// .env / .env.local の探索パス。
// - dev: プロジェクトルート（__dirname = out/main/ なので ../../）
// - prod: パッケージ外なので ~/.config/robot-secretary/ と userData を探す
const envSearchDirs = app.isPackaged
  ? [
      path.join(os.homedir(), '.config', 'robot-secretary'),
      app.getPath('userData'),
    ]
  : [path.join(__dirname, '../..')]

for (const dir of envSearchDirs) {
  dotenv.config({ path: path.join(dir, '.env') })
  dotenv.config({ path: path.join(dir, '.env.local'), override: true })
}
console.log('[env] searched:', envSearchDirs.join(', '), 'has GEMINI_API_KEY:', !!process.env.GEMINI_API_KEY)

const isDev = !app.isPackaged

const iconPath = path.join(__dirname, '../../assets/icon.png')

let setupWin: BrowserWindow | null = null
let settingsWin: BrowserWindow | null = null
let win: BrowserWindow | null = null
let chatWin: BrowserWindow | null = null
let displayWin: BrowserWindow | null = null
let displayReady = false
let searchWin: BrowserWindow | null = null
let weatherWin: BrowserWindow | null = null
let weatherReady = false
let pendingWeatherData: unknown = null
let webWin: BrowserWindow | null = null
let emailDetailWin: BrowserWindow | null = null
let emailDetailReady = false
let pendingEmailDetailArgs: { account: string; id: string } | null = null
let wanderInterval: NodeJS.Timeout | null = null
let targetX = 0
let targetY = 0
let currentX = 0
let currentY = 0
let isWandering = true
let isInteracting = false
let pinnedUntil = 0
let isMuted = false
let pttActive = false
let shuttingDown = false

// ========== Settings Window ==========

function openSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus()
    return
  }
  settingsWin = new BrowserWindow({
    width: 480,
    height: 640,
    resizable: false,
    frame: false,
    titleBarStyle: 'hidden',
    transparent: false,
    alwaysOnTop: true,
    center: true,
    backgroundColor: '#0a0a14',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  forwardRendererConsole(settingsWin, 'settings')
  settingsWin.on('closed', () => { settingsWin = null })
  if (isDev) {
    settingsWin.loadURL(process.env['ELECTRON_RENDERER_URL']! + '#settings')
  } else {
    settingsWin.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: 'settings' })
  }
}

function registerSettingsIpc() {
  ipcMain.on('settings:close', () => {
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close()
  })

  ipcMain.handle('settings:get-profile', async () => {
    const { loadProfile } = await import('./memory/store')
    const profile = await loadProfile()
    return profile.items
  })

  ipcMain.handle('settings:upsert-profile', async (_event, key: string, value: string) => {
    const { upsertProfileItem } = await import('./memory/store')
    const profile = await upsertProfileItem(String(key), String(value))
    return profile.items
  })

  ipcMain.handle('settings:delete-profile', async (_event, key: string) => {
    const { deleteProfileItem } = await import('./memory/store')
    const profile = await deleteProfileItem(String(key))
    return profile.items
  })

  ipcMain.handle('settings:get-default-apps', async () => {
    const { loadDefaultApps } = await import('./skills/default-apps/index')
    return await loadDefaultApps()
  })

  ipcMain.handle('settings:save-default-apps', async (_event, apps: unknown) => {
    const { saveDefaultApps } = await import('./skills/default-apps/index')
    if (apps && typeof apps === 'object') {
      await saveDefaultApps(apps as import('./skills/default-apps/index').DefaultApps)
    }
    return { ok: true }
  })
}

// ========== Setup Window ==========

function createSetupWindow() {
  setupWin = new BrowserWindow({
    width: 480,
    height: 560,
    resizable: false,
    frame: false,
    titleBarStyle: 'hidden',
    transparent: false,
    alwaysOnTop: true,
    center: true,
    backgroundColor: '#0a0a14',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  forwardRendererConsole(setupWin, 'setup')

  if (isDev) {
    setupWin.loadURL(process.env['ELECTRON_RENDERER_URL']! + '#setup')
  } else {
    setupWin.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: 'setup' })
  }

  // セットアップ表示直後にマイク権限ダイアログを発火（未決定の場合のみ）
  if (process.platform === 'darwin') {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone')
    if (micStatus === 'not-determined') {
      systemPreferences.askForMediaAccess('microphone').catch(() => {})
    }
  }
}

function getGmailAccounts(): string[] {
  try {
    const primaryDir = path.join(os.homedir(), '.config', 'robot-secretary', 'google-tokens')
    const fallbackDir = path.join(os.homedir(), '.config', 'gmail-triage', 'tokens')
    const tokensDir = fs.existsSync(primaryDir) ? primaryDir : fallbackDir
    if (!fs.existsSync(tokensDir)) return []
    return fs.readdirSync(tokensDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
  } catch {
    return []
  }
}

function registerSetupIpc() {
  ipcMain.handle('setup:get-status', async () => {
    const micPermission = process.platform === 'darwin'
      ? systemPreferences.getMediaAccessStatus('microphone')
      : 'granted'
    const accessibilityPermission = process.platform === 'darwin'
      ? systemPreferences.isTrustedAccessibilityClient(false)
      : true

    return {
      micPermission,
      accessibilityPermission,
      geminiApiKey: !!(process.env.GEMINI_API_KEY),
      ticktickToken: !!(process.env.TICKTICK_ACCESS_TOKEN),
      gmailAccounts: getGmailAccounts(),
    }
  })

  ipcMain.on('setup:open-settings', (_event, type: string) => {
    if (type === 'microphone') {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone')
    } else if (type === 'accessibility') {
      if (process.platform === 'darwin') {
        systemPreferences.isTrustedAccessibilityClient(true)
      }
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
    }
  })

  ipcMain.handle('setup:launch', async () => {
    if (setupWin && !setupWin.isDestroyed()) {
      setupWin.close()
      setupWin = null
    }
    await initMemory(() => process.env.GEMINI_API_KEY)
    createWindow()
  })
}

// ========== Window ==========

function forwardRendererConsole(window: BrowserWindow, label: string) {
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const source = sourceId ? `${path.basename(sourceId)}:${line}` : `line ${line}`
    console.log(`[renderer:${label}]`, message, `(${source}, level ${level})`)
  })
}

function createWindow() {
  const { width: _w, height } = screen.getPrimaryDisplay().workAreaSize
  // 起動時は左下（チャットウィンドウの下付近）に配置
  currentX = 24 + 360 + 24  // チャットウィンドウ右端 + 余白
  currentY = Math.floor(height - 300 - 40)
  targetX = currentX
  targetY = currentY

  win = new BrowserWindow({
    width: 300,
    height: 300,
    x: currentX,
    y: currentY,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  forwardRendererConsole(win, 'robot')

  // 全 Space で表示（フルスクリーン Space は除外）
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })
  win.setAlwaysOnTop(true, 'floating')

  // クリックスルー（右クリックのみ有効）
  win.setIgnoreMouseEvents(true, { forward: true })

  if (isDev) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  setupContextMenu()
  startWandering()
  setupPTT()
  requestMicPermission()
  requestScreenPermission()
  createChatWindow()

  // dev中はDevToolsを開く
  if (isDev) win.webContents.openDevTools({ mode: 'detach' })
}

function createChatWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const chatW = 360
  const chatH = Math.min(560, height - 80)

  // デフォルト：左上
  const chatX = 24
  const chatY = 24

  chatWin = new BrowserWindow({
    width: chatW,
    height: chatH,
    x: chatX,
    y: chatY,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  forwardRendererConsole(chatWin, 'chat')

  // 全 Space で表示（フルスクリーン Space は除外）
  chatWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })
  chatWin.setAlwaysOnTop(true, 'floating')

  chatWin.setIgnoreMouseEvents(true, { forward: true })
  chatWin.on('closed', () => { chatWin = null })

  if (isDev) {
    chatWin.loadURL(process.env['ELECTRON_RENDERER_URL']! + '#chat')
  } else {
    chatWin.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: 'chat' })
  }
}

// ========== Display Window (右側のメール/カレンダー/タスク表示用) ==========

const DISPLAY_WIDTH = 440
const DISPLAY_RIGHT_MARGIN = 24

function getOrCreateDisplayWindow(): Promise<{ win: BrowserWindow; ready: boolean }> {
  if (displayWin && !displayWin.isDestroyed()) {
    return Promise.resolve({ win: displayWin, ready: displayReady })
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const w = DISPLAY_WIDTH
  const h = Math.min(680, height - 80)

  displayReady = false
  const created = new BrowserWindow({
    width: w,
    height: h,
    x: width - w - DISPLAY_RIGHT_MARGIN,
    y: 40,
    transparent: true,
    frame: false,
    alwaysOnTop: false,
    hasShadow: false,
    skipTaskbar: false,
    resizable: true,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  displayWin = created
  forwardRendererConsole(created, 'display')

  created.on('closed', () => {
    if (displayWin === created) {
      displayWin = null
      displayReady = false
    }
  })

  const ready = new Promise<void>((resolve) => {
    created.webContents.once('did-finish-load', () => {
      displayReady = true
      // 起動中にキューされていた payload があれば吐き出す
      import('./display/show-panel').then(({ flushPending }) => {
        if (displayWin && !displayWin.isDestroyed()) flushPending(displayWin)
      })
      resolve()
    })
  })

  if (isDev) {
    created.loadURL(process.env['ELECTRON_RENDERER_URL']! + '#display')
  } else {
    created.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: 'display' })
  }

  return ready.then(() => ({ win: created, ready: true }))
}

// ========== Search Window ==========

function getOrCreateSearchWindow(): BrowserWindow {
  if (searchWin && !searchWin.isDestroyed()) {
    searchWin.show()
    return searchWin
  }
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const w = 480
  const h = Math.min(640, height - 80)
  searchWin = new BrowserWindow({
    width: w,
    height: h,
    x: width - w - DISPLAY_RIGHT_MARGIN,
    y: 40,
    transparent: true,
    frame: false,
    alwaysOnTop: false,
    hasShadow: false,
    resizable: true,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  forwardRendererConsole(searchWin, 'search')
  searchWin.on('closed', () => { searchWin = null })
  if (isDev) {
    searchWin.loadURL(process.env['ELECTRON_RENDERER_URL']! + '#search')
  } else {
    searchWin.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: 'search' })
  }
  return searchWin
}

// ========== Push-to-Talk (左 Option キー = keycode 56) ==========

function setupPTT() {
  // アクセシビリティ権限チェック（グローバルキーフックに必要）
  const trusted = systemPreferences.isTrustedAccessibilityClient(false)
  if (!trusted) {
    // システム設定を開いてユーザーに許可を促す
    systemPreferences.isTrustedAccessibilityClient(true) // promptフラグでダイアログ表示
    console.warn('[PTT] アクセシビリティ権限が必要です。システム設定→プライバシー→アクセシビリティでこのアプリを許可後、再起動してください。')
    // 権限なしでも起動できるよう、PTTなしモードで続行
    return
  }

  uIOhook.on('keydown', (e) => {
    // 左Option のみ（右Option = 3640 は除外）
    if (e.keycode === UiohookKey.Alt && !pttActive) {
      console.log('[PTT:main] keydown alt')
      pttActive = true
      win?.webContents.send('ptt-start')
    }
  })

  uIOhook.on('keyup', (e) => {
    if (e.keycode === UiohookKey.Alt && pttActive) {
      console.log('[PTT:main] keyup alt')
      pttActive = false
      win?.webContents.send('ptt-stop')
    }
  })

  uIOhook.start()
}

// ========== マイク権限リクエスト ==========

async function requestMicPermission() {
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status !== 'granted') {
      await systemPreferences.askForMediaAccess('microphone')
    }
  }
}

// ========== 画面収録権限リクエスト ==========
//
// macOS には askForMediaAccess('screen') が無い。
// desktopCapturer.getSources を 1 度呼ぶと TCC のダイアログが上がり、
// 許可後に System Settings の「画面収録」一覧に App が登録される。
// 許可は次回起動から有効なので、ユーザは設定後にアプリを再起動する必要がある。
async function requestScreenPermission() {
  if (process.platform !== 'darwin') return
  const status = systemPreferences.getMediaAccessStatus('screen')
  console.log('[Permission] 画面収録 status:', status)
  if (status === 'granted') return
  console.warn('[Permission] 画面収録未許可。プロンプトを上げる')
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 },
    })
    const after = systemPreferences.getMediaAccessStatus('screen')
    console.log('[Permission] getSources 後 status:', after, 'sources:', sources.length)
    if (status === 'denied' || after === 'denied') {
      console.warn(
        '[Permission] Screen capture was previously denied and the prompt is suppressed. Run `tccutil reset ScreenCapture` in a terminal and restart the app.',
      )
    }
  } catch (err) {
    console.error('[Permission] Screen capture prompt failed:', err)
  }
}

// ========== 画面内ふわふわ移動 ==========

function pickNewTarget() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const margin = 50
  // チャットウィンドウ（左上）と被らないよう、ロボットの可動域を右側に制限
  const chatRight = 24 + 360 + 24
  const minX = Math.max(margin, chatRight)
  // 表示ウィンドウ（右上）が出ているときは右側も避ける
  const displayVisible = displayWin && !displayWin.isDestroyed() && displayWin.isVisible()
  const maxX = displayVisible
    ? width - DISPLAY_WIDTH - DISPLAY_RIGHT_MARGIN - 300 - margin
    : width - 300 - margin
  const span = Math.max(1, maxX - minX)
  targetX = minX + Math.random() * span
  targetY = margin + Math.random() * (height - 300 - margin * 2)
}

function startWandering() {
  pickNewTarget()

  let lastTime = Date.now()
  let lastSentX = Number.NaN
  let lastSentY = Number.NaN
  let nextTargetPending = false

  wanderInterval = setInterval(() => {
    const now = Date.now()
    let dt = (now - lastTime) / 1000
    lastTime = now
    // ポーズ復帰時の時間ジャンプを抑える（会話中/ドラッグ中に止まっていた分を一気に進めない）
    if (dt > 0.1) dt = 0.016

    if (!win || !isWandering || isInteracting) return
    if (Date.now() < pinnedUntil) return

    const dx = targetX - currentX
    const dy = targetY - currentY
    const dist = Math.hypot(dx, dy)

    if (dist < 0.75) {
      // 目標到達。次の目的地を一度だけ予約する
      if (!nextTargetPending) {
        nextTargetPending = true
        setTimeout(() => {
          nextTargetPending = false
          pickNewTarget()
        }, 3000 + Math.random() * 5000)
      }
      return
    }

    // 時間ベースの指数イージング: フレームレートに依らず同じ感覚で寄っていく
    const rate = 0.5 // 1秒あたりの追従係数（大きいほど早く寄る）
    const factor = 1 - Math.exp(-rate * dt)
    currentX += dx * factor
    currentY += dy * factor

    // 整数化した位置が前回と同じなら setPosition は呼ばない（透過ウィンドウのIPCコストを節約）
    const ix = Math.round(currentX)
    const iy = Math.round(currentY)
    if (ix !== lastSentX || iy !== lastSentY) {
      win.setPosition(ix, iy)
      lastSentX = ix
      lastSentY = iy
    }
  }, 16) // ≒ 60fps
}

function stopWandering() {
  if (wanderInterval) {
    clearInterval(wanderInterval)
    wanderInterval = null
  }
}

// ========== 右クリックメニュー ==========

function setupContextMenu() {
  if (!win) return

  win.webContents.on('context-menu', () => {
    const menu = Menu.buildFromTemplate([
      {
        label: isWandering ? 'Stop wandering' : 'Resume wandering',
        click: () => {
          isWandering = !isWandering
          if (isWandering && !wanderInterval) startWandering()
        },
      },
      {
        label: isMuted ? 'Unmute' : 'Mute',
        click: () => {
          isMuted = !isMuted
          win?.webContents.send('mute-changed', isMuted)
        },
      },
      { type: 'separator' },
      { label: 'Settings', click: () => openSettingsWindow() },
      ...(isDev
        ? [
            { type: 'separator' as const },
            {
              label: 'Debug: Show panel',
              submenu: [
                { label: 'Email', click: () => triggerDebugPanel('email') },
                { label: 'Calendar (today)', click: () => triggerDebugPanel('calendar_today') },
                { label: 'Calendar (tomorrow)', click: () => triggerDebugPanel('calendar_tomorrow') },
                { label: 'Calendar (week)', click: () => triggerDebugPanel('calendar_week') },
                { label: 'Tasks', click: () => triggerDebugPanel('tasks') },
                { label: 'AI News', click: () => triggerDebugPanel('news') },
                { label: 'Tools', click: () => triggerDebugPanel('tools') },
                { label: 'Movies', click: () => triggerDebugPanel('movies') },
              ],
            },
          ]
        : []),
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
    menu.popup({ window: win! })
  })
}

async function triggerDebugPanel(type: string) {
  const { showPanel, isPanelType } = await import('./display/show-panel')
  if (!isPanelType(type)) return
  await showPanel(type, { getOrCreateWindow: getOrCreateDisplayWindow })
}


// ========== Weather Window ==========

function getOrCreateWeatherWindow(): BrowserWindow {
  if (weatherWin && !weatherWin.isDestroyed()) {
    weatherWin.show()
    weatherWin.focus()
    return weatherWin
  }
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const w = 440
  const h = Math.min(720, height - 80)
  weatherReady = false
  const created = new BrowserWindow({
    width: w,
    height: h,
    x: width - w - DISPLAY_RIGHT_MARGIN,
    y: 40,
    transparent: true,
    frame: false,
    alwaysOnTop: false,
    hasShadow: false,
    resizable: true,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  weatherWin = created
  forwardRendererConsole(created, 'weather')
  created.on('closed', () => {
    if (weatherWin === created) { weatherWin = null; weatherReady = false }
  })
  created.webContents.once('did-finish-load', () => {
    weatherReady = true
    if (pendingWeatherData && weatherWin && !weatherWin.isDestroyed()) {
      weatherWin.webContents.send('weather:data', pendingWeatherData)
      pendingWeatherData = null
    }
  })
  if (isDev) {
    created.loadURL(process.env['ELECTRON_RENDERER_URL']! + '#weather')
  } else {
    created.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: 'weather' })
  }
  return created
}

function showWeatherData(data: unknown) {
  const win = getOrCreateWeatherWindow()
  if (weatherReady) {
    win.webContents.send('weather:data', data)
  } else {
    pendingWeatherData = data
  }
}

// ========== IPC ==========

registerCoreIpc({
  getDisplayWindow: () => displayWin,
  isDisplayReady: () => displayReady,
  getMainWindow: () => win,
  getChatWindow: () => chatWin,
  getOrCreateDisplayWindow,
  getOrCreateSearchWindow,
  showWeatherData,
  setWanderingByState: (state: string) => {
    isWandering = state !== 'listening' && state !== 'speaking' && state !== 'thinking'
  },
  onClickthroughChanged: (enabled: boolean) => {
    if (!win) return
    if (enabled) {
      win.setIgnoreMouseEvents(true, { forward: true })
      if (isInteracting) {
        const [x, y] = win.getPosition()
        currentX = x
        currentY = y
        pinnedUntil = Date.now() + 60 * 60 * 1000
        pickNewTarget()
      }
      isInteracting = false
    } else {
      win.setIgnoreMouseEvents(false)
      isInteracting = true
    }
  },
})

// ========== Email Detail Window ==========

const EMAIL_DETAIL_WIDTH = 580

ipcMain.on('email:open-detail', (_event, args: unknown) => {
  if (
    !args ||
    typeof args !== 'object' ||
    typeof (args as { account?: unknown }).account !== 'string' ||
    typeof (args as { id?: unknown }).id !== 'string'
  ) return
  const a = args as { account: string; id: string }
  pendingEmailDetailArgs = a

  if (emailDetailWin && !emailDetailWin.isDestroyed()) {
    if (emailDetailReady) {
      emailDetailWin.webContents.send('email:detail-args', a)
      pendingEmailDetailArgs = null
    }
    emailDetailWin.show()
    emailDetailWin.focus()
    return
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const w = EMAIL_DETAIL_WIDTH
  const h = Math.min(720, height - 80)
  // 右側のディスプレイウィンドウとは重ならないように左にずらす
  const x = Math.max(40, width - DISPLAY_WIDTH - DISPLAY_RIGHT_MARGIN - w - 16)

  emailDetailReady = false
  const created = new BrowserWindow({
    width: w,
    height: h,
    x,
    y: 60,
    transparent: true,
    frame: false,
    alwaysOnTop: false,
    hasShadow: false,
    skipTaskbar: false,
    resizable: true,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  emailDetailWin = created
  forwardRendererConsole(created, 'email-detail')

  created.on('closed', () => {
    if (emailDetailWin === created) {
      emailDetailWin = null
      emailDetailReady = false
    }
  })

  created.webContents.once('did-finish-load', () => {
    emailDetailReady = true
    if (pendingEmailDetailArgs && !created.isDestroyed()) {
      created.webContents.send('email:detail-args', pendingEmailDetailArgs)
      pendingEmailDetailArgs = null
    }
  })

  if (isDev) {
    created.loadURL(process.env['ELECTRON_RENDERER_URL']! + '#email-detail')
  } else {
    created.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: 'email-detail' })
  }
})

ipcMain.on('email:close-detail', () => {
  if (emailDetailWin && !emailDetailWin.isDestroyed()) emailDetailWin.hide()
})

// ========== Web View Window ==========

ipcMain.on('open-web-view', (_event, url: string) => {
  if (typeof url !== 'string' || !url.startsWith('http')) return
  if (!webWin || webWin.isDestroyed()) {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    const w = Math.min(1100, width - 100)
    const h = Math.min(800, height - 100)
    webWin = new BrowserWindow({
      width: w,
      height: h,
      x: Math.round(width / 2 - w / 2),
      y: Math.round(height / 2 - h / 2),
      frame: true,
      alwaysOnTop: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })
    webWin.on('closed', () => { webWin = null })
  }
  webWin.loadURL(url)
  webWin.focus()
})





// チャットウィンドウは通常クリックスルー。言語セレクター上にカーソルが来たときだけ
// 一時的に操作可能にする

// チャットウィンドウからの言語変更をロボットウィンドウへ転送して再接続させる

// ========== App lifecycle ==========

app.whenReady().then(async () => {
  // rendererのgetUserMediaリクエストを許可する
  const { session } = await import('electron')
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true)
    } else {
      callback(false)
    }
  })

  if (process.platform === 'darwin' && app.dock) {
    const img = nativeImage.createFromPath(iconPath)
    if (!img.isEmpty()) app.dock.setIcon(img)
  }

  registerSetupIpc()
  registerSettingsIpc()


  // macOS 標準のアプリケーションメニュー（Cmd+, でPreferences）
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { label: `About ${app.name}`, role: 'about' },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: () => openSettingsWindow(),
        },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
      ],
    },
  ]))

  // 必須権限チェック：問題あればセットアップ画面、問題なければ直接起動
  const micStatus = process.platform === 'darwin'
    ? systemPreferences.getMediaAccessStatus('microphone')
    : 'granted'
  const hasGeminiKey = !!(process.env.GEMINI_API_KEY)
  const needsSetup = micStatus !== 'granted' || !hasGeminiKey

  if (needsSetup) {
    createSetupWindow()
  } else {
    await initMemory(() => process.env.GEMINI_API_KEY)
    createWindow()
  }
})

app.on('before-quit', async (e) => {
  // shutdown を待ってから quit する。Electron は before-quit で event.preventDefault() + 後で再度 quit するパターンが必要
  if (shuttingDown) return
  shuttingDown = true
  e.preventDefault()
  try {
    await shutdownMemory()
  } finally {
    app.quit()
  }
})

app.on('window-all-closed', () => {
  uIOhook.stop()
  stopWandering()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
