import { CYAN, FONT_MONO } from '../styles'

interface Props {
  message: string
}

export function EmptyState({ message }: Props) {
  return (
    <div
      style={{
        marginTop: 24,
        textAlign: 'center',
        fontFamily: FONT_MONO,
        fontSize: 11,
        letterSpacing: 1.5,
        color: 'rgba(0, 240, 255, 0.55)',
      }}
    >
      &gt; {message}
      <span
        style={{
          display: 'inline-block',
          width: 7,
          height: 12,
          marginLeft: 4,
          verticalAlign: -1,
          background: CYAN,
          boxShadow: `0 0 6px ${CYAN}`,
          animation: 'cyber-blink 1s steps(1) infinite',
        }}
      />
    </div>
  )
}
