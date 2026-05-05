import type { Memory, MemoryItem, SessionSummary } from './store'

import { MODELS } from '../../config/models'

const MODEL = MODELS.geminiMemorySummarizer

const CURATOR_PROMPT = `You are the memory curator for the AI assistant "Vega".
Given the existing memory and recent conversation transcripts, return an updated memory JSON containing only information that will still be useful three months from now.

【Strict categories — if something does not fit, do not include it】

facts: Persistent attributes about the user
  ✓ Include: name, affiliation, occupation, area of expertise, regularly used tools, family structure, purpose of contact accounts
    Example: "U-NEXT email address is rayrayo8855@gmail.com"
  ✗ Exclude:
    - Transient states such as screen layout or window arrangement
    - Temporary situations like "Gmail auth expired" that resolve quickly
    - One-off notifications or events

preferences: Instructions for how Vega should behave
  ✓ Include: interaction and behavioral guidelines like "be casual", "keep answers short", "summarize emails each morning"
    Preferences the user has shown explicitly or implicitly over time
  ✗ Exclude:
    - Tasks the user completed or things they checked (those are activity logs, not preferences)
    - Tool names by themselves ("checked Gmail inbox" is not a preference)

ongoing_topics: Interests or concerns spanning days to weeks
  ✓ Include: ongoing projects, unresolved issues, recurring themes
  ✗ Exclude:
    - Individual email subjects or senders (e.g. "email from United Airlines")
    - One-time checks or operations
    - Work already completed

【importance score for each item】
Each item in facts, preferences, ongoing_topics must have an importance score (1-3):
  3 = high: core identity info, always-apply preferences, long-running critical topics
  2 = medium: useful context, moderate preferences, ongoing topics
  1 = low: nice-to-know, weakly recurring, may fade soon

【session_summary】
A 2-4 sentence Japanese summary of this session's content.
  ✓ Include: what was discussed, what actions were taken, what is unresolved or should be remembered next time
  ✓ Use natural Japanese that Vega can read to quickly regain context
  If nothing meaningful happened (e.g. empty session), output an empty string.

【Handling existing memory】
Remove any existing entry that does not meet the above criteria — think "rebuild", not "merge".
Apply the same criteria to information from new conversations.
Re-evaluate importance scores for retained items based on recency and recurrence.

【Output】
Strict JSON only. No preamble, no code fences, no comments.
{
  "facts": [{"text": "...", "importance": 3}],
  "preferences": [{"text": "...", "importance": 2}],
  "ongoing_topics": [{"text": "...", "importance": 2}],
  "session_summary": "..."
}

Maximum 20 items per list. Write text concisely in Japanese (~40 characters per item).
When in doubt, leave it out. Empty lists are fine.`

type GenAIClient = {
  models: {
    generateContent: (opts: {
      model: string
      contents: string
      config?: { responseMimeType?: string; systemInstruction?: string }
    }) => Promise<{ text?: string }>
  }
}

function buildUserPayload(
  existing: Memory,
  transcripts: { role: 'user' | 'assistant'; text: string; ts: string }[],
): string {
  const existingJson = JSON.stringify(
    {
      facts: existing.facts.map((f) => ({ text: f.text, importance: f.importance })),
      preferences: existing.preferences.map((f) => ({ text: f.text, importance: f.importance })),
      ongoing_topics: existing.ongoing_topics.map((f) => ({ text: f.text, importance: f.importance })),
    },
    null,
    2,
  )
  // Gemini Live sends transcription in small fragments; merge consecutive same-role entries into one turn
  const merged: { role: 'user' | 'assistant'; text: string }[] = []
  for (const t of transcripts) {
    const last = merged[merged.length - 1]
    if (last && last.role === t.role) last.text += t.text
    else merged.push({ role: t.role, text: t.text })
  }
  const lines = merged.map((t) => `[${t.role}] ${t.text}`).join('\n')
  return `# Existing Memory\n${existingJson}\n\n# Recent Conversation Transcript\n${lines}`
}

type SummarizerResponse = Partial<Memory> & { session_summary?: unknown }

function tryParseMemory(text: string): SummarizerResponse | null {
  // Strip ```json ... ``` fences in case the model wraps the response
  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
  try {
    const parsed = JSON.parse(stripped)
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed as SummarizerResponse
  } catch {
    return null
  }
}

const SESSION_SUMMARIES_MAX = 10
const ITEMS_MAX = 20

function clampItems(arr: unknown, today: string, max = ITEMS_MAX): MemoryItem[] {
  if (!Array.isArray(arr)) return []
  return arr
    .filter((x): x is { text: string; importance: unknown } => typeof x === 'object' && x !== null && typeof (x as { text?: unknown }).text === 'string')
    .map((x) => ({
      text: x.text as string,
      importance: ([1, 2, 3].includes(x.importance as number) ? x.importance : 2) as 1 | 2 | 3,
      lastSeen: today,
    }))
    .slice(0, max)
}

export async function summarize(
  existing: Memory,
  transcripts: { role: 'user' | 'assistant'; text: string; ts: string }[],
  apiKey: string,
  sessionId: string,
): Promise<Memory> {
  if (transcripts.length === 0) {
    return existing
  }

  const { GoogleGenAI } = (await import('@google/genai')) as unknown as {
    GoogleGenAI: new (opts: { apiKey: string }) => GenAIClient
  }
  const ai = new GoogleGenAI({ apiKey })

  const res = await ai.models.generateContent({
    model: MODEL,
    contents: buildUserPayload(existing, transcripts),
    config: {
      responseMimeType: 'application/json',
      systemInstruction: CURATOR_PROMPT,
    },
  })

  const text = res.text ?? ''
  const parsed = tryParseMemory(text)
  if (!parsed) {
    throw new Error(`Failed to parse summarizer JSON response: ${text.slice(0, 200)}`)
  }

  const today = new Date().toISOString().slice(0, 10)

  const newSummary: SessionSummary | null =
    typeof parsed.session_summary === 'string' && parsed.session_summary.trim()
      ? { sessionId, date: today, summary: parsed.session_summary.trim() }
      : null

  const updatedSummaries = newSummary
    ? [newSummary, ...existing.session_summaries].slice(0, SESSION_SUMMARIES_MAX)
    : existing.session_summaries

  return {
    facts: clampItems(parsed.facts, today),
    preferences: clampItems(parsed.preferences, today),
    ongoing_topics: clampItems(parsed.ongoing_topics, today),
    procedures: existing.procedures,
    session_summaries: updatedSummaries,
    updatedAt: new Date().toISOString(),
  }
}
