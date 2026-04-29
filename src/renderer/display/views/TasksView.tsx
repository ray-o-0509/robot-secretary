import { FONT_MONO, MAGENTA } from '../styles'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import type { PanelPayload } from '../types'

type TaskData = {
  count: number
  tasks: Array<{
    taskId: string
    projectId: string
    title: string
    status: 'todo' | 'done'
    priority?: 'low' | 'medium' | 'high'
    due?: string
    tags?: string[]
    description?: string
    subtasks?: { title: string; done: boolean }[]
  }>
}

interface Props {
  payload: PanelPayload
}

export function TasksView({ payload }: Props) {
  if (payload.error) {
    return <ErrorState message={payload.error} hint="TickTick の認証が切れている可能性" />
  }

  const data = payload.data as TaskData
  const todos = data?.tasks.filter((t) => t.status === 'todo') ?? []
  if (todos.length === 0) {
    return <EmptyState message="タスクなし。やる事ねえぞ" />
  }

  return (
    <>
      {todos.map((t) => (
        <Card key={t.taskId} accent={t.priority === 'high' ? 'magenta' : 'cyan'}>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11.5,
              fontWeight: 700,
              color: '#e8f6ff',
              marginBottom: 6,
            }}
          >
            {t.title}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: t.subtasks?.length ? 6 : 0 }}>
            {t.priority && <PriorityBadge priority={t.priority} />}
            {t.due && <DueBadge due={t.due} />}
            {t.tags?.map((tag) => <TagChip key={tag} tag={tag} />)}
          </div>
          {t.subtasks && t.subtasks.length > 0 && (
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                color: 'rgba(232, 246, 255, 0.55)',
                marginTop: 4,
              }}
            >
              {t.subtasks.filter((s) => s.done).length}/{t.subtasks.length} サブタスク完了
            </div>
          )}
        </Card>
      ))}
    </>
  )
}

function PriorityBadge({ priority }: { priority: 'low' | 'medium' | 'high' }) {
  const colors = {
    high: { bg: 'rgba(255, 43, 214, 0.18)', fg: MAGENTA },
    medium: { bg: 'rgba(255, 200, 60, 0.18)', fg: '#ffc83c' },
    low: { bg: 'rgba(0, 240, 255, 0.12)', fg: '#7fdfff' },
  }
  const c = colors[priority]
  return (
    <span
      style={{
        fontFamily: FONT_MONO,
        fontSize: 9.5,
        letterSpacing: 1,
        textTransform: 'uppercase',
        background: c.bg,
        color: c.fg,
        padding: '2px 6px',
        border: `1px solid ${c.fg}50`,
        textShadow: `0 0 6px ${c.fg}60`,
      }}
    >
      P:{priority}
    </span>
  )
}

function DueBadge({ due }: { due: string }) {
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const overdue = due < todayKey
  const isToday = due === todayKey
  const color = overdue ? MAGENTA : isToday ? '#ffc83c' : '#7fdfff'
  return (
    <span
      style={{
        fontFamily: FONT_MONO,
        fontSize: 9.5,
        letterSpacing: 1,
        background: 'rgba(8, 12, 24, 0.7)',
        color,
        padding: '2px 6px',
        border: `1px solid ${color}50`,
        textShadow: `0 0 6px ${color}60`,
      }}
    >
      {overdue ? '期限切れ ' : isToday ? '今日 ' : ''}
      {due}
    </span>
  )
}

function TagChip({ tag }: { tag: string }) {
  return (
    <span
      style={{
        fontFamily: FONT_MONO,
        fontSize: 9.5,
        letterSpacing: 0.8,
        background: 'rgba(0, 240, 255, 0.08)',
        color: 'rgba(232, 246, 255, 0.7)',
        padding: '2px 6px',
        border: '1px solid rgba(0, 240, 255, 0.25)',
      }}
    >
      #{tag}
    </span>
  )
}
