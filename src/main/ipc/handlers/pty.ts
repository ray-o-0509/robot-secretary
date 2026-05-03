import { ipcMain, type BrowserWindow } from 'electron'

type PtyMod = typeof import('../../skills/shell/pty')

type Deps = {
  getDisplayWindow: () => BrowserWindow | null
}

export function registerPtyHandlers(deps: Deps): { getPty: () => PtyMod | null } {
  let ptyMod: PtyMod | null = null
  let pendingPtyData = ''
  let ptyFlushScheduled = false

  // Coalesce per-keystroke broadcasts so bursty output produces fewer IPC sends.
  import('../../skills/shell/pty').then((mod) => {
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

  return { getPty: () => ptyMod }
}
