import { getTickTickToken } from '../shared/tickTickAuth'

const BASE = 'https://api.ticktick.com/open/v1'

const PRIORITY_TO_INT: Record<string, number> = { low: 1, medium: 3, high: 5 }
const PRIORITY_FROM_INT: Record<number, 'low' | 'medium' | 'high' | undefined> = { 1: 'low', 3: 'medium', 5: 'high' }
const STATUS_FROM_INT: Record<number, 'todo' | 'done'> = { 0: 'todo', 2: 'done' }

const _jstDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric', month: '2-digit', day: '2-digit',
})
const _jstTimeFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
})

function isoToJstDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso.slice(0, 10)
  return _jstDateFmt.format(d)
}

function isoToJstDateTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return _jstTimeFmt.format(d)
}

// Accepts YYYY-MM-DD (all-day) or YYYY-MM-DDTHH:mm / YYYY-MM-DD HH:mm (with time, JST assumed)
function parseDue(due: string): { dueDate: string; isAllDay: boolean } {
  const hasTime = due.includes('T') || (due.length > 10 && due[10] === ' ')
  if (hasTime) {
    const normalized = due.replace(' ', 'T')
    const withTz = /[+Z]/.test(normalized.slice(10)) ? normalized : normalized + '+09:00'
    return { dueDate: withTz, isAllDay: false }
  }
  return { dueDate: due + 'T00:00:00+09:00', isAllDay: true }
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getTickTickToken()}`,
    'Content-Type': 'application/json',
  }
}

type RawSubtask = {
  id: string
  title: string
  status?: number
  completedTime?: string
  sortOrder?: number
  startDate?: string
  isAllDay?: boolean
  timeZone?: string
}
type RawTask = {
  id: string
  projectId: string
  title: string
  status?: number
  priority?: number
  dueDate?: string
  isAllDay?: boolean
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
  if (t.dueDate) {
    item.due = t.isAllDay ? isoToJstDate(t.dueDate) : isoToJstDateTime(t.dueDate)
  }
  if (t.tags?.length) item.tags = t.tags
  if (t.items?.length) {
    item.subtasks = t.items.map((i) => ({ id: i.id, title: i.title, done: i.status === 2 }))
  }
  if (t.desc) item.description = t.desc
  return item
}

export async function getProjects() {
  const r = await fetch(`${BASE}/project`, { headers: authHeaders() })
  if (!r.ok) throw new Error(`getProjects failed: ${r.status} ${await r.text()}`)
  const projects = (await r.json()) as { id: string; name: string; color?: string }[]
  return { count: projects.length, projects: projects.map((p) => ({ id: p.id, name: p.name, color: p.color })) }
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
  description?: string
}) {
  const body: Record<string, unknown> = { title: opts.title }
  if (opts.projectId) body.projectId = opts.projectId
  if (opts.priority) body.priority = PRIORITY_TO_INT[opts.priority]
  if (opts.due) {
    const { dueDate, isAllDay } = parseDue(opts.due)
    body.dueDate = dueDate
    body.isAllDay = isAllDay
    body.timeZone = 'Asia/Tokyo'
  }
  if (opts.description) body.desc = opts.description
  if (opts.subtasks?.length) {
    body.items = opts.subtasks
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter((s) => s.length > 0)
      .map((title, idx) => ({ title, status: 0, sortOrder: idx }))
  }

  const r = await fetch(`${BASE}/task`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`createTask failed: ${r.status} ${await r.text()}`)
  return mapTask((await r.json()) as RawTask)
}

export async function completeTask(opts: { taskId: string; projectId: string }) {
  const r = await fetch(`${BASE}/project/${opts.projectId}/task/${opts.taskId}/complete`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!r.ok) throw new Error(`completeTask failed: ${r.status} ${await r.text()}`)
  return { ok: true }
}

export async function deleteTask(opts: { taskId: string; projectId: string }) {
  const r = await fetch(`${BASE}/project/${opts.projectId}/task/${opts.taskId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!r.ok) throw new Error(`deleteTask failed: ${r.status} ${await r.text()}`)
  return { ok: true }
}

export async function updateTask(opts: {
  taskId: string
  projectId: string
  title?: string
  due?: string | null
  priority?: 'low' | 'medium' | 'high' | 'none'
  description?: string | null
  addSubtasks?: string[]
  updateSubtasks?: { id: string; title: string }[]
}) {
  const headers = authHeaders()
  const fetchRes = await fetch(`${BASE}/project/${opts.projectId}/task/${opts.taskId}`, { headers })
  if (!fetchRes.ok) throw new Error(`fetch task failed: ${fetchRes.status} ${await fetchRes.text()}`)
  const task = (await fetchRes.json()) as RawTask
  const body: Record<string, unknown> = { ...task, id: opts.taskId, projectId: opts.projectId }

  if (opts.title !== undefined) body.title = opts.title
  if (opts.due !== undefined) {
    if (opts.due === null) {
      body.dueDate = null
      body.isAllDay = null
    } else {
      const { dueDate, isAllDay } = parseDue(opts.due)
      body.dueDate = dueDate
      body.isAllDay = isAllDay
      body.timeZone = 'Asia/Tokyo'
    }
  }
  if (opts.priority !== undefined) body.priority = opts.priority === 'none' ? 0 : PRIORITY_TO_INT[opts.priority]
  if (opts.description !== undefined) body.desc = opts.description ?? null

  let items = [...(task.items ?? [])]
  if (opts.updateSubtasks?.length) {
    items = items.map((it) => {
      const upd = opts.updateSubtasks!.find((u) => u.id === it.id)
      return upd ? { ...it, title: upd.title } : it
    })
  }
  if (opts.addSubtasks?.length) {
    const newItems = opts.addSubtasks
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter((s) => s.length > 0)
      .map((title, idx) => ({ title, status: 0, sortOrder: items.length + idx }))
    items = [...items, ...newItems]
  }
  if (opts.addSubtasks?.length || opts.updateSubtasks?.length) {
    body.items = items
  }

  const upd = await fetch(`${BASE}/task/${opts.taskId}`, { method: 'POST', headers, body: JSON.stringify(body) })
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
