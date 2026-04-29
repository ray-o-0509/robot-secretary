import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, systemPreferences } from 'electron'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { uIOhook, UiohookKey } from 'uiohook-napi'

// .env と .env.local の両方をロード
dotenv.config({ path: path.join(__dirname, '../.env') })
dotenv.config({ path: path.join(__dirname, '../.env.local'), override: true })

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

const iconPath = path.join(__dirname, '../../assets/icon.png')

let win: BrowserWindow | null = null
let chatWin: BrowserWindow | null = null
let wanderInterval: NodeJS.Timeout | null = null
let targetX = 0
let targetY = 0
let currentX = 0
let currentY = 0
let isWandering = true
let isInteracting = false
let isMuted = false
let pttActive = false

// ========== Window ==========

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  currentX = Math.floor(width / 2 - 150)
  currentY = Math.floor(height / 2 - 150)
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
  createChatWindow()

  // dev中はDevToolsを開く
  if (isDev) win.webContents.openDevTools({ mode: 'detach' })
}

function createChatWindow() {
  const { height } = screen.getPrimaryDisplay().workAreaSize
  const chatW = 360
  const chatH = Math.min(560, height - 80)

  chatWin = new BrowserWindow({
    width: chatW,
    height: chatH,
    x: 24,
    y: 40,
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

  chatWin.setIgnoreMouseEvents(true, { forward: true })
  chatWin.on('closed', () => { chatWin = null })

  if (isDev) {
    chatWin.loadURL(process.env['ELECTRON_RENDERER_URL']! + '#chat')
  } else {
    chatWin.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: 'chat' })
  }
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
      pttActive = true
      win?.webContents.send('ptt-start')
    }
  })

  uIOhook.on('keyup', (e) => {
    if (e.keycode === UiohookKey.Alt && pttActive) {
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

// ========== 画面内ふわふわ移動 ==========

function pickNewTarget() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const margin = 50
  // チャットウィンドウ（左上）と被らないよう、ロボットの可動域を右側に制限
  const chatRight = 24 + 360 + 24
  const minX = Math.max(margin, chatRight)
  targetX = minX + Math.random() * Math.max(1, width - 300 - minX - margin)
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
        label: isWandering ? '移動を止める' : '移動を再開する',
        click: () => {
          isWandering = !isWandering
          if (isWandering && !wanderInterval) startWandering()
        },
      },
      {
        label: isMuted ? 'ミュート解除' : 'ミュート',
        click: () => {
          isMuted = !isMuted
          win?.webContents.send('mute-changed', isMuted)
        },
      },
      { type: 'separator' },
      { label: '設定', click: () => win?.webContents.send('open-settings') },
      { type: 'separator' },
      { label: '終了', click: () => app.quit() },
    ])
    menu.popup({ window: win! })
  })
}

// ========== IPC: 秘書ツール ==========

ipcMain.handle('call-tool', async (_event, toolName: string, args: Record<string, unknown>) => {
  try {
    switch (toolName) {
      case 'get_slack_unread': {
        const { getUnreadMessages } = await import('./tools/slack')
        return await getUnreadMessages(args.channel as string | undefined)
      }
      case 'send_slack_message': {
        const { sendMessage } = await import('./tools/slack')
        return await sendMessage(args.channel as string, args.text as string)
      }
      case 'get_gmail_unread': {
        const { getUnreadEmails } = await import('./tools/gmail')
        return await getUnreadEmails(args.maxResults as number | undefined)
      }
      case 'get_calendar_events': {
        const { getTodayEvents } = await import('./tools/calendar')
        return await getTodayEvents()
      }
      case 'get_notion_tasks': {
        const { getMyTasks } = await import('./tools/notion')
        return await getMyTasks(args.status as string | undefined)
      }
      default:
        return { error: `Unknown tool: ${toolName}` }
    }
  } catch (err) {
    return { error: String(err) }
  }
})

ipcMain.on('chat-messages', (_event, messages: unknown) => {
  chatWin?.webContents.send('chat-messages', messages)
})

ipcMain.on('set-clickthrough', (_event, enabled: boolean) => {
  if (!win) return
  if (enabled) {
    win.setIgnoreMouseEvents(true, { forward: true })
    if (isInteracting) {
      // ユーザーがドラッグした位置を放浪ロジックに反映
      const [x, y] = win.getPosition()
      currentX = x
      currentY = y
      pickNewTarget()
    }
    isInteracting = false
  } else {
    win.setIgnoreMouseEvents(false)
    isInteracting = true
  }
})

ipcMain.on('robot-state', (_event, state: string) => {
  if (state === 'listening' || state === 'speaking' || state === 'thinking') {
    isWandering = false
  } else {
    isWandering = true
  }
  chatWin?.webContents.send('robot-state', state)
})

// ========== App lifecycle ==========

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    const img = nativeImage.createFromPath(iconPath)
    if (!img.isEmpty()) app.dock.setIcon(img)
  }
  createWindow()
})

app.on('window-all-closed', () => {
  uIOhook.stop()
  stopWandering()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
