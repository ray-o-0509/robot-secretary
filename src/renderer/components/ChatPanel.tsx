import { useEffect, useRef, useState } from 'react'
import { FONT_MONO, CYAN, MAGENTA, CYBER_STYLES } from '../display/styles'

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

interface Props {
  messages: ChatMessage[]
  languageCode?: string
  onLanguageChange?: (lang: string) => void
}

const LANGUAGES: { code: string; label: string }[] = [
  { code: 'ja-JP', label: '日本語' },
  { code: 'en-US', label: 'English' },
]

export function ChatPanel({ messages, languageCode, onLanguageChange }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages])

  return (
    <>
      <style>{CYBER_STYLES}</style>

      {/* HUDフレーム */}
      <div
        style={{
          position: 'absolute',
          top: 56,
          left: 16,
          right: 16,
          bottom: 16,
          pointerEvents: 'none',
          background:
            'linear-gradient(180deg, rgba(6, 8, 18, 0.92), rgba(10, 4, 20, 0.92))',
          border: `1px solid rgba(0, 240, 255, 0.25)`,
          boxShadow:
            '0 0 24px rgba(0, 240, 255, 0.08), inset 0 0 40px rgba(255, 43, 214, 0.04)',
          clipPath:
            'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />
      {/* 角の装飾ブラケット */}
      <CornerBrackets />

      {/* スキャンライン */}
      <div
        style={{
          position: 'absolute',
          top: 56,
          left: 16,
          right: 16,
          bottom: 16,
          pointerEvents: 'none',
          background:
            'repeating-linear-gradient(0deg, rgba(0, 240, 255, 0.05) 0px, rgba(0, 240, 255, 0.05) 1px, transparent 1px, transparent 3px)',
          mixBlendMode: 'screen',
          animation: 'cyber-scan 2s linear infinite',
          clipPath:
            'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)',
          opacity: 0.25,
        }}
      />

      {/* ヘッダーラベル */}
      <div
        style={{
          position: 'absolute',
          top: 64,
          left: 28,
          fontFamily: FONT_MONO,
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 3,
          color: CYAN,
          textShadow: `0 0 8px ${CYAN}`,
          pointerEvents: 'none',
          animation: 'cyber-flicker 6s infinite',
        }}
      >
        ◢ NEURAL_LINK // CHANNEL_01
      </div>

      {/* 言語セレクター */}
      {onLanguageChange && (
        <LanguageSelector value={languageCode ?? 'ja-JP'} onChange={onLanguageChange} />
      )}

      {/* メッセージリスト */}
      <div
        ref={scrollRef}
        className="cyber-scroll"
        style={{
          position: 'absolute',
          top: 90,
          left: 28,
          right: 28,
          bottom: 28,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          pointerEvents: 'none',
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              letterSpacing: 1.5,
              color: 'rgba(0, 240, 255, 0.55)',
              alignSelf: 'flex-start',
              marginTop: 8,
            }}
          >
            &gt; awaiting_input<span className="cyber-caret" />
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              className={`cyber-tag ${m.role === 'user' ? 'cyber-tag-user' : 'cyber-tag-ai'}`}
            >
              {m.role === 'user' ? 'USER_INPUT' : 'VEGA'}
            </div>
            <div
              className={`cyber-msg ${m.role === 'user' ? 'cyber-msg-user' : 'cyber-msg-ai'}`}
            >
              {m.text || (
                <span style={{ opacity: 0.65 }}>
                  decoding<span className="cyber-caret" />
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function LanguageSelector({
  value,
  onChange,
}: {
  value: string
  onChange: (lang: string) => void
}) {
  const [open, setOpen] = useState(false)
  const current = LANGUAGES.find((l) => l.code === value) ?? LANGUAGES[0]

  const handleEnter = () => window.electronAPI?.setChatInteractive(true)
  const handleLeave = () => {
    setOpen(false)
    window.electronAPI?.setChatInteractive(false)
  }

  return (
    <div
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{
        position: 'absolute',
        top: 14,
        right: 16,
        fontFamily: FONT_MONO,
        zIndex: 20,
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'rgba(8, 12, 24, 0.95)',
          border: `1px solid ${MAGENTA}`,
          color: MAGENTA,
          padding: '3px 8px',
          fontFamily: FONT_MONO,
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 1.5,
          textShadow: `0 0 6px ${MAGENTA}`,
          boxShadow: '0 0 10px rgba(255, 43, 214, 0.3)',
          cursor: 'pointer',
          textTransform: 'uppercase',
        }}
      >
        ◢ {current.code} {open ? '▴' : '▾'}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 110,
            background: 'rgba(8, 12, 24, 0.97)',
            border: `1px solid ${MAGENTA}`,
            boxShadow: '0 0 14px rgba(255, 43, 214, 0.35)',
          }}
        >
          {LANGUAGES.map((lang) => {
            const active = lang.code === value
            return (
              <div
                key={lang.code}
                onClick={() => {
                  onChange(lang.code)
                  setOpen(false)
                }}
                style={{
                  padding: '6px 10px',
                  fontSize: 10.5,
                  letterSpacing: 1,
                  color: active ? CYAN : '#e8f6ff',
                  textShadow: active ? `0 0 6px ${CYAN}` : 'none',
                  cursor: 'pointer',
                  borderBottom: '1px solid rgba(255, 43, 214, 0.15)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 43, 214, 0.18)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                {lang.label}
              </div>
            )
          })}
        </div>
      )}
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
        top: 56,
        left: 16,
        borderTop: `${thickness}px solid ${color}`,
        borderLeft: `${thickness}px solid ${color}`,
      })}
      {bracket({
        top: 56,
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
