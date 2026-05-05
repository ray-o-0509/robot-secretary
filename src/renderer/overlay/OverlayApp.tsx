import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

type Rect = { x: number; y: number; w: number; h: number }

const MIN_SIZE = 20
const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif'

declare global {
  interface Window {
    overlayAPI?: {
      reportRect: (rect: Rect & { displayId: number }) => void
      onClear: (cb: () => void) => () => void
      onCaptured: (cb: () => void) => () => void
      getDisplayId: () => Promise<number>
    }
  }
}

export function OverlayApp() {
  const { t } = useTranslation()
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null)
  const [frozen, setFrozen] = useState<Rect | null>(null)
  const [showCaptured, setShowCaptured] = useState(false)
  const displayIdRef = useRef<number | null>(null)
  const draggingRef = useRef(false)
  const rafIdRef = useRef<number | null>(null)
  const pendingPointRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    window.overlayAPI?.getDisplayId().then((id) => {
      displayIdRef.current = id
    })
  }, [])

  const reset = useCallback(() => {
    setStart(null)
    setCurrent(null)
    setFrozen(null)
    setShowCaptured(false)
    draggingRef.current = false
  }, [])

  // ESC broadcast from main → reset selection
  useEffect(() => {
    const off = window.overlayAPI?.onClear(() => reset())
    return () => off?.()
  }, [reset])

  // Capture confirmation flash
  useEffect(() => {
    const off = window.overlayAPI?.onCaptured(() => {
      setShowCaptured(true)
      setTimeout(() => setShowCaptured(false), 600)
    })
    return () => off?.()
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    draggingRef.current = true
    setFrozen(null)
    setShowCaptured(false)
    setStart({ x: e.clientX, y: e.clientY })
    setCurrent({ x: e.clientX, y: e.clientY })
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current) return
    pendingPointRef.current = { x: e.clientX, y: e.clientY }
    if (rafIdRef.current !== null) return
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null
      if (!draggingRef.current || !pendingPointRef.current) return
      setCurrent(pendingPointRef.current)
    })
  }, [])

  useEffect(() => () => {
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current)
  }, [])

  const handleMouseUp = useCallback(() => {
    if (!draggingRef.current || !start || !current) {
      draggingRef.current = false
      return
    }
    draggingRef.current = false
    const rect = normalizeRect(start, current)
    if (rect.w < MIN_SIZE || rect.h < MIN_SIZE) {
      // Too small — ignore
      reset()
      return
    }
    setFrozen(rect)
    if (displayIdRef.current != null) {
      window.overlayAPI?.reportRect({ ...rect, displayId: displayIdRef.current })
    }
  }, [start, current, reset])

  const liveRect = frozen ?? (start && current ? normalizeRect(start, current) : null)

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        position: 'fixed',
        inset: 0,
        cursor: 'crosshair',
        background: 'rgba(0, 0, 0, 0.25)',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {liveRect && (
        <>
          {/* Selection highlight (cuts through dim layer with white border) */}
          <div
            style={{
              position: 'absolute',
              left: liveRect.x,
              top: liveRect.y,
              width: liveRect.w,
              height: liveRect.h,
              border: '1.5px solid rgba(255, 255, 255, 0.95)',
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
              background: 'rgba(0, 0, 0, 0)',
              pointerEvents: 'none',
            }}
          />
          {/* Size badge */}
          <div
            style={{
              position: 'absolute',
              left: liveRect.x,
              top: Math.max(0, liveRect.y - 22),
              fontSize: 11,
              fontFamily: FONT_FAMILY,
              color: 'rgba(255, 255, 255, 0.95)',
              background: 'rgba(0, 0, 0, 0.6)',
              padding: '2px 6px',
              borderRadius: 3,
              pointerEvents: 'none',
            }}
          >
            {Math.round(liveRect.w)} × {Math.round(liveRect.h)}
          </div>
        </>
      )}
      {/* Hint banner — only when not actively dragging */}
      {!draggingRef.current && !frozen && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'rgba(255, 255, 255, 0.85)',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
            fontSize: 14,
            textAlign: 'center',
            pointerEvents: 'none',
            textShadow: '0 1px 4px rgba(0, 0, 0, 0.6)',
          }}
        >
          <div style={{ fontWeight: 500 }}>{t('regionOverlay.dragHint')}</div>
          <div style={{ marginTop: 4, opacity: 0.7, fontSize: 12 }}>
            {t('regionOverlay.escRetry')}
          </div>
        </div>
      )}
      {frozen && (
        <div
          style={{
            position: 'absolute',
            bottom: 32,
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'rgba(255, 255, 255, 0.9)',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
            fontSize: 12,
            background: 'rgba(0, 0, 0, 0.55)',
            padding: '6px 12px',
            borderRadius: 6,
            pointerEvents: 'none',
          }}
        >
          {showCaptured ? t('regionOverlay.captured') : t('regionOverlay.releaseHint')}
          <span style={{ opacity: 0.6, marginLeft: 8 }}>· {t('regionOverlay.escRetry')}</span>
        </div>
      )}
    </div>
  )
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const w = Math.abs(a.x - b.x)
  const h = Math.abs(a.y - b.y)
  return { x, y, w, h }
}
