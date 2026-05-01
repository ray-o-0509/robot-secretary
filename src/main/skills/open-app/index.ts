import { exec } from 'child_process'
import { resolveAppName } from '../default-apps/index'

export async function openApp(appName: string): Promise<{ ok: boolean; error?: string }> {
  const resolved = await resolveAppName(appName)
  const safe = resolved.replace(/"/g, '').trim()
  if (!safe) return { ok: false, error: 'App name is empty' }

  return new Promise((resolve) => {
    exec(`open -a "${safe}"`, (err) => {
      if (err) resolve({ ok: false, error: err.message })
      else resolve({ ok: true })
    })
  })
}
