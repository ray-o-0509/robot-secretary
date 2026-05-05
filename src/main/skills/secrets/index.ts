import { app } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'

// Secret keys that may be configured via Settings.
// Google credentials are intentionally not part of this store — those go
// through the OAuth flow under ~/.config/robot-secretary/google-tokens/.
export const SECRET_KEYS = [
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'TICKTICK_ACCESS_TOKEN',
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
  'TAVILY_API_KEY',
] as const

export type SecretKey = (typeof SECRET_KEYS)[number]
export type SecretsMap = Partial<Record<SecretKey, string>>

function configPath(): string {
  return path.join(app.getPath('userData'), 'conversations', 'secrets.json')
}

let cache: SecretsMap | null = null

function envFallback(): SecretsMap {
  const out: SecretsMap = {}
  for (const k of SECRET_KEYS) {
    const v = process.env[k]
    if (typeof v === 'string' && v.trim()) out[k] = v
  }
  return out
}

export async function loadSecrets(): Promise<SecretsMap> {
  if (cache) return { ...cache }
  let stored: SecretsMap = {}
  try {
    const raw = await fs.readFile(configPath(), 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    for (const k of SECRET_KEYS) {
      const v = parsed[k]
      if (typeof v === 'string' && v.trim()) stored[k] = v
    }
  } catch { /* file missing — fall back to env */ }
  // Merge: stored values win, env fills the gaps.
  const merged: SecretsMap = { ...envFallback(), ...stored }
  cache = merged
  return { ...merged }
}

export async function saveSecret(key: SecretKey, value: string): Promise<SecretsMap> {
  const current = await loadSecrets()
  const trimmed = value.trim()
  if (trimmed) current[key] = trimmed
  else delete current[key]
  // Persist only the explicit overrides (everything in `current` except plain env values).
  // Simplification: persist everything currently in `current`, since env-fallback values
  // would otherwise "freeze" — but writing a value that already matches env is harmless.
  const file = configPath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`
  await fs.writeFile(tmp, JSON.stringify(current, null, 2), 'utf8')
  await fs.rename(tmp, file)
  cache = current
  return { ...current }
}

export function getSecretSync(key: SecretKey): string | undefined {
  if (cache && cache[key]) return cache[key]
  const env = process.env[key]
  return typeof env === 'string' && env.trim() ? env : undefined
}

// View safe for sending to the renderer: redacts everything but length / preview.
export type SecretsView = Record<SecretKey, { set: boolean; preview: string }>

export async function getSecretsView(): Promise<SecretsView> {
  const all = await loadSecrets()
  const out = {} as SecretsView
  for (const k of SECRET_KEYS) {
    const v = all[k]
    out[k] = v
      ? { set: true, preview: v.length <= 8 ? '••••' : `${v.slice(0, 4)}…${v.slice(-4)}` }
      : { set: false, preview: '' }
  }
  return out
}

// Plain map for renderer-side consumers that need the actual value (e.g. Gemini Live key).
// Caller should not log this.
export async function getSecretValue(key: SecretKey): Promise<string | undefined> {
  const all = await loadSecrets()
  return all[key]
}
