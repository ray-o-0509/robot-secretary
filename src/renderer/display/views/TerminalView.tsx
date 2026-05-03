import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import type { PanelPayload } from '../types'

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
      ref={hostRef}
      style={{
        width: '100%',
        height: 360,
        background: 'transparent',
        border: '1px solid rgba(0, 240, 255, 0.15)',
        padding: 6,
        boxSizing: 'border-box',
      }}
    />
  )
}
