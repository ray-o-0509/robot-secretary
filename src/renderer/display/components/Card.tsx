import type { CSSProperties, ReactNode } from 'react'
import { CYAN, FONT_MONO, MAGENTA } from '../styles'

type Accent = 'cyan' | 'magenta'

interface Props {
  accent?: Accent
  tag?: string
  children: ReactNode
  style?: CSSProperties
}

export function Card({ accent = 'cyan', tag, children, style }: Props) {
  const color = accent === 'cyan' ? CYAN : MAGENTA
  const className = accent === 'cyan' ? 'cyber-msg cyber-msg-user' : 'cyber-msg cyber-msg-ai'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      {tag && (
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color,
            textShadow: `0 0 8px ${color}80`,
          }}
        >
          {tag}
        </div>
      )}
      <div className={className}>{children}</div>
    </div>
  )
}
