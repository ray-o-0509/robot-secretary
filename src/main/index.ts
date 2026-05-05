import { app, BrowserWindow, desktopCapturer, ipcMain, Menu, nativeImage, screen, shell, systemPreferences } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as dotenv from 'dotenv'
import { uIOhook, UiohookKey } from 'uiohook-napi'
import { initMemory, shutdownMemory } from './memory'
import { registerCoreIpc } from './ipc/registerCoreIpc'
import { registerDisplayWindowFactory } from './display/registry'
import * as regionCapture from './regionCapture'
import { getSecretaryDb } from './auth/secretaryDb'
import { getStoredSessionToken, loginWithGoogle, resolveUserFromToken, type AppUser } from './auth/userAuth'
import { populateProcessEnv } from './auth/apiKeyStore'
import { initSettingsStore, loadSettings, saveSettings } from './auth/settingsStore'
import { registerAuthIpc } from './ipc/registerAuthIpc'
import { initStore } from './memory/store'
import { initGoogleAuth } from './skills/shared/googleAuth'

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

let loginWin: BrowserWindow | null = null
let currentUser: AppUser | null = null
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

// ========== Robot window/droid size ==========
const ROBOT_SIZE_MIN = 180
const ROBOT_SIZE_MAX = 600
const ROBOT_SIZE_DEFAULT = 300
const appearanceFilePath = path.join(app.getPath('userData'), 'appearance.json')

function clampRobotSize(n: number): number {
  if (!Number.isFinite(n)) return ROBOT_SIZE_DEFAULT
  return Math.max(ROBOT_SIZE_MIN, Math.min(ROBOT_SIZE_MAX, Math.round(n)))
}

let robotSize = ROBOT_SIZE_DEFAULT

function sendRobotVelocity(vx: number, vy: number, speed: number) {
  if (!win || win.isDestroyed()) return
  win.webContents.send('robot-velocity', { vx, vy, speed })
}

function sendRobotStopped() {
  sendRobotVelocity(0, 0, 0)
}

// ========== Settings Window ==========

function openSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus()
    return
  }
  settingsWin = new BrowserWindow({
    width: 720,
    height: 700,
    resizable: false,
    frame: false,
    titleBarStyle: 'hidden',
    transparent: false,
    alwaysOnTop: false,
    center: true,
    backgroundColor: '#0a0a14',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  forwardRendererConsole(settingsWin, 'settings')
  settingsWin.on('closed', () => {
    settingsWin = null
    // 進行中の OAuth フローを中断 (loopback サーバを閉じる)
    import('./google/oauthFlow').then(({ abortInFlight }) => abortInFlight('settings window closed')).catch(() => {/* noop */})
  })
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

  ipcMain.handle('settings:list-installed-apps', async () => {
    const fsp = await import('node:fs/promises')
    const dirs = [
      '/Applications',
      '/Applications/Utilities',
      '/System/Applications',
      '/System/Applications/Utilities',
      path.join(os.homedir(), 'Applications'),
    ]
    const found = new Map<string, string>()
    const walk = async (dir: string, depth: number) => {
      let entries: import('node:fs').Dirent[]
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.name.endsWith('.app')) {
          const name = entry.name.replace(/\.app$/, '')
          if (!found.has(name)) found.set(name, full)
        } else if (entry.isDirectory() && depth > 0 && !entry.name.startsWith('.')) {
          await walk(full, depth - 1)
        }
      }
    }
    await Promise.all(dirs.map((d) => walk(d, 1)))
    return Array.from(found.entries())
      .map(([name, p]) => ({ name, path: p }))
      .sort((a, b) => a.name.localeCompare(b.name))
  })

  ipcMain.handle('settings:get-app-icon', async (_event, appPath: unknown) => {
    if (typeof appPath !== 'string' || !appPath) return null
    try {
      const img = await app.getFileIcon(appPath, { size: 'small' })
      if (img.isEmpty()) return null
      return img.toDataURL()
    } catch {
      return null
    }
  })

  ipcMain.handle('settings:get-memory', async () => {
    const { loadMemory } = await import('./memory/store')
    const m = await loadMemory()
    // Return string[] for the settings UI (importance/lastSeen managed by AI curator only)
    return {
      facts: m.facts.map((x) => x.text),
      preferences: m.preferences.map((x) => x.text),
      ongoing_topics: m.ongoing_topics.map((x) => x.text),
      procedures: m.procedures,
      updatedAt: m.updatedAt,
    }
  })

  ipcMain.handle('settings:save-memory', async (_event, raw: unknown) => {
    const { saveMemory, loadMemory } = await import('./memory/store')
    const existing = await loadMemory()
    const sanitized = sanitizeMemoryInput(raw, existing)
    await saveMemory(sanitized)
    return {
      facts: sanitized.facts.map((x) => x.text),
      preferences: sanitized.preferences.map((x) => x.text),
      ongoing_topics: sanitized.ongoing_topics.map((x) => x.text),
      procedures: sanitized.procedures,
      updatedAt: sanitized.updatedAt,
    }
  })

  const memoryToSnapshot = (m: import('./memory/store').Memory) => ({
    facts: m.facts.map((x) => x.text),
    preferences: m.preferences.map((x) => x.text),
    ongoing_topics: m.ongoing_topics.map((x) => x.text),
    procedures: m.procedures,
    updatedAt: m.updatedAt,
  })

  ipcMain.handle(
    'settings:upsert-procedure',
    async (_event, oldName: string | null, name: string, description: string) => {
      const { upsertProcedure } = await import('./memory/store')
      const memory = await upsertProcedure(
        typeof oldName === 'string' ? oldName : null,
        String(name ?? ''),
        String(description ?? ''),
      )
      return memoryToSnapshot(memory)
    },
  )

  ipcMain.handle('settings:delete-procedure', async (_event, name: string) => {
    const { removeProcedure, loadMemory } = await import('./memory/store')
    await removeProcedure(String(name ?? ''))
    return memoryToSnapshot(await loadMemory())
  })

  ipcMain.handle(
    'settings:upsert-memory-item',
    async (_event, kind: string, oldText: string | null, text: string) => {
      const { upsertMemoryItem } = await import('./memory/store')
      if (kind !== 'facts' && kind !== 'preferences' && kind !== 'ongoing_topics') {
        throw new Error(`settings:upsert-memory-item: invalid kind ${kind}`)
      }
      const memory = await upsertMemoryItem(
        kind,
        typeof oldText === 'string' ? oldText : null,
        String(text ?? ''),
      )
      return memoryToSnapshot(memory)
    },
  )

  ipcMain.handle(
    'settings:delete-memory-item',
    async (_event, kind: string, text: string) => {
      const { removeMemoryItem } = await import('./memory/store')
      if (kind !== 'facts' && kind !== 'preferences' && kind !== 'ongoing_topics') {
        throw new Error(`settings:delete-memory-item: invalid kind ${kind}`)
      }
      const memory = await removeMemoryItem(kind, String(text ?? ''))
      return memoryToSnapshot(memory)
    },
  )

  ipcMain.handle('settings:reset-memory', async () => {
    const { saveMemory } = await import('./memory/store')
    const empty: import('./memory/store').Memory = {
      facts: [],
      preferences: [],
      ongoing_topics: [],
      procedures: [],
      session_summaries: [],
      updatedAt: new Date().toISOString(),
    }
    await saveMemory(empty)
    return {
      facts: [],
      preferences: [],
      ongoing_topics: [],
      procedures: [],
      updatedAt: empty.updatedAt,
    }
  })

  ipcMain.handle('settings:get-language', async () => {
    try {
      const s = await loadSettings()
      return s.language
    } catch {
      return 'ja-JP'
    }
  })

  ipcMain.handle('settings:get-secrets', async () => {
    const { getSecretsView } = await import('./skills/secrets/index')
    return await getSecretsView()
  })

  ipcMain.handle('settings:set-secret', async (_event, key: unknown, value: unknown) => {
    if (typeof key !== 'string' || typeof value !== 'string') {
      throw new Error('settings:set-secret requires (key: string, value: string)')
    }
    const { saveSecret, SECRET_KEYS, getSecretsView } = await import('./skills/secrets/index')
    if (!(SECRET_KEYS as readonly string[]).includes(key)) {
      throw new Error(`Unknown secret key: ${key}`)
    }
    await saveSecret(key as typeof SECRET_KEYS[number], value)
    return await getSecretsView()
  })

  ipcMain.handle('settings:get-secret-value', async (_event, key: unknown) => {
    if (typeof key !== 'string') return undefined
    const { getSecretValue, SECRET_KEYS } = await import('./skills/secrets/index')
    if (!(SECRET_KEYS as readonly string[]).includes(key)) return undefined
    return await getSecretValue(key as typeof SECRET_KEYS[number])
  })

  ipcMain.handle('settings:list-skills', async () => {
    const { SKILL_REGISTRY } = await import('../config/skills')
    const { loadSkillsEnabled } = await import('./skills/skill-toggle/index')
    const enabled = await loadSkillsEnabled()
    return SKILL_REGISTRY.map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
      tools: s.tools,
      enabled: enabled[s.id] ?? s.defaultEnabled,
      secrets: s.secrets ?? [],
    }))
  })

  ipcMain.handle('settings:list-core-secrets', async () => {
    const { CORE_SECRETS } = await import('../config/skills')
    return CORE_SECRETS
  })

  ipcMain.handle('settings:set-skill-enabled', async (_event, id: unknown, enabled: unknown) => {
    if (typeof id !== 'string' || typeof enabled !== 'boolean') {
      throw new Error('settings:set-skill-enabled requires (id: string, enabled: boolean)')
    }
    const { setSkillEnabled } = await import('./skills/skill-toggle/index')
    return await setSkillEnabled(id, enabled)
  })

  ipcMain.handle('appearance:get-robot-size', () => ({
    size: robotSize,
    min: ROBOT_SIZE_MIN,
    max: ROBOT_SIZE_MAX,
    default: ROBOT_SIZE_DEFAULT,
  }))

  ipcMain.handle('appearance:set-robot-size', async (_event, raw: unknown) => {
    const next = clampRobotSize(typeof raw === 'number' ? raw : Number(raw))
    robotSize = next
    await saveSettings({ robotSize: next }).catch((e) => console.error('Failed to save robotSize:', e))
    if (win && !win.isDestroyed()) {
      const [x, y] = win.getPosition()
      win.setBounds({ x, y, width: next, height: next })
      currentX = x
      currentY = y
      targetX = x
      targetY = y
    }
    return { size: next }
  })

  ipcMain.on('set-language', (_event, code: string) => {
    saveSettings({ language: String(code) }).catch((e) => console.error('Failed to save language:', e))
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('language-change', code)
    }
  })

  // ── Google アカウント連携 ───────────────────────────────────────────────
  ipcMain.handle('google-accounts:check-setup', async () => {
    const { checkSetup } = await import('./google/oauthFlow')
    return checkSetup()
  })

  ipcMain.handle('google-accounts:list', async () => {
    const { listAccountsForUi } = await import('./google/oauthFlow')
    return listAccountsForUi()
  })

  ipcMain.handle('google-accounts:add', async (_event, args?: { loginHint?: string; scopes?: string[] }) => {
    const { addGoogleAccount } = await import('./google/oauthFlow')
    return await addGoogleAccount({ loginHint: args?.loginHint, scopes: args?.scopes })
  })

  ipcMain.handle('google-accounts:remove', async (_event, email: string) => {
    const { removeGoogleAccount } = await import('./google/oauthFlow')
    await removeGoogleAccount(String(email))
    return { ok: true }
  })

  ipcMain.handle('google-accounts:abort', async () => {
    const { abortInFlight } = await import('./google/oauthFlow')
    abortInFlight('user cancelled')
    return { ok: true }
  })
}

function sanitizeMemoryInput(
  raw: unknown,
  existing: import('./memory/store').Memory,
): import('./memory/store').Memory {
  type MemoryItem = import('./memory/store').MemoryItem
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const today = new Date().toISOString().slice(0, 10)

  // UI sends string[]; convert to MemoryItem[], preserving importance/lastSeen for unchanged items
  const toItems = (v: unknown, existingItems: MemoryItem[]): MemoryItem[] => {
    if (!Array.isArray(v)) return []
    return v
      .map((x) => String(x ?? '').trim())
      .filter(Boolean)
      .map((text) => {
        const prev = existingItems.find((e) => e.text === text)
        return prev ?? { text, importance: 2 as const, lastSeen: today }
      })
  }

  const procs = Array.isArray(r.procedures)
    ? (r.procedures as unknown[]).flatMap((p) => {
        if (!p || typeof p !== 'object') return []
        const o = p as Record<string, unknown>
        const name = String(o.name ?? '').trim()
        const description = String(o.description ?? '').trim()
        if (!name || !description) return []
        const now = new Date().toISOString()
        return [{
          name,
          description,
          learnedAt: typeof o.learnedAt === 'string' ? o.learnedAt : now,
          updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : now,
        }]
      })
    : []

  return {
    facts: toItems(r.facts, existing.facts),
    preferences: toItems(r.preferences, existing.preferences),
    ongoing_topics: toItems(r.ongoing_topics, existing.ongoing_topics),
    procedures: procs,
    session_summaries: existing.session_summaries,
    updatedAt: new Date().toISOString(),
  }
}

// ========== Login Window ==========

function createLoginWindow() {
  if (loginWin && !loginWin.isDestroyed()) { loginWin.focus(); return }
  loginWin = new BrowserWindow({
    width: 420,
    height: 320,
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
  forwardRendererConsole(loginWin, 'login')
  if (isDev) {
    loginWin.loadURL(process.env['ELECTRON_RENDERER_URL']! + '#login')
  } else {
    loginWin.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: 'login' })
  }
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
      geminiApiKey: !!process.env.GEMINI_API_KEY,
      ticktickToken: !!process.env.TICKTICK_ACCESS_TOKEN,
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
  currentY = Math.floor(height - robotSize - 40)
  targetX = currentX
  targetY = currentY

  win = new BrowserWindow({
    width: robotSize,
    height: robotSize,
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
  // Region capture overlay (Alt+Shift+drag)
  regionCapture.init(win)

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

// Modifier state: 'none' | 'alt' (audio-only PTT) | 'alt+shift' (PTT + region overlay)
let pttModifiers: 'none' | 'alt' | 'alt+shift' = 'none'
let pttStuckTimer: NodeJS.Timeout | null = null
const PTT_STUCK_TIMEOUT_MS = 30_000

function armStuckTimer() {
  if (pttStuckTimer) clearTimeout(pttStuckTimer)
  pttStuckTimer = setTimeout(() => {
    if (!pttActive) return
    console.warn('[PTT:main] stuck detected, force stopping')
    pttActive = false
    pttModifiers = 'none'
    win?.webContents.send('ptt-stop')
    regionCapture.hide()
  }, PTT_STUCK_TIMEOUT_MS)
}

function disarmStuckTimer() {
  if (pttStuckTimer) {
    clearTimeout(pttStuckTimer)
    pttStuckTimer = null
  }
}

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
    if (e.keycode === UiohookKey.Alt && !pttActive) {
      // 左Option のみ（右Option = 3640 は除外）
      pttActive = true
      pttModifiers = e.shiftKey ? 'alt+shift' : 'alt'
      armStuckTimer()
      console.log('[PTT:main] keydown alt modifiers=', pttModifiers)
      win?.webContents.send('ptt-start')
      if (pttModifiers === 'alt+shift') regionCapture.show()
      return
    }
    // Shift を後から足した場合: PTT 中なら overlay を出す
    if (e.keycode === UiohookKey.Shift && pttActive && pttModifiers === 'alt') {
      pttModifiers = 'alt+shift'
      console.log('[PTT:main] shift added, showing overlay')
      regionCapture.show()
      return
    }
    // ESC: overlay 表示中のみ rect クリア（PTT 自体は止めない）
    if (e.keycode === UiohookKey.Escape && pttModifiers === 'alt+shift') {
      console.log('[PTT:main] ESC → clear region')
      regionCapture.broadcastClear()
      return
    }
  })

  uIOhook.on('keyup', (e) => {
    // Shift だけ離した: overlay 閉じるが PTT 音声は継続
    if (e.keycode === UiohookKey.Shift && pttActive && pttModifiers === 'alt+shift') {
      pttModifiers = 'alt'
      console.log('[PTT:main] keyup shift → hide overlay, audio continues')
      regionCapture.hide()
      return
    }
    // Alt を離した: PTT 完全終了
    if (e.keycode === UiohookKey.Alt && pttActive) {
      console.log('[PTT:main] keyup alt')
      pttActive = false
      pttModifiers = 'none'
      disarmStuckTimer()
      win?.webContents.send('ptt-stop')
      regionCapture.hide()
      return
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
  const margin = 50
  const displays = screen.getAllDisplays()
  const primaryId = screen.getPrimaryDisplay().id
  // モニターをランダムに選ぶ（全モニターを等確率で）
  const display = displays[Math.floor(Math.random() * displays.length)]
  const { x: dx, y: dy, width, height } = display.workArea

  let minX = dx + margin
  let maxX = dx + width - robotSize - margin

  // プライマリモニターのときだけチャット/表示パネル回避を適用
  if (display.id === primaryId) {
    const chatRight = 24 + 360 + 24
    minX = Math.max(minX, dx + chatRight)
    const displayVisible = displayWin && !displayWin.isDestroyed() && displayWin.isVisible()
    if (displayVisible) {
      maxX = dx + width - DISPLAY_WIDTH - DISPLAY_RIGHT_MARGIN - robotSize - margin
    }
  }

  const span = Math.max(1, maxX - minX)
  targetX = minX + Math.random() * span
  targetY = dy + margin + Math.random() * Math.max(1, height - robotSize - margin * 2)
}

function startWandering() {
  pickNewTarget()

  let lastTime = Date.now()
  let lastSentX = Number.NaN
  let lastSentY = Number.NaN
  let nextTargetPending = false
  let lastVelSend = 0

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
        sendRobotStopped()
        setTimeout(() => {
          nextTargetPending = false
          pickNewTarget()
        }, 300 + Math.random() * 700)
      }
      return
    }

    // 時間ベースの指数イージング + 最低速度フロア
    // rate=0.5 でふわふわ感を維持しつつ、目標付近で止まって見えないよう
    // 最低 60px/s を保証する
    const rate = 0.5
    const factor = 1 - Math.exp(-rate * dt)
    const expMove = dist * factor        // 指数収束の移動量
    const minMove = 60 * dt              // 最低速度: 60px/s
    const moveAmount = Math.min(Math.max(expMove, minMove), dist)
    currentX += (dx / dist) * moveAmount
    currentY += (dy / dist) * moveAmount

    // 整数化した位置が前回と同じなら setPosition は呼ばない（透過ウィンドウのIPCコストを節約）
    const ix = Math.round(currentX)
    const iy = Math.round(currentY)
    if (ix !== lastSentX || iy !== lastSentY) {
      win.setPosition(ix, iy)
      lastSentX = ix
      lastSentY = iy
    }

    // 移動速度・方向をレンダラーへ送信（10Hz throttle）
    const nowVel = Date.now()
    if (nowVel - lastVelSend >= 100) {
      lastVelSend = nowVel
      const vx = (dx / dist) * (moveAmount / dt)
      const vy = (dy / dist) * (moveAmount / dt)
      sendRobotVelocity(vx, vy, Math.hypot(vx, vy))
    }
  }, 16) // ≒ 60fps
}

function stopWandering() {
  sendRobotStopped()
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
          if (!isWandering) sendRobotStopped()
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

// Expose the display-window factory to the skills dispatcher so executeTool('show_panel')
// (called by the Claude API agent) can reach the same window Gemini uses.
registerDisplayWindowFactory(getOrCreateDisplayWindow)

registerCoreIpc({
  getDisplayWindow: () => displayWin,
  isDisplayReady: () => displayReady,
  getMainWindow: () => win,
  getChatWindow: () => chatWin,
  getOrCreateDisplayWindow,
  getOrCreateSearchWindow,
  showWeatherData,
  setWanderingByState: (state: string) => {
    const shouldWander = state !== 'listening' && state !== 'speaking' && state !== 'thinking'
    if (!shouldWander) sendRobotStopped()
    isWandering = shouldWander
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
      sendRobotStopped()
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

  // ── Turso Auth ────────────────────────────────────────────────────────────
  const db = getSecretaryDb()

  // Check for an existing session in Keychain
  let token = await getStoredSessionToken()
  if (token) {
    currentUser = await resolveUserFromToken(token, db)
    if (!currentUser) token = null  // stale
  }

  // No valid session → show login window and await Google OAuth
  if (!currentUser) {
    createLoginWindow()
    try {
      currentUser = await loginWithGoogle(db)
      console.log('[auth] Logged in as:', currentUser.email)
    } finally {
      if (loginWin && !loginWin.isDestroyed()) { loginWin.close(); loginWin = null }
    }
  } else {
    console.log('[auth] Session restored:', currentUser.email)
  }

  // Populate process.env with all API keys from DB (so all tool modules continue working)
  await populateProcessEnv(currentUser.id, db)
  console.log('[auth] process.env populated with DB keys')

  // Initialize DB-backed stores
  initStore(currentUser.id, db)
  initSettingsStore(currentUser.id, db)
  await initGoogleAuth(currentUser.id, db)
  const settings = await loadSettings()
  robotSize = clampRobotSize(settings.robotSize)

  // Register auth IPC
  registerAuthIpc({
    db,
    getUser: () => currentUser,
    onLoginSuccess: (user) => { currentUser = user },
  })


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
  const needsSetup = micStatus !== 'granted'

  if (needsSetup) {
    createSetupWindow()
  } else {
    await initMemory(() => process.env.GEMINI_API_KEY)
    createWindow()
    // Pre-launch Claude Code in its dedicated PTY so run_claude is paste-and-enter
    // instead of cold-starting cc and racing the 1.5s sleep.
    import('./skills/shell/claudePty').then(({ launchClaudePty }) => launchClaudePty()).catch(() => {})
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
  import('./skills/shell/pty').then(({ ptyKillAll }) => ptyKillAll()).catch(() => {/* not loaded */})
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
