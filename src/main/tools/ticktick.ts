import { getTickTickToken } from './tickTickAuth'

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

type RawTask = {
  id: string
  projectId: string
  title: string
  status?: number
  priority?: number
  dueDate?: string
  tags?: string[]
  desc?: string
  items?: { title: string; status?: number }[]
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
  subtasks?: { title: string; done: boolean }[]
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
    item.subtasks = t.items.map((i) => ({ title: i.title, done: i.status === 2 }))
  } else if (t.desc) {
    item.description = t.desc
  }
  return item
}

export async function getTodos() {
  const headers = authHeaders()
  const projectsRes = await fetch(`${BASE}/project`, { headers })
  const projects = projectsRes.ok ? ((await projectsRes.json()) as { id: string }[]) : []

  const sources = [
    fetch(`${BASE}/project/inbox/data`, { headers }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ...projects.map((p) =>
      fetch(`${BASE}/project/${p.id}/data`, { headers }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
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
}) {
  const body: Record<string, unknown> = { title: opts.title }
  if (opts.projectId) body.projectId = opts.projectId
  if (opts.priority) body.priority = PRIORITY_TO_INT[opts.priority]
  if (opts.due) body.dueDate = opts.due

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
