import * as crypto from 'node:crypto'
import { createClient, type Client } from '@libsql/client'
import keytar from 'keytar'

const KEYCHAIN_SERVICE = 'robot-secretary'
const KEYCHAIN_MASTER_KEY = 'master-key'

// ── Bootstrap DB (singleton, full-access) ─────────────────────────────────────

let _bootstrapDb: Client | null = null

export function getBootstrapDb(): Client {
  if (_bootstrapDb) return _bootstrapDb
  const url = process.env.ROBOT_SECRETARY_DB_URL
  const authToken = process.env.ROBOT_SECRETARY_DB_TOKEN
  if (!url) throw new Error('ROBOT_SECRETARY_DB_URL is not set')
  _bootstrapDb = createClient({ url, authToken })
  return _bootstrapDb
}

// ── Master key (for encrypting per-user DB tokens in the registry) ────────────

async function getMasterKey(): Promise<Buffer> {
  let secret = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_MASTER_KEY)
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex')
    await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_MASTER_KEY, secret)
  }
  return Buffer.from(secret, 'hex')
}

function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

function decryptWithKey(b64: string, key: Buffer): string {
  const buf = Buffer.from(b64, 'base64')
  const iv = buf.subarray(0, 12)
  const authTag = buf.subarray(12, 28)
  const encrypted = buf.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
}

// ── User registry CRUD ────────────────────────────────────────────────────────

export type UserRecord = {
  id: string
  googleId: string
  email: string
  displayName: string | null
  avatarUrl: string | null
  dbName: string
  dbUrl: string
  dbToken: string
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const db = getBootstrapDb()
  const result = await db.execute({
    sql: 'SELECT * FROM user_registry WHERE id = ?',
    args: [id],
  })
  if (result.rows.length === 0) return null
  return decryptUserRow(result.rows[0] as Record<string, unknown>)
}

export async function findUserByGoogleId(googleId: string): Promise<UserRecord | null> {
  const db = getBootstrapDb()
  const result = await db.execute({
    sql: 'SELECT * FROM user_registry WHERE google_id = ?',
    args: [googleId],
  })
  if (result.rows.length === 0) return null
  return decryptUserRow(result.rows[0] as Record<string, unknown>)
}

async function decryptUserRow(row: Record<string, unknown>): Promise<UserRecord> {
  const masterKey = await getMasterKey()
  return {
    id: row.id as string,
    googleId: row.google_id as string,
    email: row.email as string,
    displayName: (row.display_name as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    dbName: row.db_name as string,
    dbUrl: row.db_url as string,
    dbToken: decryptWithKey(row.db_token_ciphertext as string, masterKey),
  }
}

export async function createUserRecord(params: {
  id: string
  googleId: string
  email: string
  displayName: string | null
  avatarUrl: string | null
  dbName: string
  dbUrl: string
  dbToken: string
}): Promise<void> {
  const db = getBootstrapDb()
  const masterKey = await getMasterKey()
  const dbTokenCiphertext = encryptWithKey(params.dbToken, masterKey)
  const now = new Date().toISOString()
  await db.execute({
    sql: `INSERT INTO user_registry
          (id, google_id, email, display_name, avatar_url, db_name, db_url, db_token_ciphertext, created_at, last_seen_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [
      params.id, params.googleId, params.email, params.displayName, params.avatarUrl,
      params.dbName, params.dbUrl, dbTokenCiphertext, now, now,
    ],
  })
}

export async function updateUserLastSeen(id: string): Promise<void> {
  const db = getBootstrapDb()
  await db.execute({
    sql: 'UPDATE user_registry SET last_seen_at = ? WHERE id = ?',
    args: [new Date().toISOString(), id],
  })
}

export async function updateUserProfile(id: string, fields: {
  email?: string; displayName?: string | null; avatarUrl?: string | null
}): Promise<void> {
  const db = getBootstrapDb()
  const now = new Date().toISOString()
  await db.execute({
    sql: `UPDATE user_registry SET
            email = COALESCE(?, email),
            display_name = ?,
            avatar_url = ?,
            last_seen_at = ?
          WHERE id = ?`,
    args: [fields.email ?? null, fields.displayName ?? null, fields.avatarUrl ?? null, now, id],
  })
}
