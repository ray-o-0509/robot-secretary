import { createClient, type Client } from '@libsql/client'
import { getEnv } from './env'
import { decryptSecret, encryptSecret } from './crypto'

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

let bootstrapDb: Client | null = null

export function getBootstrapDb(): Client {
  if (bootstrapDb) return bootstrapDb
  const env = getEnv()
  bootstrapDb = createClient({ url: env.bootstrapDbUrl, authToken: env.bootstrapDbToken })
  return bootstrapDb
}

export async function ensureRegistrySchema(): Promise<void> {
  await getBootstrapDb().execute(`
    CREATE TABLE IF NOT EXISTS user_registry (
      id TEXT PRIMARY KEY,
      google_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT,
      avatar_url TEXT,
      db_name TEXT NOT NULL,
      db_url TEXT NOT NULL,
      db_token_ciphertext TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `)
}

function decryptUserRow(row: Record<string, unknown>): UserRecord {
  const { registrySecret } = getEnv()
  return {
    id: row.id as string,
    googleId: row.google_id as string,
    email: row.email as string,
    displayName: (row.display_name as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    dbName: row.db_name as string,
    dbUrl: row.db_url as string,
    dbToken: decryptSecret(row.db_token_ciphertext as string, registrySecret),
  }
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  await ensureRegistrySchema()
  const result = await getBootstrapDb().execute({
    sql: 'SELECT * FROM user_registry WHERE id = ?',
    args: [id],
  })
  if (result.rows.length === 0) return null
  return decryptUserRow(result.rows[0] as Record<string, unknown>)
}

export async function findUserByGoogleId(googleId: string): Promise<UserRecord | null> {
  await ensureRegistrySchema()
  const result = await getBootstrapDb().execute({
    sql: 'SELECT * FROM user_registry WHERE google_id = ?',
    args: [googleId],
  })
  if (result.rows.length === 0) return null
  return decryptUserRow(result.rows[0] as Record<string, unknown>)
}

export async function createUserRecord(params: UserRecord): Promise<void> {
  await ensureRegistrySchema()
  const { registrySecret } = getEnv()
  const now = new Date().toISOString()
  await getBootstrapDb().execute({
    sql: `INSERT INTO user_registry
          (id, google_id, email, display_name, avatar_url, db_name, db_url, db_token_ciphertext, created_at, last_seen_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [
      params.id,
      params.googleId,
      params.email,
      params.displayName,
      params.avatarUrl,
      params.dbName,
      params.dbUrl,
      encryptSecret(params.dbToken, registrySecret),
      now,
      now,
    ],
  })
}

export async function updateUserLastSeen(id: string): Promise<void> {
  await ensureRegistrySchema()
  await getBootstrapDb().execute({
    sql: 'UPDATE user_registry SET last_seen_at = ? WHERE id = ?',
    args: [new Date().toISOString(), id],
  })
}

export async function updateUserProfile(id: string, fields: {
  email: string
  displayName: string | null
  avatarUrl: string | null
}): Promise<void> {
  await ensureRegistrySchema()
  await getBootstrapDb().execute({
    sql: `UPDATE user_registry SET
            email = ?,
            display_name = ?,
            avatar_url = ?,
            last_seen_at = ?
          WHERE id = ?`,
    args: [fields.email, fields.displayName, fields.avatarUrl, new Date().toISOString(), id],
  })
}
