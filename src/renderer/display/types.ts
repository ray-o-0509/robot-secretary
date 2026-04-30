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

export type PanelPayload = {
  type: PanelType
  data: unknown
  fetchedAt: number
  loading?: boolean
  error?: string
}

export const PANEL_LABELS: Record<PanelType, string> = {
  email: '◢ INBOX // GMAIL',
  email_search: '◢ SEARCH // GMAIL',
  calendar_today: '◢ AGENDA // TODAY',
  calendar_tomorrow: '◢ AGENDA // TOMORROW',
  calendar_week: '◢ AGENDA // WEEK',
  tasks: '◢ TASKS // TICKTICK',
  slack: '◢ SLACK // UNREAD',
  news: '◢ FEED // AI_NEWS',
  tools: '◢ ARSENAL // BEST_TOOLS',
  movies: '◢ CINEMA // RELEASES',
}

// daily-dashboard の getDashboardEntry が返す共通形状
export type DashboardEntry<T = unknown> = {
  skill: 'ai-news' | 'best-tools' | 'movies' | 'spending'
  id: string
  subtitle: string
  data: T
}

export type DashboardPayload<T = unknown> = DashboardEntry<T> | { error: string }

export type NewsItem = {
  title: string
  summary: string
  detail?: string
  tag?: string
  image?: string
  source?: { name: string; url: string }
}

export type NewsData = {
  highlight?: string
  items: NewsItem[]
}

export type ToolItem = {
  name: string
  url?: string
  tag?: string
  tagline?: string
  why?: string
}

export type ToolsData = {
  categories: { name: string; tools: ToolItem[] }[]
}

export type Movie = {
  title: string
  titleJa?: string
  posterUrl?: string
  rating?: number
  releaseDate?: string
  popularity?: number
  genre?: string[]
  overview?: string
  url?: string
}

export type MoviesData = {
  nowPlaying?: Movie[]
  upcoming?: Movie[]
}
