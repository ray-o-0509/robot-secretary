#!/usr/bin/env tsx
/**
 * ローカルファイルベースのデータを Turso DB に移行する一回限りのスクリプト。
 *
 * Usage:
 *   ROBOT_SECRETARY_USER_ID=<uuid> \
 *   ROBOT_SECRETARY_DB_URL=libsql://... \
 *   ROBOT_SECRETARY_DB_TOKEN=... \
 *   npx tsx scripts/migrate-to-turso.ts
 *
 * ユーザーが初回ログインして users テーブルにレコードがある状態で実行すること。
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as dotenv from 'dotenv'
import { createClient } from '@libsql/client'
import * as crypto from 'node:crypto'

// Load .env.local from project root
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const userId = process.env['ROBOT_SECRETARY_USER_ID']
const dbUrl = process.env['ROBOT_SECRETARY_DB_URL']
const dbToken = process.env['ROBOT_SECRETARY_DB_TOKEN']

if (!userId || !dbUrl) {
  console.error('ERROR: ROBOT_SECRETARY_USER_ID and ROBOT_SECRETARY_DB_URL must be set')
  process.exit(1)
}

const db = createClient({ url: dbUrl, authToken: dbToken })

// ── Crypto helpers (must match src/main/auth/crypto.ts logic) ──────────────────
// For migration we generate a temporary plaintext marker — caller should set API keys via UI after migration.
// Google tokens are encrypted with the same AES-256-GCM scheme.

async function getMasterSecret(): Promise<Buffer> {
  const { default: keytar } = await import('keytar')
  let secret = await keytar.getPassword('robot-secretary', 'master-key')
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex')
    await keytar.setPassword('robot-secretary', 'master-key', secret)
    console.log('[crypto] Generated new master key in Keychain')
  }
  return Buffer.from(secret, 'hex')
}

async function getDerivedKey(): Promise<Buffer> {
  const master = await getMasterSecret()
  return crypto.createHash('sha256').update(Buffer.concat([master, Buffer.from(':' + userId)])).digest()
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

// ── Helper ────────────────────────────────────────────────────────────────────

function readJson<T>(filePath: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T } catch { return fallback }
}

const userData = path.join(os.homedir(), 'Library', 'Application Support', 'robot-secretary')
const conversations = path.join(userData, 'conversations')
const googleTokensDir = path.join(os.homedir(), '.config', 'robot-secretary', 'google-tokens')

async function verifyUser(): Promise<void> {
  const result = await db.execute({ sql: 'SELECT id, email FROM users WHERE id = ?', args: [userId] })
  if (result.rows.length === 0) {
    console.error(`ERROR: User ${userId} not found in Turso DB. Log in to Robot Secretary first.`)
    process.exit(1)
  }
  console.log(`[migrate] User found: ${result.rows[0].email as string}`)
}

async function migrateMemory(): Promise<void> {
  const memFile = path.join(conversations, 'memory.json')
  if (!fs.existsSync(memFile)) { console.log('[migrate] memory.json not found, skipping'); return }
  const data = readJson<Record<string, unknown>>(memFile, {})
  const now = new Date().toISOString()
  await db.execute({
    sql: `INSERT INTO memory (user_id, facts, preferences, ongoing_topics, procedures, session_summaries, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET facts=excluded.facts, preferences=excluded.preferences,
            ongoing_topics=excluded.ongoing_topics, procedures=excluded.procedures,
            session_summaries=excluded.session_summaries, updated_at=excluded.updated_at`,
    args: [
      userId!,
      JSON.stringify(data['facts'] ?? []),
      JSON.stringify(data['preferences'] ?? []),
      JSON.stringify(data['ongoing_topics'] ?? []),
      JSON.stringify(data['procedures'] ?? []),
      JSON.stringify(data['session_summaries'] ?? []),
      (data['updatedAt'] as string) ?? now,
    ],
  })
  console.log('[migrate] memory.json → memory table ✓')
}

async function migrateProfile(): Promise<void> {
  const profileFile = path.join(conversations, 'profile.json')
  if (!fs.existsSync(profileFile)) { console.log('[migrate] profile.json not found, skipping'); return }
  const data = readJson<{ items?: Record<string, string>; updatedAt?: string }>(profileFile, {})
  await db.execute({
    sql: `INSERT INTO profile (user_id, items, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET items=excluded.items, updated_at=excluded.updated_at`,
    args: [userId!, JSON.stringify(data.items ?? {}), data.updatedAt ?? new Date().toISOString()],
  })
  console.log('[migrate] profile.json → profile table ✓')
}

async function migrateSettings(): Promise<void> {
  const appearanceFile = path.join(userData, 'appearance.json')
  const languageFile = path.join(userData, 'language.json')
  const defaultAppsFile = path.join(conversations, 'default-apps.json')
  const skillsFile = path.join(conversations, 'skills-enabled.json')

  const appearance = readJson<{ robotSize?: number }>(appearanceFile, {})
  const language = readJson<{ code?: string }>(languageFile, {})
  const defaultApps = readJson<Record<string, string>>(defaultAppsFile, {})
  const skillToggles = readJson<Record<string, boolean>>(skillsFile, {})

  await db.execute({
    sql: `INSERT INTO settings (user_id, language, robot_size, default_apps, skill_toggles, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET language=excluded.language, robot_size=excluded.robot_size,
            default_apps=excluded.default_apps, skill_toggles=excluded.skill_toggles, updated_at=excluded.updated_at`,
    args: [
      userId!,
      language.code ?? 'ja-JP',
      appearance.robotSize ?? 300,
      JSON.stringify(defaultApps),
      JSON.stringify(skillToggles),
      new Date().toISOString(),
    ],
  })
  console.log('[migrate] appearance + language + default-apps + skills-enabled → settings table ✓')
}

async function migrateGoogleTokens(): Promise<void> {
  if (!fs.existsSync(googleTokensDir)) { console.log('[migrate] google-tokens/ not found, skipping'); return }
  const key = await getDerivedKey()
  const files = fs.readdirSync(googleTokensDir).filter((f) => f.endsWith('.json'))
  for (const file of files) {
    const email = file.replace(/\.json$/, '')
    const data = readJson<Record<string, unknown>>(path.join(googleTokensDir, file), {})
    const ciphertext = encrypt(JSON.stringify(data), key)
    const id = crypto.randomUUID()
    await db.execute({
      sql: `INSERT INTO google_tokens (id, user_id, email, ciphertext, updated_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, email) DO UPDATE SET ciphertext=excluded.ciphertext, updated_at=excluded.updated_at`,
      args: [id, userId!, email, ciphertext, new Date().toISOString()],
    })
    console.log(`[migrate] google-token ${email} → google_tokens table ✓`)
  }
}

async function migrateApiKeys(): Promise<void> {
  const envFile = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envFile)) { console.log('[migrate] .env.local not found, skipping API key migration'); return }

  const known: string[] = [
    'GEMINI_API_KEY', 'VITE_GEMINI_API_KEY', 'ANTHROPIC_API_KEY',
    'TICKTICK_ACCESS_TOKEN', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'TAVILY_API_KEY',
  ]
  const key = await getDerivedKey()
  let count = 0
  for (const keyName of known) {
    const value = process.env[keyName]
    if (!value) continue
    const ciphertext = encrypt(value, key)
    const id = crypto.randomUUID()
    await db.execute({
      sql: `INSERT INTO api_keys (id, user_id, key_name, ciphertext, updated_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, key_name) DO UPDATE SET ciphertext=excluded.ciphertext, updated_at=excluded.updated_at`,
      args: [id, userId!, keyName, ciphertext, new Date().toISOString()],
    })
    count++
  }
  console.log(`[migrate] ${count} API keys → api_keys table ✓`)
}

async function migrateSessions(): Promise<void> {
  const sessionsFile = path.join(conversations, 'sessions.json')
  if (!fs.existsSync(sessionsFile)) { console.log('[migrate] sessions.json not found, skipping'); return }
  const sessions = readJson<Array<Record<string, unknown>>>(sessionsFile, [])

  for (const s of sessions) {
    await db.execute({
      sql: `INSERT INTO conv_sessions (id, user_id, started_at, ended_at, summarized, log_file)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING`,
      args: [
        s['id'] as string,
        userId!,
        s['startedAt'] as string,
        (s['endedAt'] as string | null) ?? null,
        s['summarized'] ? 1 : 0,
        (s['logFile'] as string) ?? '',
      ],
    })
  }

  // Migrate transcripts from .jsonl files (batch insert)
  let transcriptCount = 0
  for (const s of sessions) {
    const logFile = s['logFile'] as string
    if (!logFile) continue
    const logPath = path.join(conversations, logFile)
    if (!fs.existsSync(logPath)) continue

    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const ev = JSON.parse(line) as { type: string; sessionId: string; ts: string; role?: string; text?: string }
        if (ev.type !== 'transcript' || !ev.role || !ev.text) continue
        await db.execute({
          sql: 'INSERT INTO transcripts (session_id, user_id, role, text, ts) VALUES (?, ?, ?, ?, ?)',
          args: [ev.sessionId, userId!, ev.role, ev.text, ev.ts],
        })
        transcriptCount++
      } catch { /* skip malformed lines */ }
    }
  }
  console.log(`[migrate] ${sessions.length} sessions + ${transcriptCount} transcripts → conv_sessions/transcripts tables ✓`)
}

async function main(): Promise<void> {
  console.log('=== Robot Secretary → Turso Migration ===')
  console.log(`User ID: ${userId}`)
  console.log(`DB URL: ${dbUrl}`)
  console.log()

  await verifyUser()
  await migrateMemory()
  await migrateProfile()
  await migrateSettings()
  await migrateGoogleTokens()
  await migrateApiKeys()
  await migrateSessions()

  console.log()
  console.log('=== Migration complete! ===')
  console.log('Next steps:')
  console.log('  1. Launch Robot Secretary and verify settings/memory are loaded')
  console.log('  2. Check API keys are working (Gemini voice, Gmail, etc.)')
  console.log('  3. Optionally remove .env.local API keys (keep ROBOT_SECRETARY_DB_URL/TOKEN)')
}

main().catch((err) => { console.error(err); process.exit(1) })
