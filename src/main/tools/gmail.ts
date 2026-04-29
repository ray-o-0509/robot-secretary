import { google } from 'googleapis'
import * as fs from 'fs'
import * as path from 'path'

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send']
const TOKEN_PATH = path.join(process.env.HOME ?? '', '.robot-secretary-gmail-token.json')

function getAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が未設定です')

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob')

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'))
    oAuth2Client.setCredentials(token)
  }

  return oAuth2Client
}

export async function getUnreadEmails(maxResults = 5) {
  const auth = getAuth()
  const gmail = google.gmail({ version: 'v1', auth })

  const list = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread',
    maxResults,
  })

  const messages = list.data.messages ?? []
  const results = []

  for (const msg of messages) {
    if (!msg.id) continue
    const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] })
    const headers = detail.data.payload?.headers ?? []
    const get = (name: string) => headers.find((h) => h.name === name)?.value ?? ''

    results.push({
      from: get('From'),
      subject: get('Subject'),
      date: get('Date'),
      snippet: detail.data.snippet,
    })
  }

  return results
}
