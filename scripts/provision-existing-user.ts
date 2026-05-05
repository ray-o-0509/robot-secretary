#!/usr/bin/env tsx
/**
 * 既存ユーザー（旧 users テーブル）を新しい per-user DB に移行するスクリプト。
 * 実行前に .env.local に TURSO_PLATFORM_API_TOKEN, TURSO_ORG が設定されていること。
 *
 * Usage: npx tsx scripts/provision-existing-user.ts
 */

import * as path from 'node:path'
import * as dotenv from 'dotenv'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import { createClient } from '@libsql/client'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const BOOTSTRAP_URL   = process.env.ROBOT_SECRETARY_DB_URL!
const BOOTSTRAP_TOKEN = process.env.ROBOT_SECRETARY_DB_TOKEN
const TURSO_ORG       = process.env.TURSO_ORG ?? 'ray-o-0509'
const PLATFORM_TOKEN  = process.env.TURSO_PLATFORM_API_TOKEN!
const TURSO_API_BASE  = 'https://api.turso.tech/v1'

if (!BOOTSTRAP_URL || !PLATFORM_TOKEN) {
  console.error('ROBOT_SECRETARY_DB_URL and TURSO_PLATFORM_API_TOKEN must be set in .env.local')
  process.exit(1)
}

const bootstrapDb = createClient({ url: BOOTSTRAP_URL, authToken: BOOTSTRAP_TOKEN })

async function apiPost(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${TURSO_API_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PLATFORM_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

// Read the master key from the macOS Keychain
async function getMasterKey(): Promise<Buffer> {
  const keytar = await import('keytar')
  const secret = await keytar.default.getPassword('robot-secretary', 'master-key')
  if (!secret) throw new Error('master-key not found in Keychain — run the app first to generate it')
  return Buffer.from(secret, 'hex')
}

async function main() {
  console.log('=== Provision existing user to per-user DB ===')

  // Get existing user from old users table
  const usersResult = await bootstrapDb.execute('SELECT * FROM users LIMIT 10')
  if (usersResult.rows.length === 0) {
    console.log('No users found in old users table.')
    process.exit(0)
  }

  // Check if user_registry already has entries
  const registryResult = await bootstrapDb.execute('SELECT id FROM user_registry')
  if (registryResult.rows.length > 0) {
    console.log('user_registry already has entries:')
    const existing = await bootstrapDb.execute('SELECT id, email, db_name FROM user_registry')
    for (const row of existing.rows) {
      console.log(`  ${row.email as string} → ${row.db_name as string}`)
    }
    console.log('Migration already done. Exiting.')
    return
  }

  for (const userRow of usersResult.rows) {
    const userId   = userRow.id as string
    const googleId = userRow.google_id as string
    const email    = userRow.email as string
    const dbName   = `rs-${userId.slice(0, 8)}`

    console.log(`\nProvisioning DB for ${email} (${userId})...`)
    console.log(`  DB name: ${dbName}`)

    // Create the per-user database
    const created = await apiPost(`/organizations/${TURSO_ORG}/databases`, {
      name: dbName,
      group: 'default',
    }) as { database: { Hostname: string } }
    const dbUrl = `libsql://${created.database.Hostname}`
    console.log(`  Created: ${dbUrl}`)

    // Create a token for it
    const tokenResult = await apiPost(
      `/organizations/${TURSO_ORG}/databases/${dbName}/auth/tokens?expiration=never`,
    ) as { jwt: string }
    const dbToken = tokenResult.jwt

    // Apply per-user schema
    const schemaPath = path.join(__dirname, 'schema-user.sql')
    const schema = fs.readFileSync(schemaPath, 'utf-8')
    const userDb = createClient({ url: dbUrl, authToken: dbToken })
    for (const stmt of schema.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'))) {
      await userDb.execute(stmt)
    }
    console.log('  Schema applied')

    // Copy existing data from bootstrap DB (old schema) to per-user DB
    // Settings
    const settingsRow = await bootstrapDb.execute({ sql: 'SELECT * FROM settings WHERE user_id = ?', args: [userId] })
    if (settingsRow.rows.length > 0) {
      const s = settingsRow.rows[0]
      await userDb.execute({
        sql: `INSERT INTO settings (id, language, robot_size, default_apps, skill_toggles, updated_at)
              VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
        args: [s.language, s.robot_size, s.default_apps ?? '{}', s.skill_toggles ?? '{}', s.updated_at ?? new Date().toISOString()],
      })
      console.log('  Settings migrated')
    }

    // Memory
    const memRow = await bootstrapDb.execute({ sql: 'SELECT * FROM memory WHERE user_id = ?', args: [userId] })
    if (memRow.rows.length > 0) {
      const m = memRow.rows[0]
      await userDb.execute({
        sql: `INSERT INTO memory (id, facts, preferences, ongoing_topics, procedures, session_summaries, updated_at)
              VALUES (1, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
        args: [m.facts ?? '[]', m.preferences ?? '[]', m.ongoing_topics ?? '[]', m.procedures ?? '[]', m.session_summaries ?? '[]', m.updated_at ?? new Date().toISOString()],
      })
      console.log('  Memory migrated')
    }

    // Profile
    const profileRow = await bootstrapDb.execute({ sql: 'SELECT * FROM profile WHERE user_id = ?', args: [userId] })
    if (profileRow.rows.length > 0) {
      const p = profileRow.rows[0]
      await userDb.execute({
        sql: `INSERT INTO profile (id, items, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO NOTHING`,
        args: [p.items ?? '{}', p.updated_at ?? new Date().toISOString()],
      })
      console.log('  Profile migrated')
    }

    // API keys
    const apiKeysRows = await bootstrapDb.execute({ sql: 'SELECT * FROM api_keys WHERE user_id = ?', args: [userId] })
    for (const k of apiKeysRows.rows) {
      await userDb.execute({
        sql: `INSERT INTO api_keys (id, key_name, ciphertext, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key_name) DO NOTHING`,
        args: [k.id, k.key_name, k.ciphertext, k.updated_at ?? new Date().toISOString()],
      })
    }
    if (apiKeysRows.rows.length > 0) console.log(`  ${apiKeysRows.rows.length} API keys migrated`)

    // Google tokens
    const gTokenRows = await bootstrapDb.execute({ sql: 'SELECT * FROM google_tokens WHERE user_id = ?', args: [userId] })
    for (const t of gTokenRows.rows) {
      await userDb.execute({
        sql: `INSERT INTO google_tokens (id, email, ciphertext, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING`,
        args: [t.id, t.email, t.ciphertext, t.updated_at ?? new Date().toISOString()],
      })
    }
    if (gTokenRows.rows.length > 0) console.log(`  ${gTokenRows.rows.length} Google tokens migrated`)

    // Sessions + transcripts
    const sessions = await bootstrapDb.execute({ sql: 'SELECT * FROM conv_sessions WHERE user_id = ?', args: [userId] })
    for (const s of sessions.rows) {
      await userDb.execute({
        sql: `INSERT INTO conv_sessions (id, started_at, ended_at, summarized, log_file) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
        args: [s.id, s.started_at, s.ended_at ?? null, s.summarized ?? 0, s.log_file ?? ''],
      })
      const transcripts = await bootstrapDb.execute({ sql: 'SELECT * FROM transcripts WHERE session_id = ? ORDER BY ts ASC', args: [s.id as string] })
      for (const t of transcripts.rows) {
        await userDb.execute({
          sql: `INSERT INTO transcripts (session_id, role, text, ts) VALUES (?, ?, ?, ?)`,
          args: [t.session_id, t.role, t.text, t.ts],
        })
      }
    }
    if (sessions.rows.length > 0) console.log(`  ${sessions.rows.length} sessions migrated`)

    userDb.close()

    // Register in user_registry (encrypt the DB token with master key)
    const masterKey = await getMasterKey()
    const dbTokenCiphertext = encrypt(dbToken, masterKey)
    const now = new Date().toISOString()
    await bootstrapDb.execute({
      sql: `INSERT INTO user_registry (id, google_id, email, display_name, avatar_url, db_name, db_url, db_token_ciphertext, created_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [userId, googleId, email, userRow.display_name ?? null, userRow.avatar_url ?? null, dbName, dbUrl, dbTokenCiphertext, now, now],
    })
    console.log(`  Registered in user_registry ✓`)
    console.log(`\nDone: ${email} → ${dbUrl}`)
  }

  console.log('\n=== Migration complete! ===')
  console.log('Restart Robot Secretary to use the new per-user DB.')
}

main().catch((e) => { console.error(e); process.exit(1) })
