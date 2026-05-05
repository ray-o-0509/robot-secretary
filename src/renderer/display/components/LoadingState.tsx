import { CYAN, FONT_MONO } from '../styles'

const shimmerStyle: React.CSSProperties = {
  background: `linear-gradient(90deg, rgba(0,240,255,0.04) 0%, rgba(0,240,255,0.14) 50%, rgba(0,240,255,0.04) 100%)`,
  backgroundSize: '300% 100%',
  animation: 'cyber-shimmer 1.8s ease-in-out infinite',
  borderRadius: 2,
}

function SkeletonLine({ width, height = 10, delay = 0 }: { width: string; height?: number; delay?: number }) {
  return (
    <div
      style={{
        ...shimmerStyle,
        width,
        height,
        animationDelay: `${delay}s`,
      }}
    />
  )
}

function SkeletonCard({ index }: { index: number }) {
  const delay = index * 0.12
  return (
    <div
      style={{
        position: 'relative',
        padding: '10px 14px 11px',
        background: 'linear-gradient(90deg, rgba(0, 240, 255, 0.04) 0%, transparent 40%), linear-gradient(135deg, rgba(8, 12, 24, 0.97), rgba(18, 8, 28, 0.97))',
        border: `1px solid rgba(0, 240, 255, 0.15)`,
        boxShadow: '0 0 10px rgba(0, 240, 255, 0.1)',
        clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
        animation: `cyber-skeleton-pulse 2s ease-in-out infinite`,
        animationDelay: `${delay}s`,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <SkeletonLine width={`${55 + (index % 3) * 15}%`} height={12} delay={delay} />
      <SkeletonLine width={`${35 + (index % 2) * 20}%`} height={10} delay={delay + 0.1} />
      {index % 2 === 0 && (
        <SkeletonLine width="85%" height={10} delay={delay + 0.2} />
      )}
    </div>
  )
}

interface Props {
  count?: number
  label?: string
}

export function LoadingState({ count = 4, label }: Props) {
  return (
    <>
      {label && (
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 9.5,
            letterSpacing: 2,
            color: `${CYAN}80`,
            marginBottom: 4,
            animation: 'cyber-skeleton-pulse 1.5s ease-in-out infinite',
          }}
        >
          {label}
        </div>
      )}
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} index={i} />
      ))}
    </>
  )
}
