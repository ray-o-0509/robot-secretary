import * as path from 'node:path'
import * as dotenv from 'dotenv'
import * as crypto from 'node:crypto'
import { createClient } from '@libsql/client'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const BOOTSTRAP_URL   = process.env.ROBOT_SECRETARY_DB_URL!
const BOOTSTRAP_TOKEN = process.env.ROBOT_SECRETARY_DB_TOKEN
const TURSO_ORG       = process.env.TURSO_ORG ?? 'ray-o-0509'
const PLATFORM_TOKEN  = process.env.TURSO_PLATFORM_API_TOKEN!
const TURSO_API_BASE  = 'https://api.turso.tech/v1'

const bootstrapDb = createClient({ url: BOOTSTRAP_URL, authToken: BOOTSTRAP_TOKEN })

async function apiPost(p: string): Promise<unknown> {
  const res = await fetch(`${TURSO_API_BASE}${p}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PLATFORM_TOKEN}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`POST ${p}: ${res.status} ${await res.text()}`)
  return res.json()
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

async function main() {
  const regCheck = await bootstrapDb.execute('SELECT * FROM user_registry')
  if (regCheck.rows.length > 0) {
    console.log('Already in registry:', regCheck.rows.map(r => `${r.email} → ${r.db_name}`).join(', '))
    return
  }

  const userRow = (await bootstrapDb.execute('SELECT * FROM users LIMIT 1')).rows[0]
  if (!userRow) { console.log('No users found'); return }

  const userId   = userRow.id as string
  const googleId = userRow.google_id as string
  const email    = userRow.email as string
  const dbName   = `rs-${userId.slice(0, 8)}`
  const dbUrl    = `libsql://${dbName}-${TURSO_ORG}.aws-ap-northeast-1.turso.io`

  console.log(`Migrating ${email} → ${dbUrl}`)

  const tokenResult = await apiPost(`/organizations/${TURSO_ORG}/databases/${dbName}/auth/tokens?expiration=never`) as { jwt: string }
  const dbToken = tokenResult.jwt
  const userDb = createClient({ url: dbUrl, authToken: dbToken })

  const s = (await bootstrapDb.execute({ sql: 'SELECT * FROM settings WHERE user_id = ?', args: [userId] })).rows[0]
  if (s) {
    await userDb.execute({ sql: 'INSERT OR REPLACE INTO settings (id, language, robot_size, default_apps, skill_toggles, updated_at) VALUES (1, ?, ?, ?, ?, ?)', args: [s.language, s.robot_size, s.default_apps ?? '{}', s.skill_toggles ?? '{}', s.updated_at ?? new Date().toISOString()] })
    console.log('Settings migrated')
  }

  const m = (await bootstrapDb.execute({ sql: 'SELECT * FROM memory WHERE user_id = ?', args: [userId] })).rows[0]
  if (m) {
    await userDb.execute({ sql: 'INSERT OR REPLACE INTO memory (id, facts, preferences, ongoing_topics, procedures, session_summaries, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?)', args: [m.facts ?? '[]', m.preferences ?? '[]', m.ongoing_topics ?? '[]', m.procedures ?? '[]', m.session_summaries ?? '[]', m.updated_at ?? new Date().toISOString()] })
    console.log('Memory migrated')
  }

  const p = (await bootstrapDb.execute({ sql: 'SELECT * FROM profile WHERE user_id = ?', args: [userId] })).rows[0]
  if (p) {
    await userDb.execute({ sql: 'INSERT OR REPLACE INTO profile (id, items, updated_at) VALUES (1, ?, ?)', args: [p.items ?? '{}', p.updated_at ?? new Date().toISOString()] })
    console.log('Profile migrated')
  }

  for (const k of (await bootstrapDb.execute({ sql: 'SELECT * FROM api_keys WHERE user_id = ?', args: [userId] })).rows) {
    await userDb.execute({ sql: 'INSERT OR IGNORE INTO api_keys (id, key_name, ciphertext, updated_at) VALUES (?, ?, ?, ?)', args: [k.id, k.key_name, k.ciphertext, k.updated_at ?? new Date().toISOString()] })
  }
  const apiKeyCount = (await bootstrapDb.execute({ sql: 'SELECT COUNT(*) as c FROM api_keys WHERE user_id = ?', args: [userId] })).rows[0].c
  console.log(`${apiKeyCount} API keys migrated`)

  for (const t of (await bootstrapDb.execute({ sql: 'SELECT * FROM google_tokens WHERE user_id = ?', args: [userId] })).rows) {
    await userDb.execute({ sql: 'INSERT OR IGNORE INTO google_tokens (id, email, ciphertext, updated_at) VALUES (?, ?, ?, ?)', args: [t.id, t.email, t.ciphertext, t.updated_at ?? new Date().toISOString()] })
  }
  const gTokenCount = (await bootstrapDb.execute({ sql: 'SELECT COUNT(*) as c FROM google_tokens WHERE user_id = ?', args: [userId] })).rows[0].c
  console.log(`${gTokenCount} Google tokens migrated`)

  userDb.close()

  const keytar = await import('keytar')
  const secret = await keytar.default.getPassword('robot-secretary', 'master-key')
  if (!secret) throw new Error('master-key not in Keychain — launch the app first')
  const dbTokenCiphertext = encrypt(dbToken, Buffer.from(secret, 'hex'))
  const now = new Date().toISOString()

  await bootstrapDb.execute({
    sql: 'INSERT INTO user_registry (id, google_id, email, display_name, avatar_url, db_name, db_url, db_token_ciphertext, created_at, last_seen_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    args: [userId, googleId, email, userRow.display_name ?? null, userRow.avatar_url ?? null, dbName, dbUrl, dbTokenCiphertext, now, now],
  })

  console.log(`\nRegistered ${email} → ${dbUrl}`)
  console.log('Migration complete!')
}

main().catch(e => { console.error(e); process.exit(1) })
