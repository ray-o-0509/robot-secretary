import { ipcMain, type BrowserWindow } from 'electron'

type Deps = {
  getMainWindow: () => BrowserWindow | null
  getCurrentRobotState: () => string
}

export function registerNotificationHandlers(deps: Deps): void {
  ipcMain.handle('notification:start-watch', () => {
    import('../../skills/notifications/index').then(({ startNotificationWatch }) => {
      startNotificationWatch(
        (notif) => {
          deps.getMainWindow()?.webContents.send('notification:incoming', [notif])
        },
        deps.getCurrentRobotState,
      )
    }).catch((e) => console.error('[notification] watch start failed:', e))
  })

  ipcMain.handle('notification:session-ready', async () => {
    const { notificationSessionReady } = await import('../../skills/notifications/index')
    return notificationSessionReady()
  })
}

export async function flushActiveNotifications(): Promise<{ appName: string; title?: string; body?: string }[]> {
  const { flushActiveNotifications: flush } = await import('../../skills/notifications/index')
  return flush()
}
