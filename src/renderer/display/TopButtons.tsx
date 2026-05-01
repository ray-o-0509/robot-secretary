import { CYAN, FONT_MONO, MAGENTA } from './styles'

interface IconButtonProps {
  onClick?: () => void
  disabled?: boolean
  style?: React.CSSProperties
  children: React.ReactNode
  color: string
  title?: string
}

function IconButton({ onClick, disabled, style, children, color, title }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: 'rgba(8, 12, 24, 0.95)',
        border: `1px solid ${color}`,
        color,
        padding: '3px 8px',
        fontFamily: FONT_MONO,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: 1.2,
        textShadow: `0 0 6px ${color}`,
        boxShadow: `0 0 8px ${color}55`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        textTransform: 'uppercase',
        opacity: disabled ? 0.5 : 1,
        WebkitAppRegion: 'no-drag',
        ...style,
      } as React.CSSProperties}
    >
      {children}
    </button>
  )
}

export interface CloseButtonProps {
  onClick: () => void
  style?: React.CSSProperties
  label?: string
  title?: string
}

export function CloseButton({ onClick, style, label = '✕ CLOSE', title }: CloseButtonProps) {
  return (
    <IconButton onClick={onClick} color={MAGENTA} style={style} title={title}>
      {label}
    </IconButton>
  )
}

export interface RefreshButtonProps {
  onClick?: () => void
  disabled?: boolean
  style?: React.CSSProperties
  label?: string
  title?: string
}

export function RefreshButton({ onClick, disabled, style, label = '↻ RELOAD', title }: RefreshButtonProps) {
  return (
    <IconButton onClick={onClick} disabled={disabled || !onClick} color={CYAN} style={style} title={title}>
      {label}
    </IconButton>
  )
}

interface TopButtonsProps {
  loading?: boolean
  onRefresh?: () => void
  onClose: () => void
}

export function TopButtons({ loading = false, onRefresh, onClose }: TopButtonsProps) {
  return (
    <>
      <RefreshButton
        onClick={onRefresh}
        disabled={loading || !onRefresh}
        style={{ position: 'absolute', top: 14, right: 100, zIndex: 20 }}
      />
      <CloseButton
        onClick={onClose}
        style={{ position: 'absolute', top: 14, right: 16, zIndex: 20 }}
      />
    </>
  )
}
