import { shell, session } from 'electron'
import { google } from 'googleapis'
import * as http from 'node:http'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import keytar from 'keytar'
import type { Client } from '@libsql/client'

const KEYCHAIN_SERVICE = 'robot-secretary'
const KEYCHAIN_SESSION_ACCOUNT = 'session-token'
const CLIENT_SECRET_PATH = path.join(os.homedir(), '.config/gmail-triage/client_secret.json')
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000
const LOGIN_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

export type AppUser = {
  id: string
  googleId: string
  email: string
  displayName: string | null
  avatarUrl: string | null
}

type ClientSecret = { client_id: string; client_secret: string }

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

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

// Electron の session.defaultSession.fetch を使ってトークン交換を行う。
// gaxios/googleapis は main プロセスで ETIMEDOUT になるため使用しない。
async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
): Promise<{ access_token: string; refresh_token?: string; id_token?: string }> {
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
  return res.json() as Promise<{ access_token: string; refresh_token?: string; id_token?: string }>
}

async function fetchUserInfo(accessToken: string): Promise<{
  sub: string; email: string; name?: string; picture?: string
}> {
  // v3 (OpenID Connect) endpoint returns `sub` — v2 returns `id`, avoid confusion
  const res = await session.defaultSession.fetch(
    'https://www.googleapis.com/oauth2/v3/userinfo',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) throw new Error(`userinfo fetch failed: ${res.status}`)
  return res.json() as Promise<{ sub: string; email: string; name?: string; picture?: string }>
}

async function fetchGoogleProfile(): Promise<{
  googleId: string; email: string; displayName: string | null; avatarUrl: string | null
}> {
  const secret = readClientSecret()

  return new Promise((resolve, reject) => {
    const state = crypto.randomBytes(32).toString('hex')
    const server = http.createServer()
    let settled = false

    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      try { server.close() } catch { /* noop */ }
      fn()
    }

    const timeout = setTimeout(() => {
      settle(() => reject(new Error('ログインタイムアウト（5分以内に認証を完了してください）')))
    }, OAUTH_TIMEOUT_MS)

    server.on('error', (err) => {
      clearTimeout(timeout)
      settle(() => reject(err))
    })

    server.listen(0, '127.0.0.1', async () => {
      try {
        const addr = server.address()
        if (!addr || typeof addr === 'string') throw new Error('Failed to bind loopback server')
        const redirectUri = `http://127.0.0.1:${addr.port}`

        // googleapis は authUrl 生成だけに使う（ネットワーク通信なし）
        const oAuth2 = new google.auth.OAuth2(secret.client_id, secret.client_secret, redirectUri)
        const authUrl = oAuth2.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: LOGIN_SCOPES,
          state,
        })

        server.on('request', async (req, res) => {
          try {
            if (req.method !== 'GET' || !req.url) { res.writeHead(400).end(); return }
            const u = new URL(req.url, redirectUri)
            if (u.pathname !== '/') { res.writeHead(404).end(); return }
            const gotState = u.searchParams.get('state') ?? ''
            if (!timingSafeEqual(gotState, state)) throw new Error('state mismatch')
            const code = u.searchParams.get('code')
            if (!code) throw new Error(u.searchParams.get('error') ?? 'no code')

            // Electron の Chromium ネットワークスタックでトークン交換
            const tokens = await exchangeCodeForTokens(
              secret.client_id, secret.client_secret, redirectUri, code,
            )
            if (!tokens.access_token) throw new Error('access_token が取得できませんでした')

            const info = await fetchUserInfo(tokens.access_token)
            const { sub: googleId, email, name, picture } = info
            if (!googleId || !email) throw new Error('Google プロフィールの取得に失敗しました')

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(`<!doctype html><meta charset="utf-8"><title>Robot Secretary</title>
<body style="background:#0a0a14;color:#e2e8f0;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center"><h2 style="color:#a5b4fc">ログイン完了</h2><p>このタブは閉じて構いません。</p></div>
</body>`)
            clearTimeout(timeout)
            settle(() => resolve({
              googleId,
              email,
              displayName: name ?? null,
              avatarUrl: picture ?? null,
            }))
          } catch (err) {
            try { res.writeHead(500).end(String((err as Error).message)) } catch { /* noop */ }
            clearTimeout(timeout)
            settle(() => reject(err as Error))
          }
        })

        await shell.openExternal(authUrl)
      } catch (err) {
        clearTimeout(timeout)
        settle(() => reject(err as Error))
      }
    })
  })
}

async function upsertUser(db: Client, profile: {
  googleId: string; email: string; displayName: string | null; avatarUrl: string | null
}): Promise<AppUser> {
  const now = new Date().toISOString()
  const existing = await db.execute({
    sql: 'SELECT id FROM users WHERE google_id = ?',
    args: [profile.googleId],
  })
  if (existing.rows.length > 0) {
    const id = existing.rows[0].id as string
    await db.execute({
      sql: 'UPDATE users SET email=?, display_name=?, avatar_url=?, last_seen_at=? WHERE id=?',
      args: [profile.email, profile.displayName, profile.avatarUrl, now, id],
    })
    return { id, ...profile }
  }
  const id = crypto.randomUUID()
  await db.execute({
    sql: 'INSERT INTO users (id, google_id, email, display_name, avatar_url, created_at, last_seen_at) VALUES (?,?,?,?,?,?,?)',
    args: [id, profile.googleId, profile.email, profile.displayName, profile.avatarUrl, now, now],
  })
  return { id, ...profile }
}

export async function loginWithGoogle(db: Client): Promise<AppUser> {
  const profile = await fetchGoogleProfile()
  const user = await upsertUser(db, profile)
  await storeSessionToken(user.id)
  return user
}

export async function getStoredSessionToken(): Promise<string | null> {
  return keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_SESSION_ACCOUNT)
}

export async function storeSessionToken(userId: string): Promise<void> {
  await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_SESSION_ACCOUNT, userId)
}

export async function clearSessionToken(): Promise<void> {
  await keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_SESSION_ACCOUNT)
}

export async function resolveUserFromToken(token: string, db: Client): Promise<AppUser | null> {
  const now = new Date().toISOString()
  const result = await db.execute({
    sql: 'SELECT id, google_id, email, display_name, avatar_url FROM users WHERE id = ?',
    args: [token],
  })
  if (result.rows.length === 0) return null
  const row = result.rows[0]
  await db.execute({
    sql: 'UPDATE users SET last_seen_at=? WHERE id=?',
    args: [now, token],
  })
  return {
    id: row.id as string,
    googleId: row.google_id as string,
    email: row.email as string,
    displayName: row.display_name as string | null,
    avatarUrl: row.avatar_url as string | null,
  }
}
