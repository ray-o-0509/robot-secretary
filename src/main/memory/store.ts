import { app } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'

export type LogEvent =
  | { type: 'session_start'; sessionId: string; ts: string }
  | { type: 'session_end'; sessionId: string; ts: string }
  | { type: 'transcript'; sessionId: string; ts: string; role: 'user' | 'assistant'; text: string }

export type SessionRecord = {
  id: string
  startedAt: string
  endedAt: string | null
  summarized: boolean
  logFile: string
}

export type Procedure = {
  name: string
  description: string
  learnedAt: string
  updatedAt: string
}

export type Memory = {
  facts: string[]
  preferences: string[]
  ongoing_topics: string[]
  procedures: Procedure[]
  updatedAt: string | null
}

const EMPTY_MEMORY: Memory = {
  facts: [],
  preferences: [],
  ongoing_topics: [],
  procedures: [],
  updatedAt: null,
}

function dirs() {
  const root = path.join(app.getPath('userData'), 'conversations')
  return {
    root,
    logs: root,
    sessionsFile: path.join(root, 'sessions.json'),
    memoryFile: path.join(root, 'memory.json'),
    profileFile: path.join(root, 'profile.json'),
  }
}

export type Profile = {
  items: Record<string, string>
  updatedAt: string | null
}

const EMPTY_PROFILE: Profile = { items: {}, updatedAt: null }

export async function loadProfile(): Promise<Profile> {
  await ensureDir()
  try {
    const raw = await fs.readFile(dirs().profileFile, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      items: typeof parsed.items === 'object' && parsed.items ? parsed.items : {},
      updatedAt: parsed.updatedAt ?? null,
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY_PROFILE, items: {} }
    console.warn('[memory] profile.json 読込失敗、空から開始:', err)
    return { ...EMPTY_PROFILE, items: {} }
  }
}

export async function saveProfile(profile: Profile): Promise<void> {
  await ensureDir()
  await atomicWrite(dirs().profileFile, JSON.stringify(profile, null, 2))
}

export async function upsertProfileItem(key: string, value: string): Promise<Profile> {
  const profile = await loadProfile()
  profile.items[key] = value
  profile.updatedAt = new Date().toISOString()
  await saveProfile(profile)
  return profile
}

export async function deleteProfileItem(key: string): Promise<Profile> {
  const profile = await loadProfile()
  delete profile.items[key]
  profile.updatedAt = new Date().toISOString()
  await saveProfile(profile)
  return profile
}

function todayLogName(d = new Date()): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}.jsonl`
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(dirs().root, { recursive: true })
}

async function atomicWrite(file: string, data: string): Promise<void> {
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`
  await fs.writeFile(tmp, data, 'utf8')
  await fs.rename(tmp, file)
}

export async function loadSessions(): Promise<SessionRecord[]> {
  await ensureDir()
  try {
    const raw = await fs.readFile(dirs().sessionsFile, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    // 壊れた台帳は無視して空から再開（生ログは残ってる）
    console.warn('[memory] sessions.json 読込失敗、空から開始:', err)
    return []
  }
}

async function saveSessions(sessions: SessionRecord[]): Promise<void> {
  await ensureDir()
  await atomicWrite(dirs().sessionsFile, JSON.stringify(sessions, null, 2))
}

export async function loadMemory(): Promise<Memory> {
  await ensureDir()
  try {
    const raw = await fs.readFile(dirs().memoryFile, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      facts: parsed.facts ?? [],
      preferences: parsed.preferences ?? [],
      ongoing_topics: parsed.ongoing_topics ?? [],
      procedures: Array.isArray(parsed.procedures) ? parsed.procedures : [],
      updatedAt: parsed.updatedAt ?? null,
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY_MEMORY }
    console.warn('[memory] memory.json 読込失敗、空から開始:', err)
    return { ...EMPTY_MEMORY }
  }
}

export async function saveMemory(memory: Memory): Promise<void> {
  await ensureDir()
  await atomicWrite(dirs().memoryFile, JSON.stringify(memory, null, 2))
}

export async function addProcedure(name: string, description: string): Promise<Memory> {
  const trimmedName = name.trim()
  const trimmedDesc = description.trim()
  if (!trimmedName || !trimmedDesc) {
    throw new Error('addProcedure: name and description must be non-empty')
  }
  const memory = await loadMemory()
  const now = new Date().toISOString()
  const idx = memory.procedures.findIndex((p) => p.name === trimmedName)
  if (idx >= 0) {
    memory.procedures[idx] = {
      ...memory.procedures[idx],
      description: trimmedDesc,
      updatedAt: now,
    }
  } else {
    memory.procedures.push({
      name: trimmedName,
      description: trimmedDesc,
      learnedAt: now,
      updatedAt: now,
    })
  }
  memory.updatedAt = now
  await saveMemory(memory)
  return memory
}

export async function removeProcedure(name: string): Promise<Memory> {
  const trimmedName = name.trim()
  const memory = await loadMemory()
  const before = memory.procedures.length
  memory.procedures = memory.procedures.filter((p) => p.name !== trimmedName)
  if (memory.procedures.length !== before) {
    memory.updatedAt = new Date().toISOString()
    await saveMemory(memory)
  }
  return memory
}

export async function listProcedures(): Promise<Procedure[]> {
  const memory = await loadMemory()
  return memory.procedures
}

export async function appendEvent(event: LogEvent): Promise<void> {
  await ensureDir()
  const file = path.join(dirs().logs, todayLogName())
  await fs.appendFile(file, JSON.stringify(event) + '\n', 'utf8')
}

export async function startSession(sessionId: string): Promise<SessionRecord> {
  const ts = new Date().toISOString()
  const record: SessionRecord = {
    id: sessionId,
    startedAt: ts,
    endedAt: null,
    summarized: false,
    logFile: todayLogName(),
  }
  const sessions = await loadSessions()
  sessions.push(record)
  await saveSessions(sessions)
  await appendEvent({ type: 'session_start', sessionId, ts })
  return record
}

export async function endSession(sessionId: string): Promise<void> {
  const ts = new Date().toISOString()
  const sessions = await loadSessions()
  const idx = sessions.findIndex((s) => s.id === sessionId)
  if (idx >= 0 && !sessions[idx].endedAt) {
    sessions[idx].endedAt = ts
    await saveSessions(sessions)
  }
  await appendEvent({ type: 'session_end', sessionId, ts })
}

export async function markSummarized(sessionId: string): Promise<void> {
  const sessions = await loadSessions()
  const idx = sessions.findIndex((s) => s.id === sessionId)
  if (idx >= 0) {
    sessions[idx].summarized = true
    await saveSessions(sessions)
  }
}

// 起動時の救済: endedAt が無いまま summarized=false で残っているセッションは
// 前回クラッシュしたとみなし、ログから最後のイベント時刻を拾って endedAt を埋める
export async function repairCrashedSessions(activeSessionId: string | null): Promise<void> {
  const sessions = await loadSessions()
  let changed = false
  for (const s of sessions) {
    if (s.id === activeSessionId) continue
    if (s.endedAt || s.summarized) continue
    const lastTs = await findLastEventTs(s.id, s.logFile)
    s.endedAt = lastTs ?? s.startedAt
    changed = true
    console.log('[memory] クラッシュしたセッションを復旧:', s.id)
  }
  if (changed) await saveSessions(sessions)
}

async function findLastEventTs(sessionId: string, logFile: string): Promise<string | null> {
  const file = path.join(dirs().logs, logFile)
  try {
    const raw = await fs.readFile(file, 'utf8')
    let last: string | null = null
    for (const line of raw.split('\n')) {
      if (!line) continue
      try {
        const ev = JSON.parse(line) as LogEvent
        if (ev.sessionId === sessionId) last = ev.ts
      } catch {
        // 壊れた行は無視
      }
    }
    return last
  } catch {
    return null
  }
}

export async function readSessionTranscripts(
  session: SessionRecord,
): Promise<{ role: 'user' | 'assistant'; text: string; ts: string }[]> {
  const file = path.join(dirs().logs, session.logFile)
  try {
    const raw = await fs.readFile(file, 'utf8')
    const out: { role: 'user' | 'assistant'; text: string; ts: string }[] = []
    for (const line of raw.split('\n')) {
      if (!line) continue
      try {
        const ev = JSON.parse(line) as LogEvent
        if (ev.sessionId === session.id && ev.type === 'transcript') {
          out.push({ role: ev.role, text: ev.text, ts: ev.ts })
        }
      } catch {
        // 壊れた行は無視
      }
    }
    return out
  } catch {
    return []
  }
}

export async function pendingSummarySessions(activeSessionId: string | null): Promise<SessionRecord[]> {
  const sessions = await loadSessions()
  return sessions.filter((s) => s.id !== activeSessionId && s.endedAt && !s.summarized)
}
