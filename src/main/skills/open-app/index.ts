import { exec } from 'child_process'
import { promisify } from 'util'
import { resolveAppName } from '../default-apps/index'

const execAsync = promisify(exec)

async function isAppRunning(appName: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `osascript -e 'application "${appName}" is running'`,
    )
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}

export async function openApp(appName: string): Promise<{ ok: boolean; error?: string }> {
  const resolved = await resolveAppName(appName)
  const safe = resolved.replace(/"/g, '').trim()
  if (!safe) return { ok: false, error: 'App name is empty' }

  const wasRunning = await isAppRunning(safe)

  return new Promise((resolve) => {
    exec(`open -a "${safe}"`, async (err) => {
      if (err) {
        console.error(`[open_app] error: ${safe} →`, err.message)
        resolve({ ok: false, error: err.message })
        return
      }
      if (!wasRunning) {
        await new Promise((r) => setTimeout(r, 3000))
      }
      resolve({ ok: true })
    })
  })
}
