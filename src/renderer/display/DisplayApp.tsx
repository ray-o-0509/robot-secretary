import { useEffect, useRef, useState } from 'react'
import { CYAN, FONT_MONO, CYBER_STYLES } from './styles'
import { DisplayShell } from './DisplayShell'
import { TopButtons } from './TopButtons'
import { EmailView } from '../skills/gmail/View'
import { EmailSearchView } from '../skills/gmail/SearchView'
import { CalendarView } from '../skills/calendar/View'
import { TasksView } from '../skills/tasks/View'
import { NewsView } from '../skills/ai-news/View'
import { ToolsView } from '../skills/best-tools/View'
import { MoviesView } from '../skills/movies/View'
import { TerminalView } from './views/TerminalView'
import { TimerView } from '../skills/timer/View'
import { DriveView } from '../skills/drive/View'
import { PANEL_LABELS, type PanelPayload } from './types'

export function DisplayApp() {
  const [payload, setPayload] = useState<PanelPayload | null>(null)
  const [loading, setLoading] = useState(false)
  // Track the newest fetchedAt we've accepted. A stale fetch of a *different* panel
  // type that finishes after the user switched would otherwise clobber the new view.
  const lastFetchedAtRef = useRef(0)

  useEffect(() => {
    window.electronAPI?.onDisplayData((p) => {
      if (p.fetchedAt < lastFetchedAtRef.current) return
      lastFetchedAtRef.current = p.fetchedAt
      setPayload(p)
      setLoading(p.loading === true)
    })
  }, [])

  if (!payload) {
    return (
      <>
        <style>{CYBER_STYLES}</style>
        {/* 背景: DisplayShellのHUDフレームと同じ暗い背景を常に表示 */}
        <div
          style={{
            position: 'absolute',
            top: 56,
            left: 16,
            right: 16,
            bottom: 16,
            pointerEvents: 'none',
            background: 'linear-gradient(180deg, rgba(6, 8, 18, 0.92), rgba(10, 4, 20, 0.92))',
            border: `1px solid rgba(0, 240, 255, 0.25)`,
            boxShadow: '0 0 24px rgba(0, 240, 255, 0.08), inset 0 0 40px rgba(255, 43, 214, 0.04)',
            clipPath: 'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONT_MONO,
            color: CYAN,
            fontSize: 11,
            letterSpacing: 2,
            opacity: 0.7,
          }}
        >
          ◢ STANDBY
        </div>
        <TopButtons onClose={() => window.electronAPI?.displayClose()} />
      </>
    )
  }

  const refresh = () => {
    setLoading(true)
    window.electronAPI?.displayRefresh(payload.type)
  }
  const canRefresh = payload.type !== 'drive_search' && payload.type !== 'email_search'

  return (
    <DisplayShell
      label={PANEL_LABELS[payload.type]}
      fetchedAt={payload.fetchedAt}
      loading={loading}
      onRefresh={canRefresh ? refresh : undefined}
      onClose={() => window.electronAPI?.displayClose()}
    >
      {renderView(payload)}
    </DisplayShell>
  )
}

function renderView(payload: PanelPayload) {
  switch (payload.type) {
    case 'email':
      return <EmailView payload={payload} />
    case 'email_search':
      return <EmailSearchView payload={payload} />
    case 'calendar_today':
    case 'calendar_tomorrow':
    case 'calendar_week':
      return <CalendarView payload={payload} />
    case 'tasks':
      return <TasksView payload={payload} />
    case 'news':
      return <NewsView payload={payload} />
    case 'tools':
      return <ToolsView payload={payload} />
    case 'movies':
      return <MoviesView payload={payload} />
    case 'terminal_output':
      return <TerminalView payload={payload} />
    case 'timer':
      return <TimerView payload={payload} />
    case 'drive_recent':
    case 'drive_search':
      return <DriveView payload={payload} />
  }
}
