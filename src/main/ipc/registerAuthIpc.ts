import { ipcMain } from 'electron'
import type { Client } from '@libsql/client'
import type { AppUser } from '../auth/userAuth'
import { loginWithGoogle, clearSessionToken } from '../auth/userAuth'
import { KNOWN_API_KEYS, saveApiKey, deleteApiKey, listApiKeyNames } from '../auth/apiKeyStore'

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

  ipcMain.handle('auth:relaunch', async () => {
    const { app } = await import('electron')
    app.relaunch()
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
    if (!(KNOWN_API_KEYS as readonly string[]).includes(name) || name.startsWith('VITE_')) {
      throw new Error(`Unknown API key: ${name}`)
    }
    const trimmed = value.trim()
    if (!trimmed) throw new Error('API key value is empty')
    await saveApiKey(user.id, name, trimmed, getDb())
    process.env[name] = trimmed
    if (name === 'GEMINI_API_KEY') process.env['VITE_GEMINI_API_KEY'] = trimmed
  })

  ipcMain.handle('auth:delete-api-key', async (_event, name: string) => {
    const user = getUser()
    if (!user) throw new Error('Not authenticated')
    if (!(KNOWN_API_KEYS as readonly string[]).includes(name) || name.startsWith('VITE_')) {
      throw new Error(`Unknown API key: ${name}`)
    }
    await deleteApiKey(name, getDb())
    delete process.env[name]
    if (name === 'GEMINI_API_KEY') delete process.env['VITE_GEMINI_API_KEY']
  })
}
