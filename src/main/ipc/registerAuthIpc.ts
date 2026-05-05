import { ipcMain } from 'electron'
import type { Client } from '@libsql/client'
import type { AppUser } from '../auth/userAuth'
import { loginWithGoogle, clearSessionToken } from '../auth/userAuth'
import { saveApiKey, deleteApiKey, listApiKeyNames, populateProcessEnv } from '../auth/apiKeyStore'

type Deps = {
  getDb: () => Client
  getUser: () => AppUser | null
  onLoginSuccess: (user: AppUser) => void | Promise<void>
}

export function registerAuthIpc(deps: Deps): void {
  const { getDb, getUser, onLoginSuccess } = deps

  ipcMain.handle('auth:get-status', () => {
    const user = getUser()
    if (!user) return { isLoggedIn: false }
    return { isLoggedIn: true, email: user.email, displayName: user.displayName, avatarUrl: user.avatarUrl }
  })

  ipcMain.handle('auth:login', async () => {
    const user = await loginWithGoogle()
    await onLoginSuccess(user)
    return { email: user.email, displayName: user.displayName, avatarUrl: user.avatarUrl }
  })

  ipcMain.handle('auth:logout', async () => {
    await clearSessionToken()
    const { app } = await import('electron')
    app.quit()
  })

  ipcMain.handle('auth:list-api-keys', async () => {
    const user = getUser()
    if (!user) throw new Error('Not authenticated')
    return listApiKeyNames(getDb())
  })

  ipcMain.handle('auth:set-api-key', async (_event, name: string, value: string) => {
    const user = getUser()
    if (!user) throw new Error('Not authenticated')
    await saveApiKey(user.id, name, value, getDb())
    process.env[name] = value
    if (name === 'GEMINI_API_KEY') process.env['VITE_GEMINI_API_KEY'] = value
  })

  ipcMain.handle('auth:delete-api-key', async (_event, name: string) => {
    const user = getUser()
    if (!user) throw new Error('Not authenticated')
    await deleteApiKey(name, getDb())
    delete process.env[name]
  })
}
