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

export async function loadApiKeys(userId: string, db: Client): Promise<Record<string, string>> {
  const result = await db.execute({
    sql: 'SELECT key_name, ciphertext FROM api_keys WHERE user_id = ?',
    args: [userId],
  })
  const key = await getDerivedKey(userId)
  const out: Record<string, string> = {}
  for (const row of result.rows) {
    try {
      out[row.key_name as string] = decrypt(row.ciphertext as string, key)
    } catch (e) {
      console.error(`[apiKeyStore] Failed to decrypt key ${row.key_name as string}:`, e)
    }
  }
  return out
}

export async function saveApiKey(userId: string, keyName: string, value: string, db: Client): Promise<void> {
  const key = await getDerivedKey(userId)
  const ciphertext = encrypt(value, key)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.execute({
    sql: `INSERT INTO api_keys (id, user_id, key_name, ciphertext, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id, key_name) DO UPDATE SET ciphertext=excluded.ciphertext, updated_at=excluded.updated_at`,
    args: [id, userId, keyName, ciphertext, now],
  })
}

export async function deleteApiKey(userId: string, keyName: string, db: Client): Promise<void> {
  await db.execute({
    sql: 'DELETE FROM api_keys WHERE user_id = ? AND key_name = ?',
    args: [userId, keyName],
  })
}

export async function listApiKeyNames(userId: string, db: Client): Promise<{ name: string; isSet: boolean }[]> {
  const result = await db.execute({
    sql: 'SELECT key_name FROM api_keys WHERE user_id = ?',
    args: [userId],
  })
  const setKeys = new Set(result.rows.map((r) => r.key_name as string))
  return KNOWN_API_KEYS.filter((k) => !k.startsWith('VITE_')).map((name) => ({
    name,
    isSet: setKeys.has(name),
  }))
}

export async function populateProcessEnv(userId: string, db: Client): Promise<void> {
  const keys = await loadApiKeys(userId, db)
  for (const name of KNOWN_API_KEYS) {
    delete process.env[name]
  }
  delete process.env['VITE_GEMINI_API_KEY']
  for (const [name, value] of Object.entries(keys)) {
    process.env[name] = value
    if (name === 'GEMINI_API_KEY') {
      process.env['VITE_GEMINI_API_KEY'] = value
    }
  }
}
