import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import type { PanelPayload } from '../types'
import { CYAN, FONT_MONO } from '../styles'

interface Props {
  payload: PanelPayload
}

// payload is unused: the terminal mirrors the singleton pty in main, not the panel data.
export function TerminalView(_props: Props) {
  const hostRef = useRef<HTMLDivElement>(null)

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
    window.electronAPI?.ptyResize?.(term.cols, term.rows)

    let cancelled = false
    let unsubscribe: (() => void) | undefined

    // Buffer first, then subscribe. Data emitted during the await is dropped from this
    // mount but persists in main's scrollback, so it reappears on the next mount/refresh.
    window.electronAPI
      ?.ptyGetBuffer?.()
      .then((buf) => {
        if (cancelled) return
        if (buf) term.write(buf)
        unsubscribe = window.electronAPI?.ptyOnData?.((data) => term.write(data))
      })
      .catch(() => {/* ignore — pty may not be available in older builds */})

    const onInput = term.onData((data) => {
      window.electronAPI?.ptyWrite?.(data)
    })

    let rafId = 0
    const ro = new ResizeObserver(() => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        try {
          fit.fit()
          window.electronAPI?.ptyResize?.(term.cols, term.rows)
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
    }
  }, [])

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
      {/* ヘッダーバー */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 10px 5px 12px',
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
          ▸ Shell
        </span>
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

      {/* ターミナル本体 */}
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
        {/* 左下ブラケット */}
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
          }}
        />
      </div>
    </div>
  )
}
