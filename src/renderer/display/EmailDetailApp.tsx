import { useEffect, useState } from 'react'
import { CYAN, FONT_MONO, MAGENTA, CYBER_STYLES } from './styles'

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
        else setError('レスポンスが空')
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
    <>
      <style>{CYBER_STYLES}</style>

      {/* HUDフレーム */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          right: 16,
          bottom: 16,
          pointerEvents: 'none',
          background:
            'linear-gradient(180deg, rgba(6, 8, 18, 0.96), rgba(10, 4, 20, 0.96))',
          border: `1px solid rgba(0, 240, 255, 0.25)`,
          boxShadow:
            '0 0 24px rgba(0, 240, 255, 0.08), inset 0 0 40px rgba(255, 43, 214, 0.04)',
          clipPath:
            'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />
      <CornerBrackets />

      {/* ドラッグ用バー */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          right: 16,
          height: 38,
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      />

      {/* ヘッダラベル */}
      <div
        style={{
          position: 'absolute',
          top: 26,
          left: 30,
          fontFamily: FONT_MONO,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 3,
          color: CYAN,
          textShadow: `0 0 8px ${CYAN}`,
          pointerEvents: 'none',
          animation: 'cyber-flicker 6s infinite',
        }}
      >
        ◢ MAIL // DETAIL {loading ? '// FETCHING…' : ''}
      </div>

      {/* 閉じるボタン */}
      <button
        onClick={() => window.electronAPI?.closeEmailDetail()}
        style={{
          position: 'absolute',
          top: 22,
          right: 28,
          background: 'rgba(8, 12, 24, 0.95)',
          border: `1px solid ${MAGENTA}`,
          color: MAGENTA,
          padding: '3px 8px',
          fontFamily: FONT_MONO,
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 1.2,
          textShadow: `0 0 6px ${MAGENTA}`,
          boxShadow: '0 0 8px rgba(255, 43, 214, 0.35)',
          cursor: 'pointer',
          textTransform: 'uppercase',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        ✕ CLOSE
      </button>

      {/* 本体 */}
      <div
        className="cyber-scroll"
        style={{
          position: 'absolute',
          top: 56,
          left: 28,
          right: 28,
          bottom: 28,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {!args && <Standby text="メールをクリックすると詳細が表示される" />}
        {args && loading && !detail && <Standby text="LOADING…" />}
        {error && <ErrorBlock message={error} />}
        {detail && <DetailBody detail={detail} />}
      </div>
    </>
  )
}

function DetailBody({ detail }: { detail: EmailDetail }) {
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
        {detail.subject || '(件名なし)'}
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
      {content || '(本文なし)'}
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

function CornerBrackets() {
  const size = 14
  const thickness = 2
  const color = CYAN
  const glow = `0 0 8px ${CYAN}`
  const bracket = (style: React.CSSProperties) => (
    <div
      style={{
        position: 'absolute',
        width: size,
        height: size,
        pointerEvents: 'none',
        boxShadow: glow,
        ...style,
      }}
    />
  )
  return (
    <>
      {bracket({
        top: 16,
        left: 16,
        borderTop: `${thickness}px solid ${color}`,
        borderLeft: `${thickness}px solid ${color}`,
      })}
      {bracket({
        top: 16,
        right: 16,
        borderTop: `${thickness}px solid ${color}`,
        borderRight: `${thickness}px solid ${color}`,
      })}
      {bracket({
        bottom: 16,
        left: 16,
        borderBottom: `${thickness}px solid ${color}`,
        borderLeft: `${thickness}px solid ${color}`,
      })}
      {bracket({
        bottom: 16,
        right: 16,
        borderBottom: `${thickness}px solid ${color}`,
        borderRight: `${thickness}px solid ${color}`,
      })}
    </>
  )
}
