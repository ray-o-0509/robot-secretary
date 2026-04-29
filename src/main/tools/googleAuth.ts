import { google } from 'googleapis'
import * as fs from 'fs'
import * as path from 'path'

const TOKENS_DIR = path.join(process.env.HOME ?? '', '.config/gmail-triage/tokens')

export function listAccounts(): string[] {
  if (!fs.existsSync(TOKENS_DIR)) {
    throw new Error(`gmail-triage トークンディレクトリがありません: ${TOKENS_DIR}`)
  }
  const files = fs.readdirSync(TOKENS_DIR).filter((f) => f.endsWith('.json')).sort()
  if (files.length === 0) throw new Error(`トークンが ${TOKENS_DIR} に1つもありません`)
  return files.map((f) => f.replace(/\.json$/, ''))
}

export function getGoogleAuth(email?: string) {
  const account = email ?? process.env.GMAIL_ACCOUNT ?? listAccounts()[0]
  const tokenPath = path.join(TOKENS_DIR, `${account}.json`)
  if (!fs.existsSync(tokenPath)) {
    throw new Error(`トークンが見つかりません: ${tokenPath}`)
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
