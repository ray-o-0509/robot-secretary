// Settings UI から呼び出される Google OAuth 連携フロー。
// scripts/auth-google.mjs と同等のロジックを main プロセス用に移植。
// - ループバックサーバ (127.0.0.1:0) で code を受け取る
// - shell.openExternal(authUrl) でユーザのデフォルトブラウザを開く
// - トークンは Turso DB に暗号化して保存する

import { session, shell } from 'electron'
import { google } from 'googleapis'
import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import { PRIMARY_TOKENS_DIR, FALLBACK_TOKENS_DIR, listAccountsAll, saveGoogleTokenForUser, deleteGoogleTokenForUser, type AccountEntry } from '../skills/shared/googleAuth'

export const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive',
]

export const CLIENT_SECRET_PATH = path.join(os.homedir(), '.config/gmail-triage/client_secret.json')

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000

type ClientSecret = { client_id: string; client_secret: string; token_uri?: string }

type OAuthTokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

function readClientSecret(): ClientSecret {
  const raw = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, 'utf-8')) as {
    installed?: ClientSecret
    web?: ClientSecret
  }
  const c = raw.installed ?? raw.web
  if (!c?.client_id || !c?.client_secret) {
    throw new Error(`Invalid client_secret.json at ${CLIENT_SECRET_PATH}`)
  }
  return c
}

export function checkSetup() {
  return {
    clientSecretPath: CLIENT_SECRET_PATH,
    clientSecretExists: fs.existsSync(CLIENT_SECRET_PATH),
    primaryTokensDir: PRIMARY_TOKENS_DIR,
    fallbackTokensDir: FALLBACK_TOKENS_DIR,
  }
}

export type AccountListItem = AccountEntry & {
  scopes: string[]
  hasRefreshToken: boolean
  missingScopes: string[]
  expiry: string | null
}

export function listAccountsForUi(): AccountListItem[] {
  return listAccountsAll().map((entry) => ({
    ...entry,
    scopes: REQUIRED_SCOPES,
    hasRefreshToken: true,
    missingScopes: [],
    expiry: null,
  }))
}

export async function listAccountsForUiAsync(): Promise<AccountListItem[]> {
  return listAccountsForUi()
}

// 同時に複数の OAuth フローが走らないようにするためのロック
type InFlight = {
  server: http.Server
  reject: (err: Error) => void
}
let inFlight: InFlight | null = null

export function abortInFlight(reason = 'cancelled') {
  if (!inFlight) return
  // reject() ハンドラ内で aborted=true / settle / server.close を行う設計
  inFlight.reject(new Error(reason))
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  const res = await session.defaultSession.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed: ${res.status} ${text}`)
  }
  return res.json() as Promise<OAuthTokenResponse>
}

async function fetchUserEmail(accessToken: string): Promise<string> {
  const res = await session.defaultSession.fetch(
    'https://www.googleapis.com/oauth2/v3/userinfo',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) throw new Error(`userinfo fetch failed: ${res.status}`)
  const info = await res.json() as { email?: string }
  if (!info.email) throw new Error('Could not resolve email from userinfo')
  return info.email
}

export async function addGoogleAccount(opts: { loginHint?: string; scopes?: string[] } = {}): Promise<{ email: string }> {
  if (inFlight) throw new Error('Auth already in progress')

  const secret = readClientSecret()

  return await new Promise<{ email: string }>((resolve, reject) => {
    const state = crypto.randomBytes(32).toString('hex')
    const server = http.createServer()

    let settled = false
    let aborted = false  // post-abort race ガード: 非同期ハンドラ進行中に abort が来た場合に書き込みを止める
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      try { server.close() } catch { /* noop */ }
      if (inFlight && inFlight.server === server) inFlight = null
      fn()
    }
    const checkAborted = () => {
      if (aborted) throw new Error('OAuth flow aborted')
    }

    const timeout = setTimeout(() => {
      aborted = true
      settle(() => reject(new Error('OAuth timeout (5分以内に認証が完了しませんでした)')))
    }, OAUTH_TIMEOUT_MS)

    server.on('error', (err) => {
      clearTimeout(timeout)
      aborted = true
      settle(() => reject(err))
    })

    inFlight = {
      server,
      reject: (err: Error) => {
        clearTimeout(timeout)
        aborted = true
        settle(() => reject(err))
      },
    }

    server.listen(0, '127.0.0.1', async () => {
      try {
        const addr = server.address()
        if (!addr || typeof addr === 'string') throw new Error('Failed to bind loopback server')
        const port = addr.port
        // 127.0.0.1 で統一 (Google Cloud Console 側に登録する redirect_uri と揃える)
        const redirectUri = `http://127.0.0.1:${port}`
        const requestedScopes = opts.scopes && opts.scopes.length > 0 ? opts.scopes : REQUIRED_SCOPES
        const oAuth2 = new google.auth.OAuth2(secret.client_id, secret.client_secret, redirectUri)
        const url = oAuth2.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: requestedScopes,
          state,
          login_hint: opts.loginHint,
        })

        server.on('request', async (req, res) => {
          try {
            // GET / 以外は弾く (ブラウザの favicon 取得や悪意あるローカルアプリの POST など)
            if (req.method !== 'GET') {
              res.writeHead(405, { 'Allow': 'GET' })
              res.end('Method Not Allowed')
              return
            }
            if (!req.url) throw new Error('No request URL')
            const u = new URL(req.url, redirectUri)
            if (u.pathname !== '/') {
              res.writeHead(404)
              res.end('Not Found')
              return
            }
            const gotState = u.searchParams.get('state') ?? ''
            if (!timingSafeEqual(gotState, state)) throw new Error('state mismatch')
            const code = u.searchParams.get('code')
            if (!code) throw new Error(u.searchParams.get('error') ?? 'no code')

            checkAborted()
            const tokens = await exchangeCodeForTokens(secret.client_id, secret.client_secret, redirectUri, code)
            checkAborted()
            if (!tokens.refresh_token) {
              throw new Error(
                'refresh_token が返却されませんでした。Google アカウントの「サードパーティアクセス」から該当アプリを一度削除してから再試行してください。',
              )
            }
            if (!tokens.access_token) throw new Error('access_token が取得できませんでした')

            const email = await fetchUserEmail(tokens.access_token)
            checkAborted()

            const out = {
              token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              token_uri: secret.token_uri ?? 'https://oauth2.googleapis.com/token',
              client_id: secret.client_id,
              client_secret: secret.client_secret,
              scopes: requestedScopes,
              expiry: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
            }
            checkAborted()  // 書き込み直前の最終チェック
            await saveGoogleTokenForUser(email, out)

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(`<!doctype html><meta charset="utf-8"><title>Robot Secretary</title>
<body style="background:#0a0a14;color:#e2e8f0;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center"><h1 style="color:#a5b4fc">認証完了</h1><p>このタブは閉じて構いません。</p></div>
</body>`)
            clearTimeout(timeout)
            settle(() => resolve({ email }))
          } catch (err) {
            try {
              res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
              res.end(String((err as Error).message ?? err))
            } catch { /* noop */ }
            clearTimeout(timeout)
            settle(() => reject(err as Error))
          }
        })

        await shell.openExternal(url)
      } catch (err) {
        clearTimeout(timeout)
        settle(() => reject(err as Error))
      }
    })
  })
}

export async function removeGoogleAccount(email: string): Promise<void> {
  await deleteGoogleTokenForUser(email)
}
