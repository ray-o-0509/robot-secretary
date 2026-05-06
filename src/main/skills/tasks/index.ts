import { getTickTickToken } from '../shared/tickTickAuth'

const BASE = 'https://api.ticktick.com/open/v1'

const PRIORITY_TO_INT: Record<string, number> = { low: 1, medium: 3, high: 5 }
const PRIORITY_FROM_INT: Record<number, 'low' | 'medium' | 'high' | undefined> = { 1: 'low', 3: 'medium', 5: 'high' }
const STATUS_FROM_INT: Record<number, 'todo' | 'done'> = { 0: 'todo', 2: 'done' }

const _jstFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric', month: '2-digit', day: '2-digit',
})
function isoToJstDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso.slice(0, 10)
  return _jstFmt.format(d)
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getTickTickToken()}`,
    'Content-Type': 'application/json',
  }
}

type RawSubtask = { id: string; title: string; status?: number; completedTime?: string; sortOrder?: number; startDate?: string; isAllDay?: boolean; timeZone?: string }
type RawTask = {
  id: string
  projectId: string
  title: string
  status?: number
  priority?: number
  dueDate?: string
  tags?: string[]
  desc?: string
  items?: RawSubtask[]
}

type Task = {
  taskId: string
  projectId: string
  title: string
  status: 'todo' | 'done'
  priority?: 'low' | 'medium' | 'high'
  due?: string
  tags?: string[]
  description?: string
  subtasks?: { id: string; title: string; done: boolean }[]
}

function mapTask(t: RawTask): Task {
  const item: Task = {
    taskId: t.id,
    projectId: t.projectId,
    title: t.title,
    status: STATUS_FROM_INT[t.status ?? 0] ?? 'todo',
  }
  const p = PRIORITY_FROM_INT[t.priority ?? 0]
  if (p) item.priority = p
  if (t.dueDate) item.due = isoToJstDate(t.dueDate)
  if (t.tags?.length) item.tags = t.tags
  if (t.items?.length) {
    item.subtasks = t.items.map((i) => ({ id: i.id, title: i.title, done: i.status === 2 }))
  }
  if (t.desc) {
    item.description = t.desc
  }
  return item
}

export async function getTodos() {
  const headers = authHeaders()
  const projectsRes = await fetch(`${BASE}/project`, { headers })
  const projects = projectsRes.ok ? ((await projectsRes.json()) as { id: string }[]) : []

  const sources = [
    fetch(`${BASE}/project/inbox/data`, { headers }).then((r) => (r.ok ? r.json() : null)).catch((err) => { console.error('[get_tasks] inbox fetch error:', err); return null }),
    ...projects.map((p) =>
      fetch(`${BASE}/project/${p.id}/data`, { headers }).then((r) => (r.ok ? r.json() : null)).catch((err) => { console.error(`[get_tasks] project ${p.id} fetch error:`, err); return null }),
    ),
  ]
  const results = (await Promise.all(sources)) as ({ tasks?: RawTask[] } | null)[]
  const tasks = results.flatMap((r) => r?.tasks ?? []).map(mapTask)
  return { count: tasks.length, tasks }
}

export async function createTask(opts: {
  title: string
  due?: string
  priority?: 'low' | 'medium' | 'high'
  projectId?: string
  subtasks?: string[]
}) {
  const body: Record<string, unknown> = { title: opts.title }
  if (opts.projectId) body.projectId = opts.projectId
  if (opts.priority) body.priority = PRIORITY_TO_INT[opts.priority]
  if (opts.due) body.dueDate = opts.due
  if (opts.subtasks?.length) {
    body.items = opts.subtasks
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter((s) => s.length > 0)
      .map((title, idx) => ({ title, status: 0, sortOrder: idx }))
  }

  const r = await fetch(`${BASE}/task`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`createTask failed: ${r.status} ${await r.text()}`)
  const created = (await r.json()) as RawTask
  return mapTask(created)
}

export async function completeTask(opts: { taskId: string; projectId: string }) {
  const r = await fetch(`${BASE}/project/${opts.projectId}/task/${opts.taskId}/complete`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!r.ok) throw new Error(`completeTask failed: ${r.status} ${await r.text()}`)
  return { ok: true }
}

export async function updateTask(opts: {
  taskId: string
  projectId: string
  title?: string
  due?: string | null
  priority?: 'low' | 'medium' | 'high' | 'none'
}) {
  const headers = authHeaders()
  const fetchRes = await fetch(`${BASE}/project/${opts.projectId}/task/${opts.taskId}`, { headers })
  if (!fetchRes.ok) throw new Error(`fetch task failed: ${fetchRes.status} ${await fetchRes.text()}`)
  const task = (await fetchRes.json()) as RawTask
  const body: Record<string, unknown> = { ...task, id: opts.taskId, projectId: opts.projectId }
  if (opts.title !== undefined) body.title = opts.title
  if (opts.due !== undefined) body.dueDate = opts.due ?? null
  if (opts.priority !== undefined) body.priority = opts.priority === 'none' ? 0 : PRIORITY_TO_INT[opts.priority]
  const upd = await fetch(`${BASE}/task/${opts.taskId}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  })
  if (!upd.ok) throw new Error(`updateTask failed: ${upd.status} ${await upd.text()}`)
  return mapTask((await upd.json()) as RawTask)
}

export async function completeSubtask(opts: { taskId: string; projectId: string; subtaskId: string }) {
  const headers = authHeaders()
  const fetchRes = await fetch(`${BASE}/project/${opts.projectId}/task/${opts.taskId}`, { headers })
  if (!fetchRes.ok) throw new Error(`fetch task failed: ${fetchRes.status} ${await fetchRes.text()}`)
  const task = (await fetchRes.json()) as RawTask
  const items = (task.items ?? []).map((it) =>
    it.id === opts.subtaskId
      ? { ...it, status: 2, completedTime: new Date().toISOString() }
      : it,
  )
  const upd = await fetch(`${BASE}/task/${opts.taskId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...task, id: opts.taskId, projectId: opts.projectId, items }),
  })
  if (!upd.ok) throw new Error(`completeSubtask failed: ${upd.status} ${await upd.text()}`)
  return { ok: true }
}
