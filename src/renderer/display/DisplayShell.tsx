import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CYAN, FONT_MONO, CYBER_STYLES } from './styles'
import { TopButtons } from './TopButtons'

interface Props {
  label: string
  fetchedAt?: number
  loading?: boolean
  onRefresh?: () => void
  onClose: () => void
  children: ReactNode
}

export function DisplayShell({ label, fetchedAt, loading = false, onRefresh, onClose, children }: Props) {
  const { t } = useTranslation()
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
          top: 66,
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
        {label}
      </div>

      {/* 取得時刻 */}
      <div
        style={{
          position: 'absolute',
          top: 66,
          right: 30,
          fontFamily: FONT_MONO,
          fontSize: 9.5,
          letterSpacing: 1.5,
          color: 'rgba(0, 240, 255, 0.7)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {loading ? t('display.fetchingLabel') : fetchedAt ? formatFetchedAt(fetchedAt, t('display.fetch')) : ''}
      </div>

      {/* CLOSE / RELOAD ボタン */}
      <TopButtons loading={loading} onRefresh={onRefresh} onClose={onClose} />

      {/* 本体 */}
      <div
        className="cyber-scroll"
        style={{
          position: 'absolute',
          top: 96,
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

function formatFetchedAt(ts: number, fetchLabel: string): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm} ${fetchLabel}`
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
