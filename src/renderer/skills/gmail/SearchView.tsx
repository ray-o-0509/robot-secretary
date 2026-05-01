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
  if (payload.error) {
    return <ErrorState message={payload.error} hint="トークン切れの可能性。`scripts/auth-google.mjs <email>` で再認証しろ" />
  }

  const data = payload.data as EmailSearchData
  if (!data) return <EmptyState message="NO DATA" />

  const errors = data.accounts.filter((a) => a.error)

  return (
    <>
      {/* 検索クエリ表示 */}
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
        QUERY // <span style={{ color: '#e8f6ff', opacity: 1 }}>{data.query}</span>
      </div>

      {/* エラーアカウント */}
      {errors.map((a) => (
        <ErrorState
          key={a.account}
          message={`${a.account}: ${a.error}`}
          hint="認証切れなら `scripts/auth-google.mjs` を走らせろ"
        />
      ))}

      {/* 検索結果 */}
      {data.messages.length === 0 ? (
        <EmptyState message={`「${data.query}」に一致するメールはありません`} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.messages.map((m, i) => (
            <button
              key={`${m.account}-${m.id ?? i}`}
              onClick={() => window.electronAPI?.openEmailDetail(m.account, m.id)}
              title="クリックで詳細を別ウィンドウで開く"
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
                  {m.subject || '(件名なし)'}
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
                    {formatDate(m.date)}
                  </span>
                </div>
                {/* アカウントバッジ */}
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

function formatDate(raw: string): string {
  const d = new Date(raw)
  if (isNaN(d.getTime())) return ''
  const now = Date.now()
  const diff = now - d.getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'たった今'
  if (min < 60) return `${min}分前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}時間前`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}日前`
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}`
}
