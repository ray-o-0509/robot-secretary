import { ipcMain } from 'electron'
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

async function buildInjection(memory: Memory): Promise<string> {
  const sections: string[] = []

  // Explicitly registered personal info (profile.json)
  const profile = await loadProfile()
  const profileEntries = Object.entries(profile.items)
  if (profileEntries.length) {
    sections.push(
      '## User personal info (confirmed)\n' +
        profileEntries.map(([k, v]) => `- ${k}: ${v}`).join('\n'),
    )
  }

  // Memory auto-extracted from conversations
  if (memory.facts.length) sections.push('## Learned from conversation\n- ' + memory.facts.join('\n- '))
  if (memory.preferences.length)
    sections.push('## Preferences and communication style\n- ' + memory.preferences.join('\n- '))
  if (memory.ongoing_topics.length)
    sections.push('## Ongoing topics\n- ' + memory.ongoing_topics.join('\n- '))

  if (!sections.length) return ''
  return '\n\n# What I know about you\n' + sections.join('\n\n')
}

async function summarizePending(apiKey: string | undefined): Promise<void> {
  if (summarizing) return
  if (!apiKey) {
    console.warn('[memory] Skipping summarization: GEMINI_API_KEY is not set')
    return
  }
  summarizing = true
  try {
    const targets = await pendingSummarySessions(activeSessionId)
    for (const session of targets) {
      try {
        const transcripts = await readSessionTranscripts(session)
        const existing = await loadMemory()
        const updated = await summarize(existing, transcripts, apiKey)
        await saveMemory(updated)
        await markSummarized(session.id)
        console.log('[memory] Summarization complete:', session.id, `(${transcripts.length} entries)`)
      } catch (err) {
        // Failure in one session does not block the next; it will be picked up again on next startup
        console.error('[memory] Summarization failed:', session.id, err)
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
  console.log('[memory] Session started:', activeSessionId)

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
    console.log('[memory] Profile updated:', key, '=', value)
    return { ok: true, items: profile.items }
  })

  ipcMain.handle('memory:delete-profile', async (_event, key: string) => {
    const profile = await deleteProfileItem(key)
    console.log('[memory] Profile item deleted:', key)
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
    }).catch((err) => console.error('[memory] Failed to append transcript:', err))
  })
}

// Call on app exit. Only stamps endedAt.
// Summarization is deferred to next startup (before-quit cannot be awaited reliably).
export async function shutdownMemory(): Promise<void> {
  if (!activeSessionId) return
  try {
    await endSession(activeSessionId)
    console.log('[memory] Session ended:', activeSessionId)
  } catch (err) {
    console.error('[memory] Failed to end session:', err)
  }
  activeSessionId = null
}

export function getActiveSessionId(): string | null {
  return activeSessionId
}

// Exported for testing/debugging
export { loadMemory, loadSessions }
