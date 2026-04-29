import type { Memory } from './store'

const MODEL = 'gemini-2.5-flash-lite'

const CURATOR_PROMPT = `あなたはAI秘書「ベガ」のメモリキュレーターだ。
既存メモリ + 直近の会話転写から、3か月後でも役に立つ情報だけを残した最新メモリをJSONで返せ。

【厳格な区分（外れたら絶対に入れない）】

facts: ユーザーに関する持続的な属性
  ✓ 入れる: 名前・所属・職業・専門分野・常用ツール・家族構成・連絡先アカウントの用途分け
    例: 「U-NEXT用アドレスは rayrayo8855@gmail.com」
  ✗ 入れない:
    - 画面表示・ウィンドウ配置などの一時的な状態
    - 「Gmail認証が切れてる」のようにすぐ解決する状況
    - 一回きりの通知やイベント

preferences: ベガに対する振る舞いの指定
  ✓ 入れる: 「タメ口で」「短く答えろ」「メール確認は朝にまとめて報告」などの対話・行動の指針
    対話を重ねるうちにユーザーが明示的・暗黙的に示した好み
  ✗ 入れない:
    - ユーザーがやったタスクや確認内容（それは preferences ではなく行動ログ）
    - ツール名そのもの（「Gmailインボックスを確認」などは preference ではない）

ongoing_topics: 数日〜数週間スパンで継続している関心事
  ✓ 入れる: 進行中のプロジェクト・未解決の問題・繰り返し出てくるテーマ
  ✗ 入れない:
    - 個別メールの件名や送信元（「ユナイテッド航空のメール」など）
    - 1回限りの確認・操作
    - 既に完了した作業

【既存メモリの扱い】
上の基準を満たさない既存項目は容赦なく削除する。"merge" ではなく "rebuild" の意識で。
新しい会話で得た情報も同じ基準で取捨選択する。

【出力】
厳密なJSONのみ。前置き・コードフェンス・コメント禁止。
{
  "facts": ["..."],
  "preferences": ["..."],
  "ongoing_topics": ["..."]
}

各リスト最大10項目。日本語で簡潔に（1項目1行・40字以内目安）。
迷ったら入れない。空リストでも構わない。`

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
  // Gemini Live は転写を細切れで送ってくるので、連続した同 role を1ターンにまとめる
  const merged: { role: 'user' | 'assistant'; text: string }[] = []
  for (const t of transcripts) {
    const last = merged[merged.length - 1]
    if (last && last.role === t.role) last.text += t.text
    else merged.push({ role: t.role, text: t.text })
  }
  const lines = merged.map((t) => `[${t.role}] ${t.text}`).join('\n')
  return `# 既存メモリ\n${existingJson}\n\n# 直近の会話転写\n${lines}`
}

function tryParseMemory(text: string): Partial<Memory> | null {
  // モデルが ```json ...``` で返してきた場合を一応剥がす
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
    // 会話が無いセッション（即落ちなど）は既存メモリをそのまま返す
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
    throw new Error(`要約結果のJSONパースに失敗: ${text.slice(0, 200)}`)
  }

  return {
    facts: clamp(parsed.facts),
    preferences: clamp(parsed.preferences),
    ongoing_topics: clamp(parsed.ongoing_topics),
    updatedAt: new Date().toISOString(),
  }
}
