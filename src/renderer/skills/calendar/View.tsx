import { CYAN, FONT_MONO, MAGENTA } from '../styles'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import type { PanelPayload } from '../types'

type CalendarData = {
  accounts: Array<{ account: string; error: string | null; count: number }>
  events: Array<{
    id: string
    account: string
    title: string
    start: string | undefined
    end: string | undefined
    allDay: boolean
    location: string | null
  }>
}

interface Props {
  payload: PanelPayload
}

export function CalendarView({ payload }: Props) {
  if (payload.error) {
    return <ErrorState message={payload.error} />
  }

  const data = payload.data as CalendarData
  const errors = data?.accounts.filter((a) => a.error) ?? []

  if (!data || data.events.length === 0) {
    return (
      <>
        {errors.map((a) => (
          <ErrorState key={a.account} message={`${a.account}: ${a.error}`} />
        ))}
        <EmptyState message={emptyMessage(payload.type)} />
      </>
    )
  }

  // 今週の場合は日ごとにグループ化、それ以外はフラット
  if (payload.type === 'calendar_week') {
    const groups = groupByDate(data.events)
    return (
      <>
        {errors.map((a) => (
          <ErrorState key={a.account} message={`${a.account}: ${a.error}`} />
        ))}
        {Array.from(groups.entries()).map(([dayKey, events]) => (
          <div key={dayKey} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1.5,
                color: CYAN,
                textShadow: `0 0 6px ${CYAN}80`,
                marginTop: 6,
              }}
            >
              ▸ {dayKey} ({events.length})
            </div>
            {events.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        ))}
      </>
    )
  }

  return (
    <>
      {errors.map((a) => (
        <ErrorState key={a.account} message={`${a.account}: ${a.error}`} />
      ))}
      {data.events.map((e) => (
        <EventCard key={e.id} event={e} />
      ))}
    </>
  )
}

function EventCard({ event }: { event: CalendarData['events'][number] }) {
  return (
    <Card accent="cyan">
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 11.5,
          fontWeight: 700,
          color: '#e8f6ff',
          marginBottom: 4,
        }}
      >
        {event.title}
      </div>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 10.5,
          color: MAGENTA,
          textShadow: `0 0 6px ${MAGENTA}60`,
          marginBottom: event.location ? 4 : 0,
        }}
      >
        {formatTime(event)}
      </div>
      {event.location && (
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: 'rgba(232, 246, 255, 0.6)',
          }}
        >
          @ {event.location}
        </div>
      )}
    </Card>
  )
}

function formatTime(e: CalendarData['events'][number]): string {
  if (e.allDay) return '終日'
  if (!e.start) return ''
  const start = new Date(e.start)
  const end = e.end ? new Date(e.end) : null
  const fmt = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (!end) return fmt(start)
  return `${fmt(start)} - ${fmt(end)}`
}

function groupByDate(events: CalendarData['events']) {
  const groups = new Map<string, CalendarData['events']>()
  for (const e of events) {
    if (!e.start) continue
    const d = new Date(e.start)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} (${['日', '月', '火', '水', '木', '金', '土'][d.getDay()]})`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(e)
  }
  return groups
}

function emptyMessage(type: PanelPayload['type']): string {
  if (type === 'calendar_today') return '今日は予定なし。サボれ'
  if (type === 'calendar_tomorrow') return '明日も予定なし'
  return '予定なし'
}
