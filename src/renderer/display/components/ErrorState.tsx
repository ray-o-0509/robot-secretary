import { FONT_MONO, MAGENTA } from '../styles'

interface Props {
  message: string
  hint?: string
}

export function ErrorState({ message, hint }: Props) {
  return (
    <div
      style={{
        marginTop: 16,
        padding: '12px 14px',
        fontFamily: FONT_MONO,
        fontSize: 11,
        lineHeight: 1.55,
        letterSpacing: 0.5,
        color: '#ffe6f6',
        background: 'rgba(40, 6, 28, 0.85)',
        border: `1px solid ${MAGENTA}`,
        boxShadow: `0 0 14px rgba(255, 43, 214, 0.35)`,
        clipPath:
          'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
      }}
    >
      <div style={{ color: MAGENTA, textShadow: `0 0 6px ${MAGENTA}`, fontWeight: 700, marginBottom: 4 }}>
        ◢ ERROR
      </div>
      <div>{message}</div>
      {hint && <div style={{ marginTop: 6, opacity: 0.7 }}>{hint}</div>}
    </div>
  )
}
