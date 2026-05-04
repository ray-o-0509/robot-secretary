import { google } from 'googleapis'
import * as fs from 'fs'
import * as path from 'path'

// robot-secretary 専用トークンディレクトリ。なければ旧 gmail-triage 共有ディレクトリにフォールバック。
export const PRIMARY_TOKENS_DIR = path.join(process.env.HOME ?? '', '.config/robot-secretary/google-tokens')
export const FALLBACK_TOKENS_DIR = path.join(process.env.HOME ?? '', '.config/gmail-triage/tokens')
const TOKENS_DIR = fs.existsSync(PRIMARY_TOKENS_DIR) ? PRIMARY_TOKENS_DIR : FALLBACK_TOKENS_DIR

export function listAccounts(): string[] {
  if (!fs.existsSync(TOKENS_DIR)) {
    throw new Error(`Google token directory not found: ${PRIMARY_TOKENS_DIR}`)
  }
  const files = fs.readdirSync(TOKENS_DIR).filter((f) => f.endsWith('.json')).sort()
  if (files.length === 0) throw new Error(`No token files found in ${TOKENS_DIR}`)
  return files.map((f) => f.replace(/\.json$/, ''))
}

export type AccountEntry = { email: string; path: string; source: 'primary' | 'legacy' }

// Settings UI 用: primary と legacy の両方をマージして返す。primary を優先（同 email が両方にある場合）。
// listAccounts() と違い、空でも throw せず空配列を返す。
export function listAccountsAll(): AccountEntry[] {
  const map = new Map<string, AccountEntry>()
  const collect = (dir: string, source: 'primary' | 'legacy') => {
    if (!fs.existsSync(dir)) return
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue
      const email = f.replace(/\.json$/, '')
      if (!map.has(email)) {
        map.set(email, { email, path: path.join(dir, f), source })
      }
    }
  }
  collect(PRIMARY_TOKENS_DIR, 'primary')
  collect(FALLBACK_TOKENS_DIR, 'legacy')
  return Array.from(map.values()).sort((a, b) => a.email.localeCompare(b.email))
}

export function getGoogleAuth(email?: string) {
  const account = email ?? process.env.GMAIL_ACCOUNT ?? listAccounts()[0]
  const tokenPath = path.join(TOKENS_DIR, `${account}.json`)
  if (!fs.existsSync(tokenPath)) {
    throw new Error(`Token not found: ${tokenPath}`)
  }

  const data = JSON.parse(fs.readFileSync(tokenPath, 'utf-8')) as {
    token: string
    refresh_token: string
    token_uri?: string
    client_id: string
    client_secret: string
    scopes?: string[]
    expiry?: string
  }

  const oAuth2Client = new google.auth.OAuth2(data.client_id, data.client_secret, 'urn:ietf:wg:oauth:2.0:oob')
  oAuth2Client.setCredentials({
    access_token: data.token,
    refresh_token: data.refresh_token,
    scope: (data.scopes ?? []).join(' '),
    token_type: 'Bearer',
    expiry_date: data.expiry ? Date.parse(data.expiry) : undefined,
  })
  return oAuth2Client
}
