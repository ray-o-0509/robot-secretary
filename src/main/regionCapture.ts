import { BrowserWindow, ipcMain, screen } from 'electron'
import * as path from 'path'
import { captureRegion, type LogicalRect } from './screenshot'
import { createLogger } from './logger'

const log = createLogger('regionCapture')

type Rect = LogicalRect & { displayId: number }

const OVERLAY_WAIT_FRAMES_MS = 60 // wait several frames for compositor to drop overlay

let robotWin: BrowserWindow | null = null
let overlayWindows: Map<number, BrowserWindow> = new Map()
let visible = false
let captureInFlight = false

export function init(win: BrowserWindow) {
  robotWin = win
  registerIpc()
  // Pre-create overlay windows hidden so show() is instant
  preCreateOverlays()

  // Re-create on display config changes
  screen.on('display-added', () => preCreateOverlays())
  screen.on('display-removed', () => preCreateOverlays())
  screen.on('display-metrics-changed', () => preCreateOverlays())
}

function preCreateOverlays() {
  // Destroy stale ones
  for (const w of overlayWindows.values()) {
    if (!w.isDestroyed()) w.destroy()
  }
  overlayWindows = new Map()

  const displays = screen.getAllDisplays()
  const isDev = !!process.env['ELECTRON_RENDERER_URL']
  for (const d of displays) {
    const w = new BrowserWindow({
      x: d.bounds.x,
      y: d.bounds.y,
      width: d.bounds.width,
      height: d.bounds.height,
      transparent: true,
      frame: false,
      hasShadow: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        additionalArguments: [`--robot-display-id=${d.id}`],
      },
    })
    w.setAlwaysOnTop(true, 'screen-saver')
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    if (isDev) {
      w.loadURL(process.env['ELECTRON_RENDERER_URL']! + '#region-overlay')
    } else {
      w.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: 'region-overlay' })
    }

    overlayWindows.set(d.id, w)
  }
}

export function show() {
  if (visible) return
  visible = true
  for (const w of overlayWindows.values()) {
    if (w.isDestroyed()) continue
    w.showInactive() // do not steal focus
    w.setOpacity(1)
  }
}

export function hide() {
  if (!visible) return
  visible = false
  for (const w of overlayWindows.values()) {
    if (w.isDestroyed()) continue
    w.hide()
  }
}

export function broadcastClear() {
  for (const w of overlayWindows.values()) {
    if (w.isDestroyed()) continue
    w.webContents.send('region-overlay:clear')
  }
}

function registerIpc() {
  ipcMain.handle('region-overlay:get-display-id', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender)
    if (!w) return -1
    for (const [id, candidate] of overlayWindows.entries()) {
      if (candidate.id === w.id) return id
    }
    return -1
  })

  ipcMain.on('region-overlay:report-rect', async (_event, rectIn: unknown) => {
    if (captureInFlight) return
    const rect = sanitizeRect(rectIn)
    if (!rect) return
    captureInFlight = true
    try {
      // Hide overlay so it does not get captured
      for (const w of overlayWindows.values()) {
        if (!w.isDestroyed()) w.setOpacity(0)
      }
      // Wait several frames for compositor (1 frame is not enough on macOS)
      await delay(OVERLAY_WAIT_FRAMES_MS)

      const { base64, mediaType } = await captureRegion(
        { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
        rect.displayId,
      )

      if (robotWin && !robotWin.isDestroyed()) {
        robotWin.webContents.send('region-image', { base64, mediaType })
      }

      // Notify overlay that capture happened (for visual feedback)
      const overlay = overlayWindows.get(rect.displayId)
      if (overlay && !overlay.isDestroyed()) {
        overlay.webContents.send('region-overlay:captured')
      }
    } catch (err) {
      log.error('capture failed:', err)
    } finally {
      // Restore overlay opacity if still visible (Option still held)
      if (visible) {
        for (const w of overlayWindows.values()) {
          if (!w.isDestroyed()) w.setOpacity(1)
        }
      }
      captureInFlight = false
    }
  })
}

function sanitizeRect(raw: unknown): Rect | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const x = Number(r.x)
  const y = Number(r.y)
  const w = Number(r.w)
  const h = Number(r.h)
  const displayId = Number(r.displayId)
  if (![x, y, w, h, displayId].every(Number.isFinite)) return null
  if (w < 1 || h < 1) return null
  return { x, y, w, h, displayId }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function destroy() {
  for (const w of overlayWindows.values()) {
    if (!w.isDestroyed()) w.destroy()
  }
  overlayWindows.clear()
  robotWin = null
  visible = false
}
