import { exec } from 'child_process'

export async function openApp(appName: string): Promise<{ ok: boolean; error?: string }> {
  const safe = appName.replace(/"/g, '').trim()
  if (!safe) return { ok: false, error: 'アプリ名が空' }

  return new Promise((resolve) => {
    exec(`open -a "${safe}"`, (err) => {
      if (err) resolve({ ok: false, error: err.message })
      else resolve({ ok: true })
    })
  })
}
