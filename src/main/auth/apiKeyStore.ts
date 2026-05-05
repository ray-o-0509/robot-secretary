import * as crypto from 'node:crypto'
import type { Client } from '@libsql/client'
import { encrypt, decrypt, getDerivedKey } from './crypto'

export const KNOWN_API_KEYS = [
  'GEMINI_API_KEY',
  'ANTHROPIC_API_KEY',
  'TICKTICK_ACCESS_TOKEN',
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
  'TAVILY_API_KEY',
] as const

export type ApiKeyName = (typeof KNOWN_API_KEYS)[number]

// userId is still needed for key derivation (defense in depth)
export async function loadApiKeys(userId: string, db: Client): Promise<Record<string, string>> {
  const result = await db.execute('SELECT key_name, ciphertext FROM api_keys')
  const key = await getDerivedKey(userId)
  const out: Record<string, string> = {}
  for (const row of result.rows) {
    if (!(KNOWN_API_KEYS as readonly string[]).includes(row.key_name as string)) continue
    try {
      out[row.key_name as string] = decrypt(row.ciphertext as string, key)
    } catch (e) {
      console.error(`[apiKeyStore] Failed to decrypt ${row.key_name as string}:`, e)
    }
  }
  return out
}

export async function saveApiKey(userId: string, keyName: string, value: string, db: Client): Promise<void> {
  if (!(KNOWN_API_KEYS as readonly string[]).includes(keyName) || keyName.startsWith('VITE_')) {
    throw new Error(`Unknown API key: ${keyName}`)
  }
  const key = await getDerivedKey(userId)
  const ciphertext = encrypt(value, key)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.execute({
    sql: `INSERT INTO api_keys (id, key_name, ciphertext, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(key_name) DO UPDATE SET ciphertext=excluded.ciphertext, updated_at=excluded.updated_at`,
    args: [id, keyName, ciphertext, now],
  })
}

export async function deleteApiKey(keyName: string, db: Client): Promise<void> {
  if (!(KNOWN_API_KEYS as readonly string[]).includes(keyName) || keyName.startsWith('VITE_')) {
    throw new Error(`Unknown API key: ${keyName}`)
  }
  await db.execute({ sql: 'DELETE FROM api_keys WHERE key_name = ?', args: [keyName] })
}

export async function listApiKeyNames(db: Client): Promise<{ name: string; isSet: boolean }[]> {
  const result = await db.execute('SELECT key_name FROM api_keys')
  const setKeys = new Set(result.rows.map((r) => r.key_name as string))
  return KNOWN_API_KEYS.map((name) => ({ name, isSet: setKeys.has(name) }))
}

export async function populateProcessEnv(userId: string, db: Client): Promise<void> {
  const keys = await loadApiKeys(userId, db)
  for (const name of KNOWN_API_KEYS) delete process.env[name]
  delete process.env['VITE_GEMINI_API_KEY']
  for (const [name, value] of Object.entries(keys)) {
    process.env[name] = value
    if (name === 'GEMINI_API_KEY') process.env['VITE_GEMINI_API_KEY'] = value
  }
}
