import { google } from 'googleapis'
import * as fs from 'fs'
import * as path from 'path'

const TOKEN_PATH = path.join(process.env.HOME ?? '', '.robot-secretary-gmail-token.json')

function getAuth() {
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  )
  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8')))
  }
  return oAuth2Client
}

export async function getTodayEvents() {
  const auth = getAuth()
  const calendar = google.calendar({ version: 'v3', auth })

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  })

  return (res.data.items ?? []).map((e) => ({
    title: e.summary,
    start: e.start?.dateTime ?? e.start?.date,
    end: e.end?.dateTime ?? e.end?.date,
    location: e.location,
  }))
}

export async function getTomorrowEvents() {
  const auth = getAuth()
  const calendar = google.calendar({ version: 'v3', auth })

  const now = new Date()
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2)

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: startOfTomorrow.toISOString(),
    timeMax: endOfTomorrow.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  })

  return (res.data.items ?? []).map((e) => ({
    title: e.summary,
    start: e.start?.dateTime ?? e.start?.date,
    end: e.end?.dateTime ?? e.end?.date,
    location: e.location,
  }))
}
