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

  // 明示的に登録されたパーソナル情報（profile.json）
  const profile = await loadProfile()
  const profileEntries = Object.entries(profile.items)
  if (profileEntries.length) {
    sections.push(
      '## ユーザーのパーソナル情報（確定事項）\n' +
        profileEntries.map(([k, v]) => `- ${k}: ${v}`).join('\n'),
    )
  }

  // 会話から自動抽出した記憶
  if (memory.facts.length) sections.push('## 会話から覚えたこと\n- ' + memory.facts.join('\n- '))
  if (memory.preferences.length)
    sections.push('## 好み・話し方の指針\n- ' + memory.preferences.join('\n- '))
  if (memory.ongoing_topics.length)
    sections.push('## 進行中の話題\n- ' + memory.ongoing_topics.join('\n- '))

  if (!sections.length) return ''
  return '\n\n# 俺が知っているお前のこと\n' + sections.join('\n\n')
}

async function summarizePending(apiKey: string | undefined): Promise<void> {
  if (summarizing) return
  if (!apiKey) {
    console.warn('[memory] GEMINI_API_KEY 未設定のため要約スキップ')
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
        console.log('[memory] 要約完了:', session.id, `(${transcripts.length}件)`)
      } catch (err) {
        // 1つのセッションで失敗しても次に進む。次回起動時にまた拾われる
        console.error('[memory] 要約失敗:', session.id, err)
      }
    }
  } finally {
    summarizing = false
  }
}

export async function initMemory(getApiKey: () => string | undefined): Promise<void> {
  // 1. 起動時に新しいセッションを開始
  activeSessionId = newSessionId()
  await startSession(activeSessionId)
  console.log('[memory] セッション開始:', activeSessionId)

  // 2. 前回までの未完了セッションを救済（endedAt 埋める）
  await repairCrashedSessions(activeSessionId)

  // 3. 未要約のセッションを非同期でバックグラウンド処理
  //    ここは await しない。アプリ本体の起動をブロックしないため
  void summarizePending(getApiKey())

  // 4. IPC ハンドラ登録
  ipcMain.handle('memory:get-injection', async () => {
    const memory = await loadMemory()
    return buildInjection(memory)
  })

  ipcMain.handle('memory:upsert-profile', async (_event, key: string, value: string) => {
    const profile = await upsertProfileItem(key, value)
    console.log('[memory] プロファイル更新:', key, '=', value)
    return { ok: true, items: profile.items }
  })

  ipcMain.handle('memory:delete-profile', async (_event, key: string) => {
    const profile = await deleteProfileItem(key)
    console.log('[memory] プロファイル削除:', key)
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
    }).catch((err) => console.error('[memory] 転写追記失敗:', err))
  })
}

// アプリ終了時に呼ぶ。endedAt を打刻するだけ。
// 要約は次回起動時にやる（before-quit を await できないので確実性を優先）
export async function shutdownMemory(): Promise<void> {
  if (!activeSessionId) return
  try {
    await endSession(activeSessionId)
    console.log('[memory] セッション終了:', activeSessionId)
  } catch (err) {
    console.error('[memory] セッション終了処理失敗:', err)
  }
  activeSessionId = null
}

export function getActiveSessionId(): string | null {
  return activeSessionId
}

// テスト/デバッグ用に export しておく
export { loadMemory, loadSessions }
