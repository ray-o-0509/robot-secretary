import type { Memory } from './store'

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

【Handling existing memory】
Remove any existing entry that does not meet the above criteria — think "rebuild", not "merge".
Apply the same criteria to information from new conversations.

【Output】
Strict JSON only. No preamble, no code fences, no comments.
{
  "facts": ["..."],
  "preferences": ["..."],
  "ongoing_topics": ["..."]
}

Maximum 10 items per list. Write concisely in Japanese (one item per line, ~40 characters).
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
      facts: existing.facts,
      preferences: existing.preferences,
      ongoing_topics: existing.ongoing_topics,
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

function tryParseMemory(text: string): Partial<Memory> | null {
  // Strip ```json ... ``` fences in case the model wraps the response
  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
  try {
    const parsed = JSON.parse(stripped)
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed as Partial<Memory>
  } catch {
    return null
  }
}

function clamp(arr: unknown, max = 10): string[] {
  if (!Array.isArray(arr)) return []
  return arr.filter((x): x is string => typeof x === 'string').slice(0, max)
}

export async function summarize(
  existing: Memory,
  transcripts: { role: 'user' | 'assistant'; text: string; ts: string }[],
  apiKey: string,
): Promise<Memory> {
  if (transcripts.length === 0) {
    // Sessions with no conversation (e.g. immediate crash) — return existing memory as-is
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

  return {
    facts: clamp(parsed.facts),
    preferences: clamp(parsed.preferences),
    ongoing_topics: clamp(parsed.ongoing_topics),
    procedures: existing.procedures,
    updatedAt: new Date().toISOString(),
  }
}
