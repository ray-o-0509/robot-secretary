import { google } from 'googleapis'
import { getGoogleAuth, listAccounts, sanitizeGoogleError } from '../shared/googleAuth'
import { createLogger } from '../../logger'

const log = createLogger('calendar')

type CalendarEvent = {
  id: string
  account: string
  title: string
  start: string | undefined
  end: string | undefined
  allDay: boolean
  location: string | null
}

function isAllDay(start?: { date?: string | null; dateTime?: string | null }) {
  return Boolean(start?.date && !start?.dateTime)
}

async function getEventsFor(
  account: string,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const auth = getGoogleAuth(account)
  const calendar = google.calendar({ version: 'v3', auth })
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 50,
  })
  return (res.data.items ?? [])
    .filter((e) => e.id)
    .map<CalendarEvent>((e) => ({
      id: e.id as string,
      account,
      title: e.summary ?? '(no title)',
      start: e.start?.dateTime ?? e.start?.date ?? undefined,
      end: e.end?.dateTime ?? e.end?.date ?? undefined,
      allDay: isAllDay(e.start ?? undefined),
      location: e.location ?? null,
    }))
}

async function getEventsInRange(timeMin: Date, timeMax: Date) {
  const accounts = listAccounts()
  const perAccount = await Promise.all(
    accounts.map(async (a) => {
      try {
        return { account: a, events: await getEventsFor(a, timeMin.toISOString(), timeMax.toISOString()), error: null as string | null }
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err)
        log.error(`get_events error: ${a} →`, raw)
        return { account: a, events: [] as CalendarEvent[], error: sanitizeGoogleError(err) }
      }
    }),
  )

  const seen = new Set<string>()
  const events: CalendarEvent[] = []
  for (const { events: list } of perAccount) {
    for (const ev of list) {
      if (seen.has(ev.id)) continue
      seen.add(ev.id)
      events.push(ev)
    }
  }
  events.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))

  return {
    accounts: perAccount.map(({ account, events, error }) => ({ account, error, count: events.length })),
    events,
  }
}

export async function getTodayEvents() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return getEventsInRange(start, end)
}

export async function getTomorrowEvents() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2)
  return getEventsInRange(start, end)
}

export async function createCalendarEvent(opts: {
  title: string
  startDateTime: string
  endDateTime: string
  account?: string
  allDay?: boolean
  location?: string
  description?: string
  attendees?: string[]
  timeZone?: string
}) {
  const { requireConfirmation } = await import('../confirmation/index')
  const account = opts.account ?? listAccounts()[0]
  if (!account) throw new Error('No Google account registered')

  const tz = opts.timeZone ?? 'Asia/Tokyo'
  const attendees = opts.attendees ?? []

  if (attendees.length > 0) {
    const confirmed = await requireConfirmation({
      action: 'Create calendar event',
      summary: opts.title,
      details: {
        'Time': `${opts.startDateTime} 〜 ${opts.endDateTime}`,
        'Attendees': attendees.join(', '),
        ...(opts.location ? { 'Location': opts.location } : {}),
      },
    })
    if (!confirmed) return { ok: false, cancelled: true }
  }

  const auth = getGoogleAuth(account)
  const calendar = google.calendar({ version: 'v3', auth })
  const event = {
    summary: opts.title,
    ...(opts.location ? { location: opts.location } : {}),
    ...(opts.description ? { description: opts.description } : {}),
    start: opts.allDay
      ? { date: opts.startDateTime.slice(0, 10) }
      : { dateTime: opts.startDateTime, timeZone: tz },
    end: opts.allDay
      ? { date: opts.endDateTime.slice(0, 10) }
      : { dateTime: opts.endDateTime, timeZone: tz },
    ...(attendees.length > 0 ? { attendees: attendees.map((email) => ({ email })) } : {}),
  }

  const res = await calendar.events.insert({ calendarId: 'primary', requestBody: event })
  return {
    ok: true,
    id: res.data.id,
    title: res.data.summary,
    start: res.data.start?.dateTime ?? res.data.start?.date,
    end: res.data.end?.dateTime ?? res.data.end?.date,
    htmlLink: res.data.htmlLink,
  }
}

export async function getUpcomingEvents(days = 7) {
  const clampedDays = Math.max(1, Math.min(14, Math.floor(days)))
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + clampedDays)
  return getEventsInRange(start, end)
}
