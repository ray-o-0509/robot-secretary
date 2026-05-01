import { useTranslation } from 'react-i18next'
import { CYAN, FONT_MONO, MAGENTA } from '../../display/styles'
import { Card } from '../../display/components/Card'
import { EmptyState } from '../../display/components/EmptyState'
import { ErrorState } from '../../display/components/ErrorState'
import type { PanelPayload } from '../../display/types'

type EmailMessage = {
  id: string
  account: string
  from: string
  subject: string
  date: string
  snippet: string | null | undefined
}

type EmailSearchData = {
  query: string
  accounts: Array<{ account: string; error: string | null; count: number }>
  messages: EmailMessage[]
}

interface Props {
  payload: PanelPayload
}

export function EmailSearchView({ payload }: Props) {
  const { t } = useTranslation()
  if (payload.error) {
    return <ErrorState message={payload.error} hint={t('gmail.tokenExpired')} />
  }

  const data = payload.data as EmailSearchData
  if (!data) return <EmptyState message="NO DATA" />

  const errors = data.accounts.filter((a) => a.error)

  return (
    <>
      <div style={{
        fontFamily: FONT_MONO,
        fontSize: 10,
        letterSpacing: 1.5,
        color: CYAN,
        opacity: 0.75,
        marginBottom: 10,
        paddingBottom: 8,
        borderBottom: `1px solid ${CYAN}30`,
      }}>
        {t('gmail.query')} // <span style={{ color: '#e8f6ff', opacity: 1 }}>{data.query}</span>
      </div>

      {errors.map((a) => (
        <ErrorState
          key={a.account}
          message={`${a.account}: ${a.error}`}
          hint="認証切れなら `scripts/auth-google.mjs` を走らせろ"
        />
      ))}

      {data.messages.length === 0 ? (
        <EmptyState message={t('gmail.noMatch')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.messages.map((m, i) => (
            <button
              key={`${m.account}-${m.id ?? i}`}
              onClick={() => window.electronAPI?.openEmailDetail(m.account, m.id)}
              title={t('gmail.clickToOpen')}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                margin: 0,
                textAlign: 'left',
                cursor: 'pointer',
                width: '100%',
                display: 'block',
              }}
            >
              <Card accent="cyan">
                <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, fontWeight: 700, color: '#e8f6ff', marginBottom: 4 }}>
                  {m.subject || t('gmail.noSubject')}
                </div>
                <div style={{
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  color: 'rgba(232, 246, 255, 0.7)',
                  marginBottom: 5,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {parseFrom(m.from)}
                  </span>
                  <span style={{ flexShrink: 0, color: MAGENTA, opacity: 0.85 }}>
                    {formatDate(m.date, t)}
                  </span>
                </div>
                <div style={{
                  fontFamily: FONT_MONO,
                  fontSize: 9,
                  color: CYAN,
                  opacity: 0.6,
                  marginBottom: m.snippet ? 5 : 0,
                }}>
                  ▸ {m.account}
                </div>
                {m.snippet && (
                  <div style={{
                    fontFamily: FONT_MONO,
                    fontSize: 10.5,
                    color: 'rgba(232, 246, 255, 0.55)',
                    lineHeight: 1.55,
                  }}>
                    {m.snippet}
                  </div>
                )}
              </Card>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function parseFrom(raw: string): string {
  const m = raw.match(/^(.*?)\s*<(.+)>$/)
  if (m) return m[1].replace(/^"|"$/g, '').trim() || m[2]
  return raw
}

function formatDate(raw: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const d = new Date(raw)
  if (isNaN(d.getTime())) return ''
  const now = Date.now()
  const diff = now - d.getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return t('gmail.justNow')
  if (min < 60) return t('gmail.minutesAgo', { count: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return t('gmail.hoursAgo', { count: hr })
  const day = Math.floor(hr / 24)
  if (day < 7) return t('gmail.daysAgo', { count: day })
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}`
}
