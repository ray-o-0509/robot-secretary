import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import type { PanelPayload } from '../types'
import { CYAN, FONT_MONO } from '../styles'

type PtyId = 'claude' | 'shell'

interface Props {
  payload: PanelPayload
}

interface PaneProps {
  id: PtyId
  active: boolean
}

function TerminalPane({ id, active }: PaneProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const termRef = useRef<Terminal | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"SF Mono", Menlo, Monaco, "Courier New", monospace',
      fontSize: 12,
      lineHeight: 1.2,
      theme: {
        background: 'rgba(0, 0, 0, 0)',
        foreground: '#e8f6ff',
        cursor: '#00f0ff',
        cursorAccent: 'rgba(0, 0, 0, 0)',
        selectionBackground: 'rgba(0, 240, 255, 0.25)',
        black: '#04081299',
        brightBlack: '#1a2238',
      },
      allowTransparency: true,
      scrollback: 5000,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(
      new WebLinksAddon((_event, uri) => {
        window.electronAPI?.openUrl?.(uri)
      }),
    )
    term.open(host)
    fit.fit()
    fitRef.current = fit
    termRef.current = term
    window.electronAPI?.ptyResize?.(id, term.cols, term.rows)

    let cancelled = false
    let unsubscribe: (() => void) | undefined

    window.electronAPI
      ?.ptyGetBuffer?.(id)
      .then((buf) => {
        if (cancelled) return
        if (buf) term.write(buf)
        unsubscribe = window.electronAPI?.ptyOnData?.((evtId, data) => {
          if (evtId === id) term.write(data)
        })
      })
      .catch(() => {/* ignore */})

    const onInput = term.onData((data) => {
      window.electronAPI?.ptyWrite?.(id, data)
    })

    let rafId = 0
    const ro = new ResizeObserver(() => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        try {
          fit.fit()
          window.electronAPI?.ptyResize?.(id, term.cols, term.rows)
        } catch {/* host detached mid-resize */}
      })
    })
    ro.observe(host)

    return () => {
      cancelled = true
      ro.disconnect()
      if (rafId) cancelAnimationFrame(rafId)
      unsubscribe?.()
      onInput.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [id])

  // Refit when this pane becomes visible — display:none zeroes the host's size
  // and xterm's last fit was against zero width.
  useEffect(() => {
    if (!active) return
    const r = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
        const t = termRef.current
        if (t) window.electronAPI?.ptyResize?.(id, t.cols, t.rows)
      } catch {/* ignore */}
    })
    return () => cancelAnimationFrame(r)
  }, [active, id])

  return (
    <div
      ref={hostRef}
      style={{
        flex: 1,
        minHeight: 0,
        width: '100%',
        background: 'transparent',
        padding: '6px 8px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: active ? 'block' : 'none',
      }}
    />
  )
}

export function TerminalView({ payload }: Props) {
  const [activeTab, setActiveTab] = useState<PtyId>('shell')

  // Auto-switch when main process pushes a payload with activeTab.
  useEffect(() => {
    const data = payload.data as { activeTab?: PtyId } | null | undefined
    if (data?.activeTab === 'claude' || data?.activeTab === 'shell') {
      setActiveTab(data.activeTab)
    }
  }, [payload])

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        flex: 1,
        minHeight: 0,
        maxHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: FONT_MONO,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px 4px 12px',
          background: `linear-gradient(90deg, rgba(0, 240, 255, 0.09) 0%, rgba(0, 240, 255, 0.03) 100%)`,
          border: `1px solid rgba(0, 240, 255, 0.35)`,
          borderBottom: `1px solid rgba(0, 240, 255, 0.12)`,
          clipPath: 'polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px)',
          flexShrink: 0,
        }}
      >
        <span className="cyber-status-dot" />
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: 2,
            color: CYAN,
            textShadow: `0 0 8px ${CYAN}80`,
            textTransform: 'uppercase',
          }}
        >
          ▸ Term
        </span>
        <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
          {(['claude', 'shell'] as const).map((id) => {
            const isActive = activeTab === id
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  padding: '3px 10px',
                  background: isActive ? `${CYAN}22` : 'transparent',
                  color: isActive ? CYAN : `${CYAN}99`,
                  border: `1px solid ${isActive ? CYAN : `${CYAN}55`}`,
                  cursor: 'pointer',
                  textShadow: isActive ? `0 0 6px ${CYAN}80` : 'none',
                }}
              >
                {id === 'claude' ? 'Claude' : 'Shell'}
              </button>
            )
          })}
        </div>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 8.5,
            letterSpacing: 1.5,
            color: `rgba(0, 240, 255, 0.4)`,
            textTransform: 'uppercase',
          }}
        >
          PTY
        </span>
      </div>

      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          border: `1px solid rgba(0, 240, 255, 0.28)`,
          borderTop: 'none',
          background: 'transparent',
          boxShadow: '0 0 28px rgba(0, 240, 255, 0.1)',
          clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: 10,
            height: 10,
            borderBottom: `1.5px solid ${CYAN}`,
            borderLeft: `1.5px solid ${CYAN}`,
            boxShadow: `0 0 6px rgba(0, 240, 255, 0.6)`,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />

        <TerminalPane id="claude" active={activeTab === 'claude'} />
        <TerminalPane id="shell" active={activeTab === 'shell'} />
      </div>
    </div>
  )
}
