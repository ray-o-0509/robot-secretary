import { useEffect, useRef } from 'react'

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

interface Props {
  messages: ChatMessage[]
}

const FONT_MONO =
  '"JetBrains Mono", "SF Mono", "Cascadia Code", "Roboto Mono", ui-monospace, monospace'

const CYAN = '#00f0ff'
const MAGENTA = '#ff2bd6'

const CYBER_STYLES = `
@keyframes cyber-scan {
  0% { background-position: 0 0; }
  100% { background-position: 0 6px; }
}
@keyframes cyber-flicker {
  0%, 100% { opacity: 1; }
  46% { opacity: 1; }
  47% { opacity: 0.55; }
  49% { opacity: 1; }
  72% { opacity: 0.85; }
  74% { opacity: 1; }
}
@keyframes cyber-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
.cyber-msg {
  position: relative;
  padding: 10px 14px 11px;
  font-family: ${FONT_MONO};
  font-size: 12.5px;
  line-height: 1.55;
  word-break: break-word;
  color: #e8f6ff;
  letter-spacing: 0.2px;
  background: linear-gradient(135deg, rgba(8, 12, 24, 0.97), rgba(18, 8, 28, 0.97));
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  clip-path: polygon(
    10px 0,
    100% 0,
    100% calc(100% - 10px),
    calc(100% - 10px) 100%,
    0 100%,
    0 10px
  );
}
.cyber-msg::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    0deg,
    rgba(255, 255, 255, 0.04) 0px,
    rgba(255, 255, 255, 0.04) 1px,
    transparent 1px,
    transparent 3px
  );
  mix-blend-mode: overlay;
  opacity: 0.2;
}
.cyber-msg-user {
  border: 1px solid ${CYAN};
  box-shadow:
    0 0 0 1px rgba(0, 240, 255, 0.15),
    0 0 18px rgba(0, 240, 255, 0.35),
    inset 0 0 22px rgba(0, 240, 255, 0.08);
}
.cyber-msg-ai {
  border: 1px solid ${MAGENTA};
  box-shadow:
    0 0 0 1px rgba(255, 43, 214, 0.15),
    0 0 18px rgba(255, 43, 214, 0.35),
    inset 0 0 22px rgba(255, 43, 214, 0.08);
}
.cyber-tag {
  font-family: ${FONT_MONO};
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 4px;
  opacity: 0.95;
}
.cyber-tag-user {
  color: ${CYAN};
  text-shadow: 0 0 8px rgba(0, 240, 255, 0.7);
  align-self: flex-end;
}
.cyber-tag-ai {
  color: ${MAGENTA};
  text-shadow: 0 0 8px rgba(255, 43, 214, 0.7);
  align-self: flex-start;
}
.cyber-caret {
  display: inline-block;
  width: 7px;
  height: 12px;
  margin-left: 2px;
  vertical-align: -1px;
  background: ${MAGENTA};
  box-shadow: 0 0 6px ${MAGENTA};
  animation: cyber-blink 1s steps(1) infinite;
}
.cyber-scroll { scrollbar-width: none; }
.cyber-scroll::-webkit-scrollbar { width: 0; height: 0; display: none; }
`

export function ChatPanel({ messages }: Props) {
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
