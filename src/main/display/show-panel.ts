import { BrowserWindow } from 'electron'

export type PanelType =
  | 'email'
  | 'email_search'
  | 'calendar_today'
  | 'calendar_tomorrow'
  | 'calendar_week'
  | 'tasks'
  | 'news'
  | 'tools'
  | 'movies'
  | 'terminal_output'

export type PanelPayload = {
  type: PanelType
  data: unknown
  fetchedAt: number
  loading?: boolean
  error?: string
}

const VALID_TYPES = new Set<PanelType>([
  'email',
  'email_search',
  'calendar_today',
  'calendar_tomorrow',
  'calendar_week',
  'tasks',
  'news',
  'tools',
  'movies',
  'terminal_output',
])

export function isPanelType(v: unknown): v is PanelType {
  return typeof v === 'string' && VALID_TYPES.has(v as PanelType)
}

export async function fetchPanelData(type: PanelType): Promise<PanelPayload> {
  const fetchedAt = Date.now()
  try {
    switch (type) {
      case 'email': {
        const { getInboxEmails } = await import('../skills/gmail/index')
        return { type, data: await getInboxEmails(30), fetchedAt }
      }
      case 'calendar_today': {
        const { getTodayEvents } = await import('../skills/calendar/index')
        return { type, data: await getTodayEvents(), fetchedAt }
      }
      case 'calendar_tomorrow': {
        const { getTomorrowEvents } = await import('../skills/calendar/index')
        return { type, data: await getTomorrowEvents(), fetchedAt }
      }
      case 'calendar_week': {
        const { getUpcomingEvents } = await import('../skills/calendar/index')
        return { type, data: await getUpcomingEvents(7), fetchedAt }
      }
      case 'tasks': {
        const { getTodos } = await import('../skills/tasks/index')
        return { type, data: await getTodos(), fetchedAt }
      }
      case 'news': {
        const { getDashboardEntry } = await import('../skills/shared/turso')
        return { type, data: await getDashboardEntry('ai-news'), fetchedAt }
      }
      case 'tools': {
        const { getDashboardEntry } = await import('../skills/shared/turso')
        return { type, data: await getDashboardEntry('best-tools'), fetchedAt }
      }
      case 'movies': {
        const { getDashboardEntry } = await import('../skills/shared/turso')
        return { type, data: await getDashboardEntry('movies'), fetchedAt }
      }
    }
  } catch (err) {
    return { type, data: null, fetchedAt, error: String(err instanceof Error ? err.message : err) }
  }
}

export function buildSummary(payload: PanelPayload): string {
  if (payload.error) return `${payload.type} fetch failed: ${payload.error}`
  switch (payload.type) {
    case 'email': {
      const d = payload.data as { accounts: { account: string; count: number; error: string | null }[]; messages: unknown[] } | null
      if (!d) return '0 items'
      const total = d.messages.length
      const errs = d.accounts.filter((a) => a.error)
      const errPart = errs.length ? ` (auth error: ${errs.map((a) => a.account).join(', ')})` : ''
      const breakdown = d.accounts.filter((a) => !a.error).map((a) => `${a.account}:${a.count}`).join(', ')
      return `Inbox ${total} items${breakdown ? ` (${breakdown})` : ''}${errPart}`
    }
    case 'email_search': {
      const d = payload.data as { query: string; messages: unknown[] } | null
      if (!d) return '0 items'
      return `Search results for "${d.query}": ${d.messages.length} items`
    }
    case 'calendar_today':
    case 'calendar_tomorrow':
    case 'calendar_week': {
      const d = payload.data as { events: { title: string; start?: string }[] } | null
      if (!d) return '0 items'
      const n = d.events.length
      if (n === 0) return 'no events'
      const first = d.events[0]
      return `${n} events, first: ${first.title}`
    }
    case 'tasks': {
      const d = payload.data as { tasks: { status: string; due?: string }[] } | null
      if (!d) return '0 items'
      const todos = d.tasks.filter((t) => t.status === 'todo')
      return `${todos.length} tasks`
    }
    case 'news': {
      const d = payload.data as { error?: string; subtitle?: string; data?: { items?: unknown[] } } | null
      if (!d || d.error) return d?.error ?? 'fetch failed'
      const n = d.data?.items?.length ?? 0
      return `AI news ${n} items${d.subtitle ? ` (${d.subtitle})` : ''}`
    }
    case 'tools': {
      const d = payload.data as { error?: string; subtitle?: string; data?: { categories?: { tools?: unknown[] }[] } } | null
      if (!d || d.error) return d?.error ?? 'fetch failed'
      const total = (d.data?.categories ?? []).reduce((sum, c) => sum + (c.tools?.length ?? 0), 0)
      return `Tools ${total} items${d.subtitle ? ` (${d.subtitle})` : ''}`
    }
    case 'movies': {
      const d = payload.data as { error?: string; subtitle?: string; data?: { nowPlaying?: unknown[]; upcoming?: unknown[] } } | null
      if (!d || d.error) return d?.error ?? 'fetch failed'
      const nowN = d.data?.nowPlaying?.length ?? 0
      const upN = d.data?.upcoming?.length ?? 0
      return `Movies: ${nowN} now playing, ${upN} upcoming`
    }
    case 'terminal_output': {
      const d = payload.data as { command: string; stdout: string; stderr: string } | null
      if (!d) return 'no output'
      return `Command executed: ${d.command}`
    }
  }
}

let pendingPayload: PanelPayload | null = null

/**
 * Send a payload to the display window. Queues it if did-finish-load has not fired yet.
 */
export function pushPayload(displayWin: BrowserWindow, payload: PanelPayload, ready: boolean) {
  if (ready && !displayWin.isDestroyed()) {
    displayWin.webContents.send('display:data', payload)
  } else {
    pendingPayload = payload
  }
}

export function flushPending(displayWin: BrowserWindow) {
  if (pendingPayload && !displayWin.isDestroyed()) {
    displayWin.webContents.send('display:data', pendingPayload)
    pendingPayload = null
  }
}

export type ShowPanelDeps = {
  getOrCreateWindow: () => Promise<{ win: BrowserWindow; ready: boolean }>
}

export async function showPanel(
  type: PanelType,
  deps: ShowPanelDeps,
): Promise<{ ok: boolean; type: PanelType; data: unknown; summary: string; error?: string }> {
  const { win, ready } = await deps.getOrCreateWindow()

  // Push loading state immediately to fill the user's wait time
  const fetchedAt = Date.now()
  pushPayload(win, { type, data: null, fetchedAt, loading: true }, ready)
  win.show()
  win.focus()

  const payload = await fetchPanelData(type)
  pushPayload(win, payload, ready)

  return {
    ok: !payload.error,
    type,
    data: payload.data,
    summary: buildSummary(payload),
    error: payload.error,
  }
}
