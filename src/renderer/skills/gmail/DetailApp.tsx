import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CYAN, FONT_MONO, MAGENTA } from '../../display/styles'
import { DisplayShell } from '../../display/DisplayShell'

type EmailDetail = {
  id: string
  account: string
  from: string
  to: string
  cc: string
  subject: string
  date: string
  snippet: string
  html: string | null
  text: string | null
}

export function EmailDetailApp() {
  const { t } = useTranslation()
  const [args, setArgs] = useState<{ account: string; id: string } | null>(null)
  const [detail, setDetail] = useState<EmailDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI?.onEmailDetailArgs((a) => setArgs(a))
  }, [])

  useEffect(() => {
    if (!args) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setDetail(null)
    ;(async () => {
      try {
        const res = (await window.electronAPI?.callTool('get_email_detail', {
          account: args.account,
          id: args.id,
        })) as { result?: EmailDetail; error?: string }
        if (cancelled) return
        if (res?.error) setError(res.error)
        else if (res?.result) setDetail(res.result)
        else setError(t('gmail.emptyResponse'))
      } catch (err) {
        if (!cancelled) setError(String(err instanceof Error ? err.message : err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [args])

  return (
    <DisplayShell
      label={`◢ MAIL // DETAIL${loading ? ' // FETCHING…' : ''}`}
      loading={loading}
      onClose={() => window.electronAPI?.closeEmailDetail()}
    >
      {!args && <Standby text={t('gmail.standby')} />}
      {args && loading && !detail && <Standby text="LOADING…" />}
      {error && <ErrorBlock message={error} />}
      {detail && <DetailBody detail={detail} />}
    </DisplayShell>
  )
}

function DetailBody({ detail }: { detail: EmailDetail }) {
  const { t } = useTranslation()
  return (
    <>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 14,
          fontWeight: 700,
          color: '#e8f6ff',
          lineHeight: 1.4,
          wordBreak: 'break-word',
          textShadow: `0 0 6px ${CYAN}40`,
        }}
      >
        {detail.subject || t('gmail.noSubject')}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          columnGap: 10,
          rowGap: 4,
          fontFamily: FONT_MONO,
          fontSize: 10.5,
          color: 'rgba(232, 246, 255, 0.75)',
          padding: '8px 10px',
          background: 'rgba(8, 12, 24, 0.6)',
          border: `1px solid ${CYAN}30`,
        }}
      >
        <Label>FROM</Label>
        <span style={{ wordBreak: 'break-all' }}>{detail.from || '—'}</span>
        <Label>TO</Label>
        <span style={{ wordBreak: 'break-all' }}>{detail.to || '—'}</span>
        {detail.cc && (
          <>
            <Label>CC</Label>
            <span style={{ wordBreak: 'break-all' }}>{detail.cc}</span>
          </>
        )}
        <Label>DATE</Label>
        <span>{detail.date || '—'}</span>
        <Label>ACCOUNT</Label>
        <span>{detail.account}</span>
      </div>

      <Body html={detail.html} text={detail.text} snippet={detail.snippet} />
    </>
  )
}

function Body({
  html,
  text,
  snippet,
}: {
  html: string | null
  text: string | null
  snippet: string
}) {
  const { t } = useTranslation()
  if (html) {
    return (
      <iframe
        title="email body"
        sandbox=""
        srcDoc={html}
        style={{
          width: '100%',
          minHeight: 400,
          flex: 1,
          border: `1px solid ${CYAN}30`,
          background: '#fafafa',
        }}
      />
    )
  }
  const content = text ?? snippet ?? ''
  return (
    <pre
      style={{
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: FONT_MONO,
        fontSize: 11,
        lineHeight: 1.6,
        color: 'rgba(232, 246, 255, 0.85)',
        padding: 12,
        background: 'rgba(8, 12, 24, 0.6)',
        border: `1px solid ${CYAN}30`,
        flex: 1,
      }}
    >
      {content || t('gmail.noBody')}
    </pre>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        color: CYAN,
        textShadow: `0 0 6px ${CYAN}80`,
        fontWeight: 700,
        letterSpacing: 1.5,
        fontSize: 9.5,
        alignSelf: 'baseline',
      }}
    >
      {children}
    </span>
  )
}

function Standby({ text }: { text: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: FONT_MONO,
        color: CYAN,
        fontSize: 11,
        letterSpacing: 2,
        opacity: 0.7,
      }}
    >
      ◢ {text}
    </div>
  )
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div
      style={{
        fontFamily: FONT_MONO,
        fontSize: 11,
        color: MAGENTA,
        padding: 12,
        border: `1px solid ${MAGENTA}`,
        background: 'rgba(255, 43, 214, 0.08)',
        textShadow: `0 0 6px ${MAGENTA}60`,
        wordBreak: 'break-word',
      }}
    >
      ✗ {message}
    </div>
  )
}
