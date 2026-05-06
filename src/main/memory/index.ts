import { ipcMain } from 'electron'
import { createLogger } from '../logger'

const log = createLogger('memory')
import * as crypto from 'crypto'
import {
  appendEvent,
  deleteProfileItem,
  endSession,
  loadMemory,
  loadProfile,
  loadSessions,
  markSummarized,
  pendingSummarySessions,
  readSessionTranscripts,
  repairCrashedSessions,
  saveMemory,
  startSession,
  upsertProfileItem,
  type Memory,
} from './store'
import { summarize } from './summarizer'

let activeSessionId: string | null = null
let summarizing = false

function newSessionId(): string {
  return crypto.randomUUID()
}

const IMPORTANCE_THRESHOLDS: Record<1 | 2 | 3, number | null> = {
  3: null,  // always inject
  2: 90,    // inject if seen within 90 days
  1: 30,    // inject if seen within 30 days
}
const IMPORTANCE_CAPS: Record<1 | 2 | 3, number> = { 3: 10, 2: 10, 1: 5 }

function selectItems(items: import('./store').MemoryItem[], today: Date): string[] {
  const counts: Record<1 | 2 | 3, number> = { 3: 0, 2: 0, 1: 0 }
  const result: string[] = []
  for (const item of items) {
    const imp = item.importance
    const threshold = IMPORTANCE_THRESHOLDS[imp]
    if (threshold !== null) {
      const daysSince = (today.getTime() - new Date(item.lastSeen).getTime()) / 86_400_000
      if (daysSince > threshold) continue
    }
    if (counts[imp] >= IMPORTANCE_CAPS[imp]) continue
    counts[imp]++
    result.push(item.text)
  }
  return result
}

async function buildInjection(memory: Memory): Promise<string> {
  const sections: string[] = []
  const today = new Date()

  // Explicitly registered personal info (profile.json)
  const profile = await loadProfile()
  const profileEntries = Object.entries(profile.items)
  if (profileEntries.length) {
    sections.push(
      '## User personal info (confirmed)\n' +
        profileEntries.map(([k, v]) => `- ${k}: ${v}`).join('\n'),
    )
  }

  // Memory auto-extracted from conversations (importance-filtered)
  const facts = selectItems(memory.facts, today)
  const prefs = selectItems(memory.preferences, today)
  const topics = selectItems(memory.ongoing_topics, today)

  if (facts.length) sections.push('## Learned from conversation\n- ' + facts.join('\n- '))
  if (prefs.length) sections.push('## Preferences and communication style\n- ' + prefs.join('\n- '))
  if (topics.length) sections.push('## Ongoing topics\n- ' + topics.join('\n- '))

  if (memory.procedures.length) {
    sections.push(
      '## Learned procedures (you can execute these using existing tools)\n' +
        memory.procedures.map((p) => `- **${p.name}**: ${p.description}`).join('\n'),
    )
  }

  // Recent session summaries (last 5, skip empty)
  const recentSummaries = memory.session_summaries.filter((s) => s.summary).slice(0, 5)
  if (recentSummaries.length) {
    sections.push(
      '## Recent sessions\n' +
        recentSummaries.map((s) => `- ${s.date}: ${s.summary}`).join('\n'),
    )
  }

  if (!sections.length) return ''
  return '\n\n# What I know about you\n' + sections.join('\n\n')
}

async function summarizePending(apiKey: string | undefined): Promise<void> {
  if (summarizing) return
  if (!apiKey) {
    log.warn('Skipping summarization: GEMINI_API_KEY is not set')
    return
  }
  summarizing = true
  try {
    const targets = await pendingSummarySessions(activeSessionId)
    for (const session of targets) {
      try {
        const transcripts = await readSessionTranscripts(session)
        const existing = await loadMemory()
        const updated = await summarize(existing, transcripts, apiKey, session.id)
        await saveMemory(updated)
        await markSummarized(session.id)
        log.log('Summarization complete:', session.id, `(${transcripts.length} entries)`)
      } catch (err) {
        // Failure in one session does not block the next; it will be picked up again on next startup
        log.error('Summarization failed:', session.id, err)
      }
    }
  } finally {
    summarizing = false
  }
}

export async function initMemory(getApiKey: () => string | undefined): Promise<void> {
  // 1. Start a new session on startup
  activeSessionId = newSessionId()
  await startSession(activeSessionId)
  log.log('Session started:', activeSessionId)

  // 2. Repair any incomplete sessions from previous runs (fill in endedAt)
  await repairCrashedSessions(activeSessionId)

  // 3. Process unsummarized sessions asynchronously in the background
  //    Do not await — must not block app startup
  void summarizePending(getApiKey())

  // 4. Register IPC handlers
  ipcMain.handle('memory:get-injection', async () => {
    const memory = await loadMemory()
    return buildInjection(memory)
  })

  ipcMain.handle('memory:upsert-profile', async (_event, key: string, value: string) => {
    const profile = await upsertProfileItem(key, value)
    log.log('Profile updated:', key, '=', value)
    return { ok: true, items: profile.items }
  })

  ipcMain.handle('memory:delete-profile', async (_event, key: string) => {
    const profile = await deleteProfileItem(key)
    log.log('Profile item deleted:', key)
    return { ok: true, items: profile.items }
  })

  ipcMain.handle('memory:get-profile', async () => {
    const profile = await loadProfile()
    return profile.items
  })

  ipcMain.on('memory:transcript', (_event, payload: { role: 'user' | 'assistant'; text: string }) => {
    if (!activeSessionId) return
    if (!payload?.text) return
    void appendEvent({
      type: 'transcript',
      sessionId: activeSessionId,
      ts: new Date().toISOString(),
      role: payload.role,
      text: payload.text,
    }).catch((err) => log.error('Failed to append transcript:', err))
  })
}

// Call on app exit. Only stamps endedAt.
// Summarization is deferred to next startup (before-quit cannot be awaited reliably).
export async function shutdownMemory(): Promise<void> {
  if (!activeSessionId) return
  try {
    await endSession(activeSessionId)
    log.log('Session ended:', activeSessionId)
  } catch (err) {
    log.error('Failed to end session:', err)
  }
  activeSessionId = null
}

export function getActiveSessionId(): string | null {
  return activeSessionId
}

// Exported for testing/debugging
export { loadMemory, loadSessions }
