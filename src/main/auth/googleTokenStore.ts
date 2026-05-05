import * as crypto from 'node:crypto'
import type { Client } from '@libsql/client'
import { encrypt, decrypt, getDerivedKey } from './crypto'

export type GoogleTokenData = {
  token: string | null
  refresh_token: string
  token_uri: string
  client_id: string
  client_secret: string
  scopes: string[]
  expiry: string | null
}

export async function loadGoogleToken(userId: string, email: string, db: Client): Promise<GoogleTokenData | null> {
  const result = await db.execute({
    sql: 'SELECT ciphertext FROM google_tokens WHERE user_id = ? AND email = ?',
    args: [userId, email],
  })
  if (result.rows.length === 0) return null
  const key = await getDerivedKey(userId)
  return JSON.parse(decrypt(result.rows[0].ciphertext as string, key)) as GoogleTokenData
}

export async function saveGoogleToken(userId: string, email: string, tokenData: GoogleTokenData, db: Client): Promise<void> {
  const key = await getDerivedKey(userId)
  const ciphertext = encrypt(JSON.stringify(tokenData), key)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.execute({
    sql: `INSERT INTO google_tokens (id, user_id, email, ciphertext, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id, email) DO UPDATE SET ciphertext=excluded.ciphertext, updated_at=excluded.updated_at`,
    args: [id, userId, email, ciphertext, now],
  })
}

export async function listGoogleTokenEmails(userId: string, db: Client): Promise<string[]> {
  const result = await db.execute({
    sql: 'SELECT email FROM google_tokens WHERE user_id = ?',
    args: [userId],
  })
  return result.rows.map((r) => r.email as string)
}

export async function deleteGoogleToken(userId: string, email: string, db: Client): Promise<void> {
  await db.execute({
    sql: 'DELETE FROM google_tokens WHERE user_id = ? AND email = ?',
    args: [userId, email],
  })
}
