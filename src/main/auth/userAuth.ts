import { shell, session } from 'electron'
import { google } from 'googleapis'
import * as http from 'node:http'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import keytar from 'keytar'
import { createClient, type Client } from '@libsql/client'
import {
  findUserByGoogleId,
  findUserById,
  createUserRecord,
  updateUserProfile,
  updateUserLastSeen,
  type UserRecord,
} from './userRegistry'
import { provisionUserDb, applyUserDbSchema } from './tursoProvisioner'

const KEYCHAIN_SERVICE = 'robot-secretary'
const KEYCHAIN_SESSION_ACCOUNT = 'session-token'
const CLIENT_SECRET_PATH = path.join(os.homedir(), '.config/gmail-triage/client_secret.json')
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000
const LOGIN_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

export type AppUser = UserRecord

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

async function exchangeCodeForTokens(
  clientId: string, clientSecret: string, redirectUri: string, code: string,
): Promise<{ access_token: string; refresh_token?: string }> {
  const body = new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' })
  const res = await session.defaultSession.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; refresh_token?: string }>
}

async function fetchGoogleProfile(accessToken: string): Promise<{
  sub: string; email: string; name?: string; picture?: string
}> {
  const res = await session.defaultSession.fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`userinfo fetch failed: ${res.status}`)
  return res.json() as Promise<{ sub: string; email: string; name?: string; picture?: string }>
}

async function runOAuthFlow(): Promise<{ sub: string; email: string; name?: string; picture?: string }> {
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

    server.on('error', (err) => { clearTimeout(timeout); settle(() => reject(err)) })

    server.listen(0, '127.0.0.1', async () => {
      try {
        const addr = server.address()
        if (!addr || typeof addr === 'string') throw new Error('Failed to bind loopback server')
        const redirectUri = `http://127.0.0.1:${addr.port}`
        const oAuth2 = new google.auth.OAuth2(secret.client_id, secret.client_secret, redirectUri)
        const authUrl = oAuth2.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: LOGIN_SCOPES, state })

        server.on('request', async (req, res) => {
          try {
            if (req.method !== 'GET' || !req.url) { res.writeHead(400).end(); return }
            const u = new URL(req.url, redirectUri)
            if (u.pathname !== '/') { res.writeHead(404).end(); return }
            const gotState = u.searchParams.get('state') ?? ''
            if (!timingSafeEqual(gotState, state)) throw new Error('state mismatch')
            const code = u.searchParams.get('code')
            if (!code) throw new Error(u.searchParams.get('error') ?? 'no code')

            const tokens = await exchangeCodeForTokens(secret.client_id, secret.client_secret, redirectUri, code)
            if (!tokens.access_token) throw new Error('access_token が取得できませんでした')
            const profile = await fetchGoogleProfile(tokens.access_token)
            if (!profile.sub || !profile.email) throw new Error('Google プロフィールの取得に失敗しました')

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(`<!doctype html><meta charset="utf-8"><title>Robot Secretary</title>
<body style="background:#0a0a14;color:#e2e8f0;font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center"><h2 style="color:#a5b4fc">ログイン完了</h2><p>このタブは閉じて構いません。</p></div></body>`)
            clearTimeout(timeout)
            settle(() => resolve(profile))
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

async function provisionAndRegisterUser(profile: {
  sub: string; email: string; name?: string; picture?: string
}): Promise<AppUser> {
  const id = crypto.randomUUID()
  console.log(`[auth] Provisioning new Turso DB for user ${profile.email}...`)

  const { dbName, dbUrl, dbToken } = await provisionUserDb(id)
  console.log(`[auth] DB created: ${dbName} → ${dbUrl}`)

  await applyUserDbSchema(dbUrl, dbToken)
  console.log('[auth] User DB schema applied')

  await createUserRecord({
    id,
    googleId: profile.sub,
    email: profile.email,
    displayName: profile.name ?? null,
    avatarUrl: profile.picture ?? null,
    dbName,
    dbUrl,
    dbToken,
  })

  return { id, googleId: profile.sub, email: profile.email, displayName: profile.name ?? null, avatarUrl: profile.picture ?? null, dbName, dbUrl, dbToken }
}

export async function loginWithGoogle(): Promise<AppUser> {
  const profile = await runOAuthFlow()

  // Check if user already exists in registry
  const existing = await findUserByGoogleId(profile.sub)
  if (existing) {
    await updateUserProfile(existing.id, {
      email: profile.email,
      displayName: profile.name ?? null,
      avatarUrl: profile.picture ?? null,
    })
    await storeSessionToken(existing.id)
    console.log(`[auth] Existing user found: ${profile.email} → ${existing.dbName}`)
    return { ...existing, email: profile.email, displayName: profile.name ?? null, avatarUrl: profile.picture ?? null }
  }

  // New user — provision a dedicated DB
  const user = await provisionAndRegisterUser(profile)
  await storeSessionToken(user.id)
  return user
}

export async function resolveUserFromToken(token: string): Promise<AppUser | null> {
  const user = await findUserById(token)
  if (!user) return null
  await updateUserLastSeen(user.id)
  return user
}

export function createUserDbClient(user: AppUser): Client {
  return createClient({ url: user.dbUrl, authToken: user.dbToken })
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
