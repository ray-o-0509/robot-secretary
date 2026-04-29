import type { ReactNode } from 'react'
import { CYAN, FONT_MONO, MAGENTA, CYBER_STYLES } from './styles'
import { PANEL_LABELS, type PanelType } from './types'

interface Props {
  type: PanelType
  fetchedAt: number
  loading: boolean
  onRefresh: () => void
  onClose: () => void
  children: ReactNode
}

export function DisplayShell({ type, fetchedAt, loading, onRefresh, onClose, children }: Props) {
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
      <CornerBrackets />

      {/* スキャンライン */}
      <div
        style={{
          position: 'absolute',
          top: 16,
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

      {/* ドラッグ用バー（ヘッダー領域、ボタンは no-drag） */}
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
        {PANEL_LABELS[type]}
      </div>

      {/* 取得時刻 */}
      <div
        style={{
          position: 'absolute',
          top: 26,
          right: 100,
          fontFamily: FONT_MONO,
          fontSize: 9.5,
          letterSpacing: 1.5,
          color: 'rgba(0, 240, 255, 0.7)',
          pointerEvents: 'none',
        }}
      >
        {loading ? 'FETCHING…' : formatFetchedAt(fetchedAt)}
      </div>

      {/* リフレッシュボタン */}
      <button
        onClick={onRefresh}
        disabled={loading}
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
          cursor: loading ? 'wait' : 'pointer',
          textTransform: 'uppercase',
          opacity: loading ? 0.5 : 1,
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        ↻ RELOAD
      </button>

      {/* 閉じるボタン */}
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
          gap: 12,
        }}
      >
        {children}
      </div>
    </>
  )
}

function formatFetchedAt(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm} 取得`
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
