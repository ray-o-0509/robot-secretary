import { google } from 'googleapis'
import * as path from 'path'
import type { Client } from '@libsql/client'
import { loadGoogleToken, saveGoogleToken, listGoogleTokenEmails, deleteGoogleToken, type GoogleTokenData } from '../../auth/googleTokenStore'

export const PRIMARY_TOKENS_DIR = path.join(process.env.HOME ?? '', '.config/robot-secretary/google-tokens')
export const FALLBACK_TOKENS_DIR = path.join(process.env.HOME ?? '', '.config/gmail-triage/tokens')

export type AccountEntry = { email: string; path: string; source: 'primary' | 'legacy' }

let _userId: string | null = null
let _db: Client | null = null
const _tokenCache = new Map<string, GoogleTokenData>()

export async function initGoogleAuth(userId: string, db: Client): Promise<void> {
  _userId = userId
  _db = db
  _tokenCache.clear()
  const emails = await listGoogleTokenEmails(db)
  await Promise.all(emails.map(async (email) => {
    const data = await loadGoogleToken(userId, email, db)
    if (data) _tokenCache.set(email, data)
  }))
}

export async function saveGoogleTokenForUser(email: string, tokenData: GoogleTokenData): Promise<void> {
  if (!_userId || !_db) throw new Error('googleAuth: not initialized')
  await saveGoogleToken(_userId, email, tokenData, _db)
  _tokenCache.set(email, tokenData)
}

export async function deleteGoogleTokenForUser(email: string): Promise<void> {
  if (!_userId || !_db) throw new Error('googleAuth: not initialized')
  await deleteGoogleToken(email, _db)
  _tokenCache.delete(email)
}

export async function listGoogleTokenEmailsForUser(): Promise<string[]> {
  if (!_db) return []
  return listGoogleTokenEmails(_db)
}

export function listAccounts(): string[] {
  const accounts = Array.from(_tokenCache.keys()).sort()
  if (accounts.length === 0) throw new Error('Google tokens not found in DB')
  return accounts
}

export function listAccountsAll(): AccountEntry[] {
  return Array.from(_tokenCache.keys()).sort().map((email) => ({ email, path: '', source: 'primary' as const }))
}

export function getGoogleAuth(email?: string) {
  const accounts = listAccounts()
  const account = email ?? process.env.GMAIL_ACCOUNT ?? accounts[0]
  const cached = _tokenCache.get(account)
  if (cached) return buildOAuthClient(cached)
  throw new Error(`Google token not found for ${account}`)
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
