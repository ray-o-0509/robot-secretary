import { useTranslation } from 'react-i18next'
import i18next from 'i18next'
import { CYAN, FONT_MONO, MAGENTA } from '../../display/styles'
import { Card } from '../../display/components/Card'
import { EmptyState } from '../../display/components/EmptyState'
import { ErrorState } from '../../display/components/ErrorState'
import { LoadingState } from '../../display/components/LoadingState'
import type { PanelPayload } from '../../display/types'

type EmailMessage = {
  id: string
  threadId: string
  account: string
  from: string
  subject: string
  date: string
  snippet: string | null | undefined
}

type EmailData = {
  accounts: Array<{ account: string; error: string | null; count: number }>
  messages: EmailMessage[]
}

type Thread = {
  threadId: string
  messages: EmailMessage[]
  latest: EmailMessage
}

interface Props {
  payload: PanelPayload
}

export function EmailView({ payload }: Props) {
  const { t } = useTranslation()

  if (payload.loading && !payload.data) return <LoadingState count={5} />

  if (payload.error) {
    return <ErrorState message={payload.error} hint={t('gmail.tokenExpiredHint')} />
  }

  const data = payload.data as EmailData
  if (!data || (data.messages.length === 0 && data.accounts.every((a) => !a.error))) {
    return (
      <>
        <AccountStatus accounts={data?.accounts ?? []} />
        <EmptyState message="INBOX IS EMPTY" />
      </>
    )
  }

  // アカウントごとにグループ化 → 各アカウント内でスレッドまとめ
  const accountGroups = new Map<string, EmailMessage[]>()
  for (const m of data.messages) {
    if (!accountGroups.has(m.account)) accountGroups.set(m.account, [])
    accountGroups.get(m.account)!.push(m)
  }

  return (
    <>
      <AccountStatus accounts={data.accounts} />
      {Array.from(accountGroups.entries()).map(([account, messages]) => {
        const threads = groupByThread(messages)
        return (
          <div key={account} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              fontFamily: FONT_MONO, fontSize: 10, fontWeight: 700,
              letterSpacing: 1.5, color: CYAN, textShadow: `0 0 6px ${CYAN}80`,
              opacity: 0.9, marginTop: 6,
            }}>
              ▸ {account} ({threads.length})
            </div>
            {threads.map((thread) => (
              <ThreadCard key={thread.threadId} thread={thread} />
            ))}
          </div>
        )
      })}
    </>
  )
}

function groupByThread(messages: EmailMessage[]): Thread[] {
  const map = new Map<string, EmailMessage[]>()
  for (const m of messages) {
    const key = m.threadId ?? m.id
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(m)
  }
  return Array.from(map.values()).map((msgs) => {
    // APIは新しい順で返ってくるので最初が最新
    const latest = msgs[0]
    return { threadId: latest.threadId ?? latest.id, messages: msgs, latest }
  })
}

function ThreadCard({ thread }: { thread: Thread }) {
  const { t } = useTranslation()
  const { latest, messages } = thread
  const count = messages.length
  const isThread = count > 1

  return (
    <button
      onClick={() => window.electronAPI?.openEmailDetail(latest.account, latest.id)}
      title={t('gmail.clickForDetail')}
      style={{
        background: 'transparent', border: 'none',
        padding: 0, margin: 0, textAlign: 'left',
        cursor: 'pointer', width: '100%', display: 'block',
      }}
    >
      <Card accent="cyan">
        {/* 件名 + スレッドカウントバッジ */}
        <div style={{
          display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between', gap: 8, marginBottom: 4,
        }}>
          <div style={{
            fontFamily: FONT_MONO, fontSize: 11.5, fontWeight: 700,
            color: '#e8f6ff', flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {latest.subject || t('gmail.noSubject')}
          </div>
          {isThread && (
            <span style={{
              flexShrink: 0,
              fontFamily: FONT_MONO,
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: 0.5,
              color: CYAN,
              background: `${CYAN}18`,
              border: `1px solid ${CYAN}50`,
              borderRadius: 10,
              padding: '1px 7px',
              textShadow: `0 0 6px ${CYAN}80`,
            }}>
              {count}
            </span>
          )}
        </div>

        {/* 送信者 + 日時 */}
        <div style={{
          fontFamily: FONT_MONO, fontSize: 10,
          color: 'rgba(232, 246, 255, 0.7)',
          marginBottom: latest.snippet ? 6 : 0,
          display: 'flex', justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isThread
              ? formatParticipants(messages)
              : parseFrom(latest.from)}
          </span>
          <span style={{ flexShrink: 0, color: MAGENTA, opacity: 0.85 }}>
            {formatDate(latest.date)}
          </span>
        </div>

        {/* スニペット */}
        {latest.snippet && (
          <div style={{
            fontFamily: FONT_MONO, fontSize: 10.5,
            color: 'rgba(232, 246, 255, 0.55)', lineHeight: 1.55,
          }}>
            {latest.snippet}
          </div>
        )}
      </Card>
    </button>
  )
}

function formatParticipants(messages: EmailMessage[]): string {
  const names = [...new Set(messages.map((m) => parseFrom(m.from)))]
  if (names.length <= 2) return names.join(', ')
  return `${names[0]}, ${names[1]} +${names.length - 2}`
}

function AccountStatus({
  accounts,
}: {
  accounts: Array<{ account: string; error: string | null; count: number }>
}) {
  const { t } = useTranslation()
  const errors = accounts.filter((a) => a.error)
  if (errors.length === 0) return null
  return (
    <>
      {errors.map((a) => (
        <ErrorState
          key={a.account}
          message={`${a.account}: ${a.error}`}
          hint={t('gmail.authExpiredHint')}
        />
      ))}
    </>
  )
}

function parseFrom(raw: string): string {
  // "Name <email>" → "Name"
  const m = raw.match(/^(.*?)\s*<(.+)>$/)
  if (m) return m[1].replace(/^"|"$/g, '').trim() || m[2]
  return raw
}

function formatDate(raw: string): string {
  const d = new Date(raw)
  if (isNaN(d.getTime())) return ''
  const now = Date.now()
  const diff = now - d.getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return i18next.t('time.justNow')
  if (min < 60) return i18next.t('time.minutesAgo', { count: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return i18next.t('time.hoursAgo', { count: hr })
  const day = Math.floor(hr / 24)
  if (day < 7) return i18next.t('time.daysAgo', { count: day })
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}`
}
