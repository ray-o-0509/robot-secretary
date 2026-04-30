import { BrowserWindow } from 'electron'

export type PanelType =
  | 'email'
  | 'email_search'
  | 'calendar_today'
  | 'calendar_tomorrow'
  | 'calendar_week'
  | 'tasks'
  | 'slack'
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
  'slack',
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
        const { getInboxEmails } = await import('../tools/gmail')
        return { type, data: await getInboxEmails(30), fetchedAt }
      }
      case 'calendar_today': {
        const { getTodayEvents } = await import('../tools/calendar')
        return { type, data: await getTodayEvents(), fetchedAt }
      }
      case 'calendar_tomorrow': {
        const { getTomorrowEvents } = await import('../tools/calendar')
        return { type, data: await getTomorrowEvents(), fetchedAt }
      }
      case 'calendar_week': {
        const { getUpcomingEvents } = await import('../tools/calendar')
        return { type, data: await getUpcomingEvents(7), fetchedAt }
      }
      case 'tasks': {
        const { getTodos } = await import('../tools/ticktick')
        return { type, data: await getTodos(), fetchedAt }
      }
      case 'slack': {
        const { getUnreadMessages } = await import('../tools/slack')
        return { type, data: await getUnreadMessages(), fetchedAt }
      }
      case 'news': {
        const { getDashboardEntry } = await import('../tools/dashboard')
        return { type, data: await getDashboardEntry('ai-news'), fetchedAt }
      }
      case 'tools': {
        const { getDashboardEntry } = await import('../tools/dashboard')
        return { type, data: await getDashboardEntry('best-tools'), fetchedAt }
      }
      case 'movies': {
        const { getDashboardEntry } = await import('../tools/dashboard')
        return { type, data: await getDashboardEntry('movies'), fetchedAt }
      }
    }
  } catch (err) {
    return { type, data: null, fetchedAt, error: String(err instanceof Error ? err.message : err) }
  }
}

export function buildSummary(payload: PanelPayload): string {
  if (payload.error) return `${payload.type} 取得失敗: ${payload.error}`
  switch (payload.type) {
    case 'email': {
      const d = payload.data as { accounts: { account: string; count: number; error: string | null }[]; messages: unknown[] } | null
      if (!d) return '0件'
      const total = d.messages.length
      const errs = d.accounts.filter((a) => a.error)
      const errPart = errs.length ? `（認証エラー: ${errs.map((a) => a.account).join(', ')}）` : ''
      const breakdown = d.accounts.filter((a) => !a.error).map((a) => `${a.account}:${a.count}`).join(', ')
      return `インボックス${total}件${breakdown ? ` (${breakdown})` : ''}${errPart}`
    }
    case 'email_search': {
      const d = payload.data as { query: string; messages: unknown[] } | null
      if (!d) return '0件'
      return `「${d.query}」の検索結果 ${d.messages.length}件`
    }
    case 'calendar_today':
    case 'calendar_tomorrow':
    case 'calendar_week': {
      const d = payload.data as { events: { title: string; start?: string }[] } | null
      if (!d) return '0件'
      const n = d.events.length
      if (n === 0) return '予定なし'
      const first = d.events[0]
      return `${n}件、最初は${first.title}`
    }
    case 'tasks': {
      const d = payload.data as { tasks: { status: string; due?: string }[] } | null
      if (!d) return '0件'
      const todos = d.tasks.filter((t) => t.status === 'todo')
      return `${todos.length}件のタスク`
    }
    case 'slack': {
      const d = payload.data as Array<{ channel: string; messages: unknown[] }> | null
      if (!d) return '0件'
      return `${d.length}チャンネルに未読あり`
    }
    case 'news': {
      const d = payload.data as { error?: string; subtitle?: string; data?: { items?: unknown[] } } | null
      if (!d || d.error) return d?.error ?? '取得失敗'
      const n = d.data?.items?.length ?? 0
      return `AIニュース ${n}件${d.subtitle ? ` (${d.subtitle})` : ''}`
    }
    case 'tools': {
      const d = payload.data as { error?: string; subtitle?: string; data?: { categories?: { tools?: unknown[] }[] } } | null
      if (!d || d.error) return d?.error ?? '取得失敗'
      const total = (d.data?.categories ?? []).reduce((sum, c) => sum + (c.tools?.length ?? 0), 0)
      return `ツール ${total}件${d.subtitle ? ` (${d.subtitle})` : ''}`
    }
    case 'movies': {
      const d = payload.data as { error?: string; subtitle?: string; data?: { nowPlaying?: unknown[]; upcoming?: unknown[] } } | null
      if (!d || d.error) return d?.error ?? '取得失敗'
      const nowN = d.data?.nowPlaying?.length ?? 0
      const upN = d.data?.upcoming?.length ?? 0
      return `映画: 公開中${nowN}件、来月${upN}件`
    }
    case 'terminal_output': {
      const d = payload.data as { command: string; stdout: string; stderr: string } | null
      if (!d) return '実行結果なし'
      return `コマンド実行完了: ${d.command}`
    }
  }
}

let pendingPayload: PanelPayload | null = null

/**
 * 表示ウィンドウへ payload を送る。まだ did-finish-load 前なら queue する。
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

  // ローディング状態を即座にプッシュしてユーザー待ち時間を埋める
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
