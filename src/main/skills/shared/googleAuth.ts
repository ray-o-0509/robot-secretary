import { google } from 'googleapis'
import * as fs from 'fs'
import * as path from 'path'
import type { Client } from '@libsql/client'
import { loadGoogleToken, saveGoogleToken, listGoogleTokenEmails, deleteGoogleToken, type GoogleTokenData } from '../../auth/googleTokenStore'

export const PRIMARY_TOKENS_DIR = path.join(process.env.HOME ?? '', '.config/robot-secretary/google-tokens')
export const FALLBACK_TOKENS_DIR = path.join(process.env.HOME ?? '', '.config/gmail-triage/tokens')

export type AccountEntry = { email: string; path: string; source: 'primary' | 'legacy' }

// ── DB context + token cache ──────────────────────────────────────────────────

let _userId: string | null = null
let _db: Client | null = null

// In-memory cache: email → token data
const _tokenCache = new Map<string, GoogleTokenData>()

export async function initGoogleAuth(userId: string, db: Client): Promise<void> {
  _userId = userId
  _db = db
  // Pre-warm cache: load all tokens from DB
  const emails = await listGoogleTokenEmails(userId, db)
  await Promise.all(emails.map(async (email) => {
    const data = await loadGoogleToken(userId, email, db)
    if (data) _tokenCache.set(email, data)
  }))
}

// ── DB-backed token write/delete ──────────────────────────────────────────────

export async function saveGoogleTokenForUser(email: string, tokenData: GoogleTokenData): Promise<void> {
  if (!_userId || !_db) throw new Error('googleAuth: not initialized')
  await saveGoogleToken(_userId, email, tokenData, _db)
  _tokenCache.set(email, tokenData)
}

export async function deleteGoogleTokenForUser(email: string): Promise<void> {
  if (!_userId || !_db) throw new Error('googleAuth: not initialized')
  await deleteGoogleToken(_userId, email, _db)
  _tokenCache.delete(email)
}

export async function listGoogleTokenEmailsForUser(): Promise<string[]> {
  if (!_userId || !_db) return []
  return listGoogleTokenEmails(_userId, _db)
}

// ── Public API (sync — reads from cache) ─────────────────────────────────────

export function listAccounts(): string[] {
  if (_tokenCache.size > 0) {
    return Array.from(_tokenCache.keys()).sort()
  }
  // Fallback to file system if cache is empty (pre-migration or no DB)
  const tokensDir = fs.existsSync(PRIMARY_TOKENS_DIR) ? PRIMARY_TOKENS_DIR
    : fs.existsSync(FALLBACK_TOKENS_DIR) ? FALLBACK_TOKENS_DIR : null
  if (!tokensDir) throw new Error(`Google token directory not found: ${PRIMARY_TOKENS_DIR}`)
  const files = fs.readdirSync(tokensDir).filter((f) => f.endsWith('.json')).sort()
  if (files.length === 0) throw new Error(`No token files found in ${tokensDir}`)
  return files.map((f) => f.replace(/\.json$/, ''))
}

// Settings UI: returns all known accounts (from cache + file fallback)
export function listAccountsAll(): AccountEntry[] {
  if (_tokenCache.size > 0) {
    return Array.from(_tokenCache.keys()).sort().map((email) => ({
      email,
      path: '',
      source: 'primary' as const,
    }))
  }
  // Fallback to file system
  const map = new Map<string, AccountEntry>()
  const collect = (dir: string, source: 'primary' | 'legacy') => {
    if (!fs.existsSync(dir)) return
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue
      const email = f.replace(/\.json$/, '')
      if (!map.has(email)) map.set(email, { email, path: path.join(dir, f), source })
    }
  }
  collect(PRIMARY_TOKENS_DIR, 'primary')
  collect(FALLBACK_TOKENS_DIR, 'legacy')
  return Array.from(map.values()).sort((a, b) => a.email.localeCompare(b.email))
}

export function getGoogleAuth(email?: string) {
  const accounts = listAccounts()
  const account = email ?? process.env.GMAIL_ACCOUNT ?? accounts[0]

  // Try DB cache first
  const cached = _tokenCache.get(account)
  if (cached) return buildOAuthClient(cached)

  // Fallback to file system
  const tokensDir = fs.existsSync(PRIMARY_TOKENS_DIR) ? PRIMARY_TOKENS_DIR : FALLBACK_TOKENS_DIR
  const tokenPath = path.join(tokensDir, `${account}.json`)
  if (!fs.existsSync(tokenPath)) throw new Error(`Token not found for ${account}`)
  const data = JSON.parse(fs.readFileSync(tokenPath, 'utf-8')) as GoogleTokenData
  return buildOAuthClient(data)
}

function buildOAuthClient(data: GoogleTokenData) {
  const oAuth2Client = new google.auth.OAuth2(data.client_id, data.client_secret, 'urn:ietf:wg:oauth:2.0:oob')
  oAuth2Client.setCredentials({
    access_token: data.token ?? undefined,
    refresh_token: data.refresh_token,
    scope: (data.scopes ?? []).join(' '),
    token_type: 'Bearer',
    expiry_date: data.expiry ? Date.parse(data.expiry) : undefined,
  })
  return oAuth2Client
}

export function sanitizeGoogleError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/oauth2\.googleapis\.com\/token|invalid_grant|access_denied|unauthorized_client/i.test(msg)) {
    return 'Google API アクセス不可（GWS ポリシーまたはスコープ制限）'
  }
  return msg
}
