#!/usr/bin/env node
// Gmail / Calendar の OAuth トークンを (再)発行するワンショットスクリプト。
// 既存の gmail-triage スキル(~/.config/gmail-triage/) と同じ client_secret / トークン形式を再利用。
//
// 使い方:
//   node scripts/auth-google.mjs <your-email@example.com>
//
// ブラウザが開いて Google 同意画面を表示するので承認してください。
// 完了すると ~/.config/gmail-triage/tokens/<email>.json に保存されます。

import { google } from 'googleapis'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { exec } from 'node:child_process'
import crypto from 'node:crypto'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive',
]

const email = process.argv[2]
if (!email) {
  console.error('Usage: node scripts/auth-google.mjs <email>')
  process.exit(1)
}

const SECRET_PATH = path.join(os.homedir(), '.config/gmail-triage/client_secret.json')
const TOKENS_DIR = path.join(os.homedir(), '.config/robot-secretary/google-tokens')
const TOKEN_PATH = path.join(TOKENS_DIR, `${email}.json`)

const secret = JSON.parse(fs.readFileSync(SECRET_PATH, 'utf-8')).installed
fs.mkdirSync(TOKENS_DIR, { recursive: true })

const server = http.createServer()
server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port
  const redirectUri = `http://localhost:${port}`
  const oAuth2 = new google.auth.OAuth2(secret.client_id, secret.client_secret, redirectUri)
  const state = crypto.randomBytes(16).toString('hex')
  const url = oAuth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
    login_hint: email,
  })

  console.log(`\nブラウザが開かない場合は以下を開いてください:\n${url}\n`)
  exec(`open "${url}"`)

  server.on('request', async (req, res) => {
    try {
      const u = new URL(req.url, redirectUri)
      if (u.searchParams.get('state') !== state) throw new Error('state mismatch')
      const code = u.searchParams.get('code')
      if (!code) throw new Error(u.searchParams.get('error') ?? 'no code')

      const { tokens } = await oAuth2.getToken(code)
      const out = {
        token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_uri: secret.token_uri,
        client_id: secret.client_id,
        client_secret: secret.client_secret,
        scopes: SCOPES,
        expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      }
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(out, null, 2))

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<h1>認証完了</h1><p>このタブは閉じて構いません。</p>')
      console.log(`\n保存しました: ${TOKEN_PATH}`)
      if (!tokens.refresh_token) {
        console.warn('警告: refresh_token が返却されませんでした。Google アカウントの「サードパーティアクセス」から該当アプリを一度削除してから再実行してください。')
      }
      server.close()
    } catch (e) {
      res.writeHead(500)
      res.end(String(e))
      console.error('ERR:', e)
      server.close()
    }
  })
})
