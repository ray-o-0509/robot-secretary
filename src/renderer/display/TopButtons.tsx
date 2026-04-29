import { CYAN, FONT_MONO, MAGENTA } from './styles'

interface Props {
  loading?: boolean
  onRefresh?: () => void
  onClose: () => void
}

export function TopButtons({ loading = false, onRefresh, onClose }: Props) {
  const reloadDisabled = loading || !onRefresh
  return (
    <>
      <button
        onClick={onRefresh}
        disabled={reloadDisabled}
        style={{
          position: 'absolute',
          top: 22,
          right: 60,
          background: 'rgba(8, 12, 24, 0.95)',
          border: `1px solid ${CYAN}`,
          color: CYAN,
          padding: '3px 8px',
          fontFamily: FONT_MONO,
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 1.2,
          textShadow: `0 0 6px ${CYAN}`,
          boxShadow: '0 0 8px rgba(0, 240, 255, 0.3)',
          cursor: reloadDisabled ? 'not-allowed' : 'pointer',
          textTransform: 'uppercase',
          opacity: reloadDisabled ? 0.5 : 1,
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        ↻ RELOAD
      </button>

      <button
        onClick={onClose}
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
    </>
  )
}
