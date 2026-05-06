import type { Client } from '@libsql/client'
import { createLogger } from '../logger'

const log = createLogger('memory')

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

export type Procedure = { name: string; description: string; learnedAt: string; updatedAt: string }
export type MemoryItem = { text: string; importance: 1 | 2 | 3; lastSeen: string }
export type SessionSummary = { sessionId: string; date: string; summary: string }

export type Memory = {
  facts: MemoryItem[]
  preferences: MemoryItem[]
  ongoing_topics: MemoryItem[]
  procedures: Procedure[]
  session_summaries: SessionSummary[]
  updatedAt: string | null
}

export type Profile = { items: Record<string, string>; updatedAt: string | null }
export type MemoryListKind = 'facts' | 'preferences' | 'ongoing_topics'

// ── Store context ─────────────────────────────────────────────────────────────

let _db: Client | null = null

export function initStore(_userId: string, db: Client): void {
  _db = db
}

function ctx(): Client {
  if (!_db) throw new Error('memory/store: not initialized — call initStore() first')
  return _db
}

// ── Profile ───────────────────────────────────────────────────────────────────

export async function loadProfile(): Promise<Profile> {
  const db = ctx()
  const result = await db.execute('SELECT items, updated_at FROM profile WHERE id = 1')
  if (result.rows.length === 0) return { items: {}, updatedAt: null }
  const row = result.rows[0]
  return { items: parseJson(row.items as string, {}), updatedAt: (row.updated_at as string | null) ?? null }
}

export async function saveProfile(profile: Profile): Promise<void> {
  const db = ctx()
  await db.execute({
    sql: `INSERT INTO profile (id, items, updated_at) VALUES (1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET items=excluded.items, updated_at=excluded.updated_at`,
    args: [JSON.stringify(profile.items), profile.updatedAt ?? new Date().toISOString()],
  })
}

export async function upsertProfileItem(key: string, value: string): Promise<Profile> {
  const profile = await loadProfile()
  const updated = { ...profile, items: { ...profile.items, [key]: value }, updatedAt: new Date().toISOString() }
  await saveProfile(updated)
  return updated
}

export async function deleteProfileItem(key: string): Promise<Profile> {
  const profile = await loadProfile()
  const { [key]: _removed, ...rest } = profile.items
  const updated = { ...profile, items: rest, updatedAt: new Date().toISOString() }
  await saveProfile(updated)
  return updated
}

// ── Memory ────────────────────────────────────────────────────────────────────

export async function loadMemory(): Promise<Memory> {
  const db = ctx()
  const result = await db.execute(
    'SELECT facts, preferences, ongoing_topics, procedures, session_summaries, updated_at FROM memory WHERE id = 1',
  )
  if (result.rows.length === 0) return { facts: [], preferences: [], ongoing_topics: [], procedures: [], session_summaries: [], updatedAt: null }
  const row = result.rows[0]
  return {
    facts: parseJson(row.facts as string, []),
    preferences: parseJson(row.preferences as string, []),
    ongoing_topics: parseJson(row.ongoing_topics as string, []),
    procedures: parseJson(row.procedures as string, []),
    session_summaries: parseJson(row.session_summaries as string, []),
    updatedAt: (row.updated_at as string | null) ?? null,
  }
}

export async function saveMemory(memory: Memory): Promise<void> {
  const db = ctx()
  await db.execute({
    sql: `INSERT INTO memory (id, facts, preferences, ongoing_topics, procedures, session_summaries, updated_at)
          VALUES (1, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            facts=excluded.facts, preferences=excluded.preferences,
            ongoing_topics=excluded.ongoing_topics, procedures=excluded.procedures,
            session_summaries=excluded.session_summaries, updated_at=excluded.updated_at`,
    args: [
      JSON.stringify(memory.facts), JSON.stringify(memory.preferences),
      JSON.stringify(memory.ongoing_topics), JSON.stringify(memory.procedures),
      JSON.stringify(memory.session_summaries), memory.updatedAt ?? new Date().toISOString(),
    ],
  })
}

// ── Procedure helpers ─────────────────────────────────────────────────────────

export async function addProcedure(name: string, description: string): Promise<Memory> {
  const trimmedName = name.trim(); const trimmedDesc = description.trim()
  if (!trimmedName || !trimmedDesc) throw new Error('addProcedure: name and description must be non-empty')
  const memory = await loadMemory(); const now = new Date().toISOString()
  const idx = memory.procedures.findIndex((p) => p.name === trimmedName)
  const procedures = idx >= 0
    ? memory.procedures.map((p, i) => i === idx ? { ...p, description: trimmedDesc, updatedAt: now } : p)
    : [...memory.procedures, { name: trimmedName, description: trimmedDesc, learnedAt: now, updatedAt: now }]
  const updated = { ...memory, procedures, updatedAt: now }
  await saveMemory(updated); return updated
}

export async function removeProcedure(name: string): Promise<Memory> {
  const memory = await loadMemory()
  const procedures = memory.procedures.filter((p) => p.name !== name.trim())
  if (procedures.length === memory.procedures.length) return memory
  const updated = { ...memory, procedures, updatedAt: new Date().toISOString() }
  await saveMemory(updated); return updated
}

export async function listProcedures(): Promise<Procedure[]> { return (await loadMemory()).procedures }

export async function upsertProcedure(oldName: string | null, name: string, description: string): Promise<Memory> {
  const trimmedName = name.trim(); const trimmedDesc = description.trim()
  if (!trimmedName || !trimmedDesc) throw new Error('upsertProcedure: name and description must be non-empty')
  const memory = await loadMemory(); const now = new Date().toISOString()
  const targetKey = oldName?.trim() || trimmedName
  const idx = memory.procedures.findIndex((p) => p.name === targetKey)
  let procedures: Procedure[]
  if (idx >= 0) {
    const existing = memory.procedures[idx]
    procedures = memory.procedures.filter((p, i) => i === idx || p.name !== trimmedName)
    procedures[procedures.indexOf(existing)] = { ...existing, name: trimmedName, description: trimmedDesc, updatedAt: now }
  } else {
    procedures = [...memory.procedures.filter((p) => p.name !== trimmedName),
      { name: trimmedName, description: trimmedDesc, learnedAt: now, updatedAt: now }]
  }
  const updated = { ...memory, procedures, updatedAt: now }
  await saveMemory(updated); return updated
}

export async function upsertMemoryItem(kind: MemoryListKind, oldText: string | null, text: string): Promise<Memory> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('upsertMemoryItem: text must be non-empty')
  const memory = await loadMemory(); const today = new Date().toISOString().slice(0, 10)
  const targetKey = oldText?.trim() || trimmed; const list = memory[kind]
  const idx = list.findIndex((x) => x.text === targetKey)
  let updated: MemoryItem[]
  if (idx >= 0) {
    const existing = list[idx]
    updated = list.filter((x, i) => i === idx || x.text !== trimmed)
    updated[updated.indexOf(existing)] = { ...existing, text: trimmed, lastSeen: today }
  } else {
    updated = [...list.filter((x) => x.text !== trimmed), { text: trimmed, importance: 2, lastSeen: today }]
  }
  const newMemory = { ...memory, [kind]: updated, updatedAt: new Date().toISOString() }
  await saveMemory(newMemory); return newMemory
}

export async function removeMemoryItem(kind: MemoryListKind, text: string): Promise<Memory> {
  const memory = await loadMemory()
  const filtered = memory[kind].filter((x) => x.text !== text.trim())
  if (filtered.length === memory[kind].length) return memory
  const updated = { ...memory, [kind]: filtered, updatedAt: new Date().toISOString() }
  await saveMemory(updated); return updated
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function loadSessions(): Promise<SessionRecord[]> {
  const db = ctx()
  const result = await db.execute('SELECT id, started_at, ended_at, summarized, log_file FROM conv_sessions ORDER BY started_at DESC')
  return result.rows.map((r) => ({
    id: r.id as string, startedAt: r.started_at as string,
    endedAt: (r.ended_at as string | null) ?? null,
    summarized: (r.summarized as number) === 1, logFile: (r.log_file as string) ?? '',
  }))
}

export async function startSession(sessionId: string): Promise<SessionRecord> {
  const db = ctx(); const ts = new Date().toISOString()
  await db.execute({ sql: 'INSERT INTO conv_sessions (id, started_at, ended_at, summarized, log_file) VALUES (?, ?, NULL, 0, ?)', args: [sessionId, ts, ''] })
  await appendEvent({ type: 'session_start', sessionId, ts })
  return { id: sessionId, startedAt: ts, endedAt: null, summarized: false, logFile: '' }
}

export async function endSession(sessionId: string): Promise<void> {
  const db = ctx(); const ts = new Date().toISOString()
  await db.execute({ sql: 'UPDATE conv_sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL', args: [ts, sessionId] })
  await appendEvent({ type: 'session_end', sessionId, ts })
}

export async function markSummarized(sessionId: string): Promise<void> {
  await ctx().execute({ sql: 'UPDATE conv_sessions SET summarized = 1 WHERE id = ?', args: [sessionId] })
}

export async function repairCrashedSessions(activeSessionId: string | null): Promise<void> {
  const sessions = await loadSessions()
  for (const s of sessions) {
    if (s.id === activeSessionId || s.endedAt || s.summarized) continue
    const lastTs = await findLastEventTs(s.id)
    await ctx().execute({ sql: 'UPDATE conv_sessions SET ended_at = ? WHERE id = ?', args: [lastTs ?? s.startedAt, s.id] })
    log.log('クラッシュセッション復旧:', s.id)
  }
}

async function findLastEventTs(sessionId: string): Promise<string | null> {
  const result = await ctx().execute({ sql: 'SELECT MAX(ts) as last_ts FROM transcripts WHERE session_id = ?', args: [sessionId] })
  return (result.rows[0]?.last_ts as string | null) ?? null
}

export async function appendEvent(event: LogEvent): Promise<void> {
  if (event.type !== 'transcript') return
  await ctx().execute({
    sql: 'INSERT INTO transcripts (session_id, role, text, ts) VALUES (?, ?, ?, ?)',
    args: [event.sessionId, event.role, event.text, event.ts],
  })
}

export async function readSessionTranscripts(session: SessionRecord): Promise<{ role: 'user' | 'assistant'; text: string; ts: string }[]> {
  const result = await ctx().execute({ sql: 'SELECT role, text, ts FROM transcripts WHERE session_id = ? ORDER BY ts ASC', args: [session.id] })
  return result.rows.map((r) => ({ role: r.role as 'user' | 'assistant', text: r.text as string, ts: r.ts as string }))
}

export async function pendingSummarySessions(activeSessionId: string | null): Promise<SessionRecord[]> {
  const result = await ctx().execute({
    sql: `SELECT id, started_at, ended_at, summarized, log_file FROM conv_sessions
          WHERE ended_at IS NOT NULL AND summarized = 0${activeSessionId ? ' AND id != ?' : ''}
          ORDER BY started_at ASC`,
    args: activeSessionId ? [activeSessionId] : [],
  })
  return result.rows.map((r) => ({
    id: r.id as string, startedAt: r.started_at as string,
    endedAt: (r.ended_at as string | null) ?? null, summarized: false, logFile: (r.log_file as string) ?? '',
  }))
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}
