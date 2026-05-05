import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CYAN, FONT_MONO, MAGENTA } from '../../display/styles'
import { Card } from '../../display/components/Card'
import { EmptyState } from '../../display/components/EmptyState'
import { ErrorState } from '../../display/components/ErrorState'
import { LoadingState } from '../../display/components/LoadingState'
import type { PanelPayload } from '../../display/types'

type Subtask = { id?: string; title: string; done: boolean }
type Task = {
  taskId: string
  projectId: string
  title: string
  status: 'todo' | 'done'
  priority?: 'low' | 'medium' | 'high'
  due?: string
  tags?: string[]
  description?: string
  subtasks?: Subtask[]
}
type TaskData = { count: number; tasks: Task[] }

interface Props {
  payload: PanelPayload
}

export function TasksView({ payload }: Props) {
  const { t } = useTranslation()
  const [pendingTasks, setPendingTasks] = useState<Set<string>>(new Set())
  const [pendingSubtasks, setPendingSubtasks] = useState<Set<string>>(new Set())

  // 新しいペイロードが届いたら楽観 UI 用の保留状態をリセット
  useEffect(() => {
    setPendingTasks(new Set())
    setPendingSubtasks(new Set())
  }, [payload.fetchedAt])

  if (payload.loading && !payload.data) return <LoadingState count={4} />

  if (payload.error) {
    return <ErrorState message={payload.error} hint={t('tasks.authExpiredHint')} />
  }

  const data = payload.data as TaskData
  const todos = (data?.tasks ?? []).filter(
    (t) => t.status === 'todo' && !pendingTasks.has(t.taskId),
  )
  if (todos.length === 0) {
    return <EmptyState message={t('tasks.noTasks')} />
  }

  const handleCompleteTask = async (taskId: string, projectId: string) => {
    setPendingTasks((prev) => {
      const next = new Set(prev)
      next.add(taskId)
      return next
    })
    try {
      await window.electronAPI?.callTool('complete_task', { taskId, projectId })
      await window.electronAPI?.displayRefresh('tasks')
    } catch (err) {
      console.error('[tasks] complete failed', err)
      setPendingTasks((prev) => {
        const next = new Set(prev)
        next.delete(taskId)
        return next
      })
    }
  }

  const handleCompleteSubtask = async (
    taskId: string,
    projectId: string,
    subtaskId: string,
  ) => {
    const key = `${taskId}:${subtaskId}`
    setPendingSubtasks((prev) => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
    try {
      await window.electronAPI?.callTool('complete_subtask', { taskId, projectId, subtaskId })
      await window.electronAPI?.displayRefresh('tasks')
    } catch (err) {
      console.error('[tasks] complete subtask failed', err)
      setPendingSubtasks((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  return (
    <>
      {todos.map((t) => (
        <Card key={t.taskId} accent={t.priority === 'high' ? 'magenta' : 'cyan'}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <Checkbox onClick={() => handleCompleteTask(t.taskId, t.projectId)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: '#e8f6ff',
                  marginBottom: 6,
                  wordBreak: 'break-word',
                }}
              >
                {t.title}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {t.priority && <PriorityBadge priority={t.priority} />}
                {t.due && <DueBadge due={t.due} />}
                {t.tags?.map((tag) => <TagChip key={tag} tag={tag} />)}
              </div>
              {t.subtasks && t.subtasks.length > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    paddingLeft: 4,
                    borderLeft: `1px solid ${CYAN}30`,
                  }}
                >
                  {t.subtasks.map((s, i) => {
                    const pending = s.id ? pendingSubtasks.has(`${t.taskId}:${s.id}`) : false
                    const done = s.done || pending
                    return (
                      <SubtaskRow
                        key={s.id ?? i}
                        title={s.title}
                        done={done}
                        clickable={!!s.id && !done}
                        onComplete={() => {
                          if (s.id) handleCompleteSubtask(t.taskId, t.projectId, s.id)
                        }}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </>
  )
}

function Checkbox({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      onClick={onClick}
      title={t('tasks.markDone')}
      style={{
        background: 'transparent',
        border: 'none',
        padding: '0 2px',
        margin: 0,
        cursor: 'pointer',
        fontFamily: FONT_MONO,
        fontSize: 12,
        fontWeight: 700,
        color: CYAN,
        textShadow: `0 0 6px ${CYAN}80`,
        lineHeight: 1.1,
        flexShrink: 0,
      }}
    >
      [ ]
    </button>
  )
}

function SubtaskRow({
  title,
  done,
  clickable,
  onComplete,
}: {
  title: string
  done: boolean
  clickable: boolean
  onComplete: () => void
}) {
  const boxColor = done ? MAGENTA : CYAN
  const textColor = done ? 'rgba(232, 246, 255, 0.4)' : 'rgba(232, 246, 255, 0.8)'
  return (
    <button
      onClick={clickable ? onComplete : undefined}
      disabled={!clickable}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        margin: 0,
        textAlign: 'left',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        cursor: clickable ? 'pointer' : 'default',
        fontFamily: FONT_MONO,
        fontSize: 10.5,
        color: textColor,
        textDecoration: done ? 'line-through' : 'none',
        wordBreak: 'break-word',
      }}
    >
      <span
        style={{
          color: boxColor,
          textShadow: `0 0 4px ${boxColor}80`,
          flexShrink: 0,
          fontWeight: 700,
        }}
      >
        {done ? '[✓]' : '[ ]'}
      </span>
      <span style={{ flex: 1 }}>{title}</span>
    </button>
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
  const { t } = useTranslation()
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
      {overdue ? t('tasks.overdue') : isToday ? t('tasks.today') : ''}
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
