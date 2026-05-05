import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { CYAN, FONT_MONO, MAGENTA } from '../../display/styles'
import { Card } from '../../display/components/Card'
import { EmptyState } from '../../display/components/EmptyState'
import { ErrorState } from '../../display/components/ErrorState'
import { LoadingState } from '../../display/components/LoadingState'
import type { PanelPayload } from '../../display/types'

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
  const { t } = useTranslation()

  if (payload.loading && !payload.data) return <LoadingState count={3} />

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
        <EmptyState message={emptyMessage(payload.type, t)} />
      </>
    )
  }

  // 今週の場合は日ごとにグループ化、それ以外はフラット
  if (payload.type === 'calendar_week') {
    const groups = groupByDate(data.events, t)
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
              <EventCard key={e.id} event={e} t={t} />
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
        <EventCard key={e.id} event={e} t={t} />
      ))}
    </>
  )
}

function EventCard({ event, t }: { event: CalendarData['events'][number]; t: TFunction }) {
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
        {formatTime(event, t)}
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

function formatTime(e: CalendarData['events'][number], t: TFunction): string {
  if (e.allDay) return t('calendar.allDay')
  if (!e.start) return ''
  const start = new Date(e.start)
  const end = e.end ? new Date(e.end) : null
  const fmt = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (!end) return fmt(start)
  return `${fmt(start)} - ${fmt(end)}`
}

function groupByDate(events: CalendarData['events'], t: TFunction) {
  const days = t('calendar.daysShort', { returnObjects: true }) as string[]
  const groups = new Map<string, CalendarData['events']>()
  for (const e of events) {
    if (!e.start) continue
    const d = new Date(e.start)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} (${days[d.getDay()]})`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(e)
  }
  return groups
}

function emptyMessage(type: PanelPayload['type'], t: TFunction): string {
  if (type === 'calendar_today') return t('calendar.noEventsToday')
  if (type === 'calendar_tomorrow') return t('calendar.noEventsTomorrow')
  return t('calendar.noEvents')
}
