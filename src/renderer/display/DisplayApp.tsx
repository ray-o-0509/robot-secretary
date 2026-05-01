import { Suspense, lazy, useEffect, useState } from 'react'
import { CYAN, FONT_MONO, CYBER_STYLES } from './styles'
import { DisplayShell } from './DisplayShell'
import { TopButtons } from './TopButtons'
import { EmailView } from '../skills/gmail/View'
import { EmailSearchView } from '../skills/gmail/SearchView'
import { CalendarView } from '../skills/calendar/View'
import { TasksView } from '../skills/tasks/View'
import { TerminalView } from './views/TerminalView'
import { PANEL_LABELS, type PanelPayload } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const UnavailableView = (_props: any) => (
  <div style={{ padding: 24, color: CYAN, fontFamily: FONT_MONO, fontSize: 12, opacity: 0.6 }}>
    この機能は利用できません
  </div>
)
const fallbackModule = { default: UnavailableView }

const NewsView = lazy(() =>
  import('../../private/renderer-skills/ai-news/View')
    .then((m) => ({ default: m.NewsView }))
    .catch(() => fallbackModule),
)
const ToolsView = lazy(() =>
  import('../../private/renderer-skills/best-tools/View')
    .then((m) => ({ default: m.ToolsView }))
    .catch(() => fallbackModule),
)
const MoviesView = lazy(() =>
  import('../../private/renderer-skills/movies/View')
    .then((m) => ({ default: m.MoviesView }))
    .catch(() => fallbackModule),
)

export function DisplayApp() {
  const [payload, setPayload] = useState<PanelPayload | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    window.electronAPI?.onDisplayData((p) => {
      setPayload((prev) => {
        // 古い fetchedAt のペイロードが後着しても捨てる
        if (prev && p.fetchedAt < prev.fetchedAt && prev.type === p.type) return prev
        return p
      })
      setLoading(p.loading === true)
    })
  }, [])

  if (!payload) {
    return (
      <>
        <style>{CYBER_STYLES}</style>
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

  return (
    <DisplayShell
      label={PANEL_LABELS[payload.type]}
      fetchedAt={payload.fetchedAt}
      loading={loading}
      onRefresh={refresh}
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
      return <Suspense fallback={null}><NewsView payload={payload} /></Suspense>
    case 'tools':
      return <Suspense fallback={null}><ToolsView payload={payload} /></Suspense>
    case 'movies':
      return <Suspense fallback={null}><MoviesView payload={payload} /></Suspense>
    case 'terminal_output':
      return <TerminalView payload={payload} />
  }
}
