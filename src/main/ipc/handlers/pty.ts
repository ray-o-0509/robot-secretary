import { ipcMain, type BrowserWindow } from 'electron'
import type { PtyId } from '../../skills/shell/pty'

type PtyMod = typeof import('../../skills/shell/pty')

type Deps = {
  getDisplayWindow: () => BrowserWindow | null
}

export function registerPtyHandlers(deps: Deps): { getPty: () => PtyMod | null } {
  let ptyMod: PtyMod | null = null

  const pendingByTab: Record<PtyId, string> = { claude: '', shell: '' }
  const flushScheduled: Record<PtyId, boolean> = { claude: false, shell: false }

  function scheduleFlush(id: PtyId) {
    if (flushScheduled[id]) return
    flushScheduled[id] = true
    setImmediate(() => {
      const out = pendingByTab[id]
      pendingByTab[id] = ''
      flushScheduled[id] = false
      const w = deps.getDisplayWindow()
      if (w && !w.isDestroyed()) w.webContents.send('pty:data', id, out)
    })
  }

  import('../../skills/shell/pty').then((mod) => {
    ptyMod = mod
    ;(['claude', 'shell'] as const).forEach((id) => {
      mod.ptySubscribeTo(id, (data) => {
        pendingByTab[id] += data
        scheduleFlush(id)
      })
    })
  })

  ipcMain.on('pty:write', (_event, id: PtyId, data: string) => ptyMod?.ptyWriteTo(id, data))
  ipcMain.on('pty:resize', (_event, id: PtyId, cols: number, rows: number) =>
    ptyMod?.ptyResizeTo(id, cols, rows),
  )
  ipcMain.handle('pty:get-buffer', (_event, id: PtyId) => ptyMod?.ptyGetBufferOf(id) ?? '')

  return { getPty: () => ptyMod }
}
