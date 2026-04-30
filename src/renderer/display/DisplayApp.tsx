import { useEffect, useState } from 'react'
import { CYAN, FONT_MONO, CYBER_STYLES } from './styles'
import { DisplayShell } from './DisplayShell'
import { TopButtons } from './TopButtons'
import { EmailView } from './views/EmailView'
import { EmailSearchView } from './views/EmailSearchView'
import { CalendarView } from './views/CalendarView'
import { TasksView } from './views/TasksView'
import { SlackView } from './views/SlackView'
import { NewsView } from './views/NewsView'
import { ToolsView } from './views/ToolsView'
import { MoviesView } from './views/MoviesView'
import { PANEL_LABELS, type PanelPayload } from './types'

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
    case 'slack':
      return <SlackView payload={payload} />
    case 'news':
      return <NewsView payload={payload} />
    case 'tools':
      return <ToolsView payload={payload} />
    case 'movies':
      return <MoviesView payload={payload} />
  }
}
