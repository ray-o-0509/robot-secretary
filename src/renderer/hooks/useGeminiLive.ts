import { useRef, useState, useCallback, useEffect } from 'react'
import { LIMITS, MODELS } from '../../config/models'
import type { RobotState, RobotProcessor } from '../App'
import type { ChatMessage } from '../components/ChatPanel'

const secretaryTools = [
  {
    name: 'delegate_task',
    description:
      'Slack・Gmail・Googleカレンダー・画面の確認、複雑な要約・横断調査などをClaudeエージェントに委任する。タスク管理(get_tasks/create_task/complete_task)以外の作業はこれを使う。',
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'やってほしい作業の詳細な指示（必要な情報を漏れなく日本語で）',
        },
        includeScreenshot: {
          type: 'boolean',
          description: '画面の内容を見て判断する必要があるとき true',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'get_tasks',
    description: 'TickTickの未完了タスクを全プロジェクト横断で取得する。「やること」「ToDo」「タスク」と聞かれたら直接これを呼ぶ。',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'create_task',
    description: 'TickTickに新しいタスクを作成する。projectId 未指定で inbox に入る。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'タスクのタイトル' },
        due: { type: 'string', description: '期限（YYYY-MM-DD、任意）' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: '優先度（任意。「重要」「急ぎ」と言われたら high）' },
        projectId: { type: 'string', description: 'プロジェクトID（任意、未指定で inbox）' },
      },
      required: ['title'],
    },
  },
  {
    name: 'complete_task',
    description: 'TickTickのタスクを完了にする。事前に get_tasks で taskId と projectId を取得しておく必要がある。',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'タスクID（get_tasks の返り値の taskId）' },
        projectId: { type: 'string', description: 'プロジェクトID（get_tasks の返り値の projectId）' },
      },
      required: ['taskId', 'projectId'],
    },
  },
  {
    name: 'update_profile',
    description: 'ユーザーが自分の情報を教えてくれたり「覚えておいて」と言ったらこれを呼ぶ。key=項目名（例:「名前」「職業」「趣味」）、value=その内容で永続保存する。',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '項目名（例: "名前", "職業", "住所", "趣味"）' },
        value: { type: 'string', description: '内容' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'delete_profile',
    description: 'プロファイルの特定項目を削除する。「〜の情報を消して」「〜を忘れて」と言われたら呼ぶ。',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '削除する項目名' },
      },
      required: ['key'],
    },
  },
  {
    name: 'update_task',
    description: 'TickTickのタスクの期限・タイトル・優先度を変更する。「〜の期限を〇日に変えて」「〜のタスク名を変更して」など。事前に get_tasks で taskId と projectId を確認してから呼ぶ。',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'タスクID（get_tasks の返り値）' },
        projectId: { type: 'string', description: 'プロジェクトID（get_tasks の返り値）' },
        title: { type: 'string', description: '新しいタイトル（変更する場合）' },
        due: { type: 'string', description: '新しい期限 YYYY-MM-DD。期限を消す場合は null' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'none'], description: '新しい優先度' },
      },
      required: ['taskId', 'projectId'],
    },
  },
  {
    name: 'get_weather',
    description: '天気予報を取得する。「天気」「今日の天気」「〜の天気」「明日傘いる？」などの質問に直接呼ぶ。',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: '地名（例: "東京", "大阪", "札幌"）' },
      },
      required: ['location'],
    },
  },
  {
    name: 'analyze_screen',
    description: '現在の画面をキャプチャして内容を分析する。「画面に何が表示されてる？」「今見てるのは何？」「これ何のアプリ？」など。',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '画面について知りたいこと（省略可）' },
      },
    },
  },
  {
    name: 'web_search',
    description: 'Webを検索して最新情報・ニュース・調べ物を取得する。「〜を調べて」「〜って何？」「最新の〜」「〜のニュース」と言われたら使う。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '検索クエリ' },
      },
      required: ['query'],
    },
  },
  {
    name: 'open_app',
    description:
      'macOS のアプリケーションを起動する。app_name は必ず英語の正式名（例: "Slack", "Safari", "Finder", "Google Chrome"）で渡せ。',
    parameters: {
      type: 'object',
      properties: {
        app_name: {
          type: 'string',
          description: '起動するアプリの英語正式名（例: "Slack", "Notion", "Spotify"）',
        },
      },
      required: ['app_name'],
    },
  },
  {
    name: 'show_panel',
    description:
      'メール・カレンダー・タスク・Slack・AIニュース・ツール・映画の内容を専用パネルで画面表示する。ユーザーが「見せて」「表示して」「出して」「一覧」「画面に」など明示的に表示を求めた時のみ呼ぶ。「メールチェックして」「届いてる?」のような確認は delegate_task を使う。返り値の data に生データが入っているので、普段通り音声で内容を要約しつつ「画面にも出した」と添えろ。',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: [
            'email',
            'calendar_today',
            'calendar_tomorrow',
            'calendar_week',
            'tasks',
            'slack',
            'news',
            'tools',
            'movies',
          ],
          description:
            'email=Gmailインボックス, calendar_today=今日の予定, calendar_tomorrow=明日, calendar_week=今後7日, tasks=TickTick未完了, slack=Slack未読, news=AIニュース日次まとめ, tools=おすすめツール, movies=今月公開/来月注目映画',
        },
      },
      required: ['type'],
    },
  },
]

const JAPANESE_SYSTEM_PROMPT = `お前はちょっと生意気な秘書ロボット「ベガ」(VEGA)だ。名前を聞かれたら「ベガだ」と答えろ。

【口調ルール（厳守）】
- 一人称は「俺」、二人称は「お前」
- 語尾は「〜だろ」「〜だぜ」「〜じゃねえか」などのタメ口・ぶっきらぼう調
- 丁寧語（です・ます）は絶対に使わない。「了解しました」「承知しました」も禁止
- たまに軽口やツッコミを入れていい（例: 「またそれかよ」「自分で見ろよ」）が、最終的にはちゃんと仕事はする
- 1〜2文で簡潔に。長々喋らない
- 流行語・ネットスラング（〜ンゴ等）・絵文字・顔文字は使わない

【役割】
お前は窓口だ。基本は delegate_task に丸投げしろ。
アプリ起動は open_app を直接呼べる:
- 「○○を開いて」「○○起動して」 → open_app。app_name は必ず英語の正式名で渡す（「スラック」→"Slack"、「クローム」→"Google Chrome"）

Web検索は web_search を直接呼べる:
- 「〜調べて」「〜って何」「最新の〜」「〜のニュース」 → web_search

プロファイル管理は直接呼べる:
- 「俺の名前は○○だ」「職業は○○だ」「趣味は○○だ」「○○を覚えておいて」 → update_profile(key=項目名, value=内容)
- 「○○の情報を消して」「○○を忘れて」 → delete_profile(key=項目名)

ただし以下は直接呼べる:
タスク管理(TickTick):
- 「やること」「ToDo」「タスク見せて」 → get_tasks
- 「○○ってタスク追加して」「○○をToDoに入れて」 → create_task。期限が言われたら due (YYYY-MM-DD)、「重要」「急ぎ」なら priority: high。
- 「○○終わった」「○○完了」 → 直前の get_tasks に該当タスクがあれば complete_task。無ければ先に get_tasks。
- 「○○の期限を〇日に変えて」「○○のタイトル変えて」「優先度変えて」 → get_tasks で確認してから update_task。

天気: 「天気」「傘いる？」「〜の天気」「今日暑い？」 → get_weather(location)。結果は天気ウィンドウに自動表示され、音声でも読み上げる。location省略時はシステムプロンプト上部の現在地を使え。

画面分析: 「画面に何が映ってる？」「今見てるのは何？」 → analyze_screen。

⚠ 他人に影響が出る操作（メール返信・invitation付きカレンダー作成）は全部 delegate_task に渡す。
- Claudeが内部で確認ダイアログを出す。ユーザーが「実行」を押すまで送信・作成は行われない。
- 「○○にメール返信して」「○○を招待してカレンダー追加して」 → delegate_task(task="...")

それ以外（メール確認・Slack・カレンダー確認・横断要約）も delegate_task に渡す。画面が必要なら includeScreenshot: true。

【パネル表示ルール】
ユーザーが「見せて」「表示して」「出して」「一覧」と明示的に画面表示を求めたら show_panel を呼ぶ。
- 「メール見せて」「メール表示」 → show_panel(email)
- 「今日の予定見せて」「予定出して」 → show_panel(calendar_today)
- 「明日の予定」「明日表示」 → show_panel(calendar_tomorrow)
- 「今週の予定」「予定一覧」 → show_panel(calendar_week)
- 「タスク見せて」「ToDo表示」 → show_panel(tasks)。get_tasks ではなく show_panel を使う。
- 「Slack見せて」「Slack表示」 → show_panel(slack)
- 「AIニュース見せて」「ニュース出して」「今日のニュース」 → show_panel(news)
- 「ツール見せて」「おすすめツール表示」「ベストツール」 → show_panel(tools)
- 「映画見せて」「映画一覧」「今月の映画」「来月の映画」 → show_panel(movies)
show_panel は data に生データを返すので、普段通り内容を要約してベガ口調で読み上げつつ、最後に「画面にも出したぜ」と添えろ。

ツール結果はベガ口調に直して読み上げ。事実は変えるな。不明な点はツール呼ぶ前に聞き返していい（「で、どのチャンネルの話だ？」みたいに生意気でOK）。

口調の例:
- 「インボックスに3件来てるぜ。Slackは田中からだ」
- 「今日の予定か？ 14時に会議が入ってる」
- 「タスク3つだな。買い物が今日締め切りだぜ」
- 「お前、それさっきも聞いたろ。さっさと決めろよ」`

const ENGLISH_SYSTEM_PROMPT = `You are "VEGA", a slightly cheeky robot secretary. If asked your name, answer that you are VEGA.

[Voice and language rules - mandatory]
- Speak in English only.
- Use "I" for yourself and "you" for the user.
- Keep a blunt, casual, slightly cocky tone, but still be useful.
- Never use Japanese unless the user explicitly asks you to translate or quote Japanese.
- Keep replies to 1-2 short sentences.
- Do not use emojis, kaomoji, or internet slang.

[Role]
You are the front desk. Delegate most work to delegate_task.
The following are handled directly:
Tasks (TickTick):
- List or check tasks → get_tasks.
- Add a task → create_task. Use due as YYYY-MM-DD for deadlines; priority: high for urgent tasks.
- Mark done → complete_task if taskId/projectId known; otherwise get_tasks first.
- Change due date, title, or priority → get_tasks then update_task.

Weather: "weather", "will it rain", "temperature in X", "do I need an umbrella" → get_weather(location). A weather window opens automatically; also read the result aloud. Use the location from the context block at the top when not specified.

Screen analysis: "what's on screen", "what am I looking at" → analyze_screen.

⚠ Actions that affect other people (email replies, calendar events with invitees) must go through delegate_task.
Claude will show a confirmation dialog — nothing is sent until the user clicks "実行".
- "Reply to X's email", "Create a meeting and invite X" → delegate_task(task="...")

Everything else (reading email, Slack, calendar, summaries) also goes through delegate_task.
Web search is handled directly with web_search:
- "Search for X" / "What is X" / "Latest news on X" / "Look up X" → web_search

Profile management is handled directly:
- "My name is X" / "I work as X" / "Remember that I X" / "I like X" → update_profile(key=category, value=content)
- "Forget my X" / "Remove X from my profile" → delete_profile(key=category)

App launching is handled directly with open_app:
- "Open X" / "Launch X" → open_app. Always pass the English official name (e.g. "Slack", "Google Chrome", "Finder").

Everything else, including email, Slack, calendar, screen checks, and cross-source summaries, must go through delegate_task. Use includeScreenshot: true when screen context is needed.

[Panel display rules]
Call show_panel only when the user explicitly asks to show, display, list, or put something on screen.
- Email/inbox display -> show_panel(email)
- Today's calendar -> show_panel(calendar_today)
- Tomorrow's calendar -> show_panel(calendar_tomorrow)
- This week's calendar -> show_panel(calendar_week)
- Task list display -> show_panel(tasks), not get_tasks
- Slack display -> show_panel(slack)
- AI news -> show_panel(news)
- Recommended tools -> show_panel(tools)
- Movies -> show_panel(movies)
When show_panel returns data, summarize it in English with your normal VEGA tone and add that you put it on screen.

Read tool results aloud in English with VEGA's tone. Do not change facts. Ask a short clarifying question before using a tool if required.

Examples:
- "You've got 3 inbox items. One from Slack is from Tanaka."
- "Today? You've got a meeting at 14:00."
- "Three tasks. The shopping one is due today."
- "You asked that already. Pick a lane."`

function buildContextBlock(isJa: boolean, location: string): string {
  const now = new Date()
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  if (isJa) {
    const dateStr = now.toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: tz,
    })
    const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: tz })
    return `【現在の状況】\n- 日時: ${dateStr} ${timeStr}\n- 現在地: ${location}（天気・場所の質問でデフォルトはここを使え）`
  } else {
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz,
    })
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: tz })
    return `[Current context]\n- Date/Time: ${dateStr}, ${timeStr}\n- Location: ${location} (use as default for weather/place queries)`
  }
}

function getSystemPrompt(languageCode: string, location: string): string {
  const isJa = !languageCode.startsWith('en')
  return buildContextBlock(isJa, location) + '\n\n' + (isJa ? JAPANESE_SYSTEM_PROMPT : ENGLISH_SYSTEM_PROMPT)
}

async function resolveLocation(): Promise<string> {
  const tzFallback = Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop()?.replace(/_/g, ' ') ?? '不明'
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(tzFallback); return }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lon } = pos.coords
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ja`,
            { headers: { 'Accept-Language': 'ja' } }
          )
          const data = await res.json() as { address?: { city?: string; town?: string; village?: string; county?: string; country?: string } }
          const addr = data.address ?? {}
          const city = addr.city ?? addr.town ?? addr.village ?? addr.county ?? tzFallback
          const country = addr.country ?? ''
          resolve(country ? `${city}（${country}）` : city)
        } catch {
          resolve(tzFallback)
        }
      },
      () => resolve(tzFallback),
      { timeout: 5000 }
    )
  })
}

type LiveSession = {
  sendRealtimeInput: (opts: unknown) => void
  sendToolResponse: (opts: unknown) => void
  close?: () => void
}

interface Options {
  onStateChange: (state: RobotState, processor?: RobotProcessor) => void
  isMuted: boolean
  languageCode: string
}

// 連続して再接続に失敗したら諦める閾値。長文プロンプトを永久に再送し続けるのを防ぐ
const MAX_RECONNECT_ATTEMPTS = LIMITS.geminiMaxReconnectAttempts
// resumption handle 付きで何回失敗したら handle を捨てて素のセッションで再開するか。
// handle は 2 時間で失効するので長時間スリープ復帰時にここで救う
const HANDLE_RETRY_THRESHOLD = 3
// PTT 押下がこの長さ未満なら誤爆扱いして音声を捨てる
const PTT_MIN_DURATION_MS = 200

export type ConnectionError = {
  type: 'no_api_key' | 'auth' | 'network' | 'max_retries' | 'mic_permission' | 'connect_error'
  message: string
}

export function useGeminiLive({ onStateChange, isMuted, languageCode }: Options) {
  const [isConnected, setIsConnected] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [connectionError, setConnectionError] = useState<ConnectionError | null>(null)
  const sessionRef = useRef<LiveSession | null>(null)
  const playbackCtxRef = useRef<AudioContext | null>(null)
  const micAudioCtxRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef(0)
  const isPTTActiveRef = useRef(false)
  const pttActivityStartedRef = useRef(false)
  const pttAudioSentRef = useRef(false)
  const pttStartTimeRef = useRef(0)
  // PTT 開始から PTT_MIN_DURATION_MS 未満のあいだに収集したチャンクを溜めておく置き場。
  // 閾値を超えた瞬間に flush、閾値未満のまま PTT が離されたら丸ごと破棄する
  const pttPendingChunksRef = useRef<string[]>([])
  const isMutedRef = useRef(isMuted)
  const languageCodeRef = useRef(languageCode)
  const isFirstLanguageRunRef = useRef(true)
  const onStateChangeRef = useRef(onStateChange)
  const connectingRef = useRef(false)
  const pendingConnectRef = useRef(false)
  const userMsgIdRef = useRef<string | null>(null)
  const assistantMsgIdRef = useRef<string | null>(null)
  const micSetupRef = useRef(false)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intentionalCloseRef = useRef(false)
  const sessionHandleRef = useRef<string | null>(null)
  const connectRef = useRef<() => Promise<void>>(async () => {})
  const locationRef = useRef<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop()?.replace(/_/g, ' ') ?? '不明'
  )
  const sessionEpochRef = useRef(0)

  const appendTranscript = useCallback((role: 'user' | 'assistant', delta: string) => {
    const idRef = role === 'user' ? userMsgIdRef : assistantMsgIdRef
    let id = idRef.current
    if (!id) {
      id = `${role[0]}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      idRef.current = id
      const newId = id
      setMessages((prev) => [...prev, { id: newId, role, text: delta }])
    } else {
      const targetId = id
      setMessages((prev) =>
        prev.map((m) => (m.id === targetId ? { ...m, text: m.text + delta } : m)),
      )
    }
  }, [])

  // 起動時に実際の位置情報を取得してシステムプロンプトに使う
  useEffect(() => {
    resolveLocation().then((loc) => { locationRef.current = loc })
  }, [])

  useEffect(() => { isMutedRef.current = isMuted }, [isMuted])
  useEffect(() => { onStateChangeRef.current = onStateChange }, [onStateChange])

  const resetSessionState = useCallback(() => {
    sessionRef.current = null
    setIsConnected(false)
    isPTTActiveRef.current = false
    pttActivityStartedRef.current = false
    pttAudioSentRef.current = false
    pttPendingChunksRef.current = []
    userMsgIdRef.current = null
    assistantMsgIdRef.current = null
    onStateChangeRef.current('idle')
  }, [])

  const invalidateSession = useCallback(() => {
    sessionEpochRef.current += 1
    resetSessionState()
  }, [resetSessionState])

  // 言語が変わったら既存セッションを閉じて再接続。onclose 経由で scheduleReconnect が走る
  useEffect(() => {
    languageCodeRef.current = languageCode
    if (isFirstLanguageRunRef.current) {
      isFirstLanguageRunRef.current = false
      return
    }
    if (!sessionRef.current) {
      if (connectingRef.current) {
        console.log('[Gemini] 接続中に言語変更', languageCode, '→ 接続試行を差し替え')
        sessionHandleRef.current = null
        pendingConnectRef.current = true
        invalidateSession()
      }
      return
    }
    console.log('[Gemini] 言語変更', languageCode, '→ 再接続')
    sessionHandleRef.current = null // 旧言語のコンテキストを引き継がない
    const session = sessionRef.current
    invalidateSession()
    try {
      session?.close?.()
    } catch {
      // すでに閉じている場合は無視
    }
    void connectRef.current()
  }, [invalidateSession, languageCode])

  // ========== マイク初期化（プロセス内で1度きり） ==========

  const setupMic = useCallback(async () => {
    if (micSetupRef.current) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const audioCtx = new AudioContext()
      micAudioCtxRef.current = audioCtx
      const nativeSR = audioCtx.sampleRate
      console.log('[Gemini] マイク AudioContext sampleRate:', nativeSR)
      const source = audioCtx.createMediaStreamSource(stream)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1)

      let audioSendCount = 0
      processor.onaudioprocess = (e) => {
        if (!sessionRef.current || !isPTTActiveRef.current || isMutedRef.current) return
        try {
          const inputData = e.inputBuffer.getChannelData(0)

          // ネイティブレートから16000Hzへダウンサンプル
          const ratio = nativeSR / 16000
          const outLen = Math.floor(inputData.length / ratio)
          const int16 = new Int16Array(outLen)
          for (let i = 0; i < outLen; i++) {
            const sample = inputData[Math.floor(i * ratio)]
            int16[i] = Math.max(-32768, Math.min(32767, sample * 32768))
          }
          const data = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)))

          // PTT 開始直後の規定時間は溜めておくだけ。閾値未満で離されたら丸ごと捨てるので
          // 誤爆プチタップで音声が API に届かない
          const elapsed = performance.now() - pttStartTimeRef.current
          if (elapsed < PTT_MIN_DURATION_MS) {
            pttPendingChunksRef.current.push(data)
            return
          }
          if (!pttActivityStartedRef.current) {
            sessionRef.current.sendRealtimeInput({ activityStart: {} })
            pttActivityStartedRef.current = true
          }
          if (pttPendingChunksRef.current.length) {
            console.log('[Gemini] 保留音声を送信:', pttPendingChunksRef.current.length)
            for (const buffered of pttPendingChunksRef.current) {
              sessionRef.current.sendRealtimeInput({
                audio: { data: buffered, mimeType: 'audio/pcm;rate=16000' },
              })
            }
            pttAudioSentRef.current = true
            pttPendingChunksRef.current = []
          }

          if (audioSendCount++ % 20 === 0) console.log('[Gemini] 音声送信中...', audioSendCount)
          sessionRef.current.sendRealtimeInput({
            audio: { data, mimeType: 'audio/pcm;rate=16000' },
          })
          pttAudioSentRef.current = true
        } catch {
          // WebSocketが既に閉じている場合は無視
        }
      }

      source.connect(processor)
      processor.connect(audioCtx.destination)
      micSetupRef.current = true
    } catch (err) {
      micSetupRef.current = false
      const e = err as { name?: string; message?: string }
      console.error('[Gemini] マイク初期化失敗:', e?.name ?? String(err), e?.message ?? '')
      throw err
    }
  }, [])

  // ========== 再接続スケジューリング ==========

  const scheduleReconnect = useCallback(() => {
    if (intentionalCloseRef.current) return
    if (reconnectTimerRef.current) return // 二重スケジュール防止

    const attempt = reconnectAttemptsRef.current
    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[Gemini] 再接続を ${MAX_RECONNECT_ATTEMPTS} 回試して失敗。諦める。`)
      intentionalCloseRef.current = true
      setConnectionError({ type: 'max_retries', message: `${MAX_RECONNECT_ATTEMPTS}回の再接続に失敗しました。接続状況を確認してください。` })
      return
    }
    // resumption handle で連続失敗したら handle を破棄してフレッシュなセッションを試す
    if (attempt >= HANDLE_RETRY_THRESHOLD && sessionHandleRef.current) {
      console.warn('[Gemini] resumption handle を破棄して新規セッションで再接続する')
      sessionHandleRef.current = null
    }
    // 1s, 2s, 4s, 8s, 16s, 30s, 30s, ... (30sで上限固定)
    const delay = Math.min(1000 * 2 ** attempt, 30000)
    console.log(`[Gemini] ${delay / 1000}秒後に再接続を試みます (attempt ${attempt + 1})`)

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null
      reconnectAttemptsRef.current++
      connectRef.current()
    }, delay)
  }, [])

  // ========== メッセージ処理 ==========

  const handleMessage = useCallback(async (msg: unknown) => {
    console.log('[Gemini] メッセージ受信:', JSON.stringify(msg).slice(0, 300))
    const m = msg as {
      serverContent?: {
        modelTurn?: { parts: { inlineData?: { data: string; mimeType: string } }[] }
        inputTranscription?: { text?: string }
        outputTranscription?: { text?: string }
        turnComplete?: boolean
      }
      toolCall?: { functionCalls: { name: string; args: Record<string, unknown>; id: string }[] }
      sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean }
      goAway?: { timeLeft?: string }
    }

    // resumption handle を保存。次回再接続時にこれを渡せばコンテキストごと resume されるので
    // 長文システムプロンプトの再送と過去 turn の再課金が抑えられる
    if (m.sessionResumptionUpdate?.resumable && m.sessionResumptionUpdate.newHandle) {
      sessionHandleRef.current = m.sessionResumptionUpdate.newHandle
    }

    // サーバが切断予告を出したらログだけ。実際の再接続は onclose 経由で動く
    if (m.goAway) {
      console.log('[Gemini] サーバ切断予告 timeLeft:', m.goAway.timeLeft)
    }

    // 音声トランスクリプト
    const inputT = m.serverContent?.inputTranscription?.text
    if (inputT) {
      appendTranscript('user', inputT)
      window.electronAPI?.memoryRecordTranscript('user', inputT)
    }
    const outputT = m.serverContent?.outputTranscription?.text
    if (outputT) {
      // モデルが応答を始めたらユーザー側のターンを締める
      userMsgIdRef.current = null
      appendTranscript('assistant', outputT)
      window.electronAPI?.memoryRecordTranscript('assistant', outputT)
    }

    // ツール呼び出し
    if (m.toolCall?.functionCalls?.length) {
      const hasDelegate = m.toolCall.functionCalls.some(
        (c: { name?: string }) => c.name === 'delegate_task',
      )
      onStateChangeRef.current('thinking', hasDelegate ? 'claude' : 'gemini')
      const responses = []
      for (const call of m.toolCall.functionCalls) {
        const result = await window.electronAPI.callTool(call.name, call.args)
        responses.push({ id: call.id, name: call.name, response: { output: JSON.stringify(result) } })
      }
      sessionRef.current?.sendToolResponse({ functionResponses: responses })
      return
    }

    // 音声チャンクをシーケンシャルに再生
    const parts = m.serverContent?.modelTurn?.parts ?? []
    for (const part of parts) {
      if (!part.inlineData?.data) continue
      onStateChangeRef.current('speaking')
      const playback = playbackCtxRef.current!
      if (playback.state === 'suspended') await playback.resume()

      const binary = atob(part.inlineData.data)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const int16 = new Int16Array(bytes.buffer)
      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768

      const buffer = playback.createBuffer(1, float32.length, 24000)
      buffer.copyToChannel(float32, 0)
      const src = playback.createBufferSource()
      src.buffer = buffer
      src.connect(playback.destination)
      const startAt = Math.max(playback.currentTime, nextPlayTimeRef.current)
      src.start(startAt)
      nextPlayTimeRef.current = startAt + buffer.duration
    }

    if (m.serverContent?.turnComplete) {
      userMsgIdRef.current = null
      assistantMsgIdRef.current = null
      onStateChangeRef.current('idle')
    }
  }, [appendTranscript])

  // ========== 接続（自動再接続あり） ==========

  const connect = useCallback(async () => {
    intentionalCloseRef.current = false
    if (connectingRef.current) {
      pendingConnectRef.current = true
      return
    }
    if (sessionRef.current) return
    connectingRef.current = true
    const sessionEpoch = sessionEpochRef.current + 1
    sessionEpochRef.current = sessionEpoch

    const storedApiKey = localStorage.getItem('GEMINI_API_KEY')?.trim()
    const envApiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim()
    const apiKey = storedApiKey || envApiKey
    if (!apiKey) {
      console.warn('[Gemini] API Key が未設定。右クリック→設定から入力してください。')
      intentionalCloseRef.current = true
      connectingRef.current = false
      setConnectionError({ type: 'no_api_key', message: 'Gemini API キーが未設定です。右クリック→設定から入力してください。' })
      return
    }

    try {
      console.log('[Gemini] 接続中...')
      const { GoogleGenAI } = await import('@google/genai')
      const ai = new GoogleGenAI({ apiKey })

      if (!playbackCtxRef.current) playbackCtxRef.current = new AudioContext()

      // 過去の会話メモリをシステムプロンプトに注入。失敗しても接続は続行
      let memoryInjection = ''
      try {
        memoryInjection = (await window.electronAPI?.memoryGetInjection?.()) ?? ''
      } catch (err) {
        console.warn('[Gemini] メモリ注入の取得失敗:', err)
      }
      const systemText = getSystemPrompt(languageCodeRef.current, locationRef.current) + memoryInjection

      const handle = sessionHandleRef.current
      const session = await (ai.live as {
        connect: (opts: unknown) => Promise<LiveSession>
      }).connect({
        model: MODELS.geminiLive,
        config: {
          responseModalities: ['AUDIO'],
          systemInstruction: { parts: [{ text: systemText }] },
          tools: [{ functionDeclarations: secretaryTools }],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } },
            languageCode: languageCodeRef.current,
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: {
            automaticActivityDetection: { disabled: true },
          },
          // 過去 turn の累積トークンが毎ターン再課金されるのを抑える
          contextWindowCompression: { slidingWindow: {} },
          // 切断時にコンテキストを引き継いで再開できるようにする。
          // handle があればそれで resume、なければ新規セッション
          sessionResumption: handle ? { handle } : {},
        },
        callbacks: {
          onopen: () => {
            if (sessionEpochRef.current !== sessionEpoch) return
            console.log('[Gemini] 接続完了 ✓', handle ? '(resumed)' : '(fresh)')
            reconnectAttemptsRef.current = 0
            setIsConnected(true)
            setConnectionError(null)
            onStateChangeRef.current('idle')
          },
          onmessage: (msg: unknown) => {
            if (sessionEpochRef.current !== sessionEpoch) return
            handleMessage(msg)
          },
          onerror: (e: unknown) => {
            if (sessionEpochRef.current !== sessionEpoch) return
            console.error('[Gemini] エラー:', e)
            resetSessionState()
            // onclose も大抵続いて呼ばれるが、scheduleReconnect 側で二重スケジュールガード済
            scheduleReconnect()
          },
          onclose: (e?: { code?: number; reason?: string }) => {
            const code = e?.code
            const reason = e?.reason
            console.log('[Gemini] 接続終了 code:', code, 'reason:', reason)
            if (sessionEpochRef.current !== sessionEpoch) return
            resetSessionState()
            // 認証/ポリシー違反は再試行しても同じ結果なので即停止。
            // 1008=policy violation, 4401/4403=auth 系のアプリ定義
            if (code === 1008 || code === 4401 || code === 4403) {
              console.error('[Gemini] 恒久エラー、再接続中止:', code, reason)
              intentionalCloseRef.current = true
              setConnectionError({ type: 'auth', message: `認証エラー (${code})。APIキーが無効または期限切れです。設定を確認してください。` })
              return
            }
            scheduleReconnect()
          },
        },
      })

      if (sessionEpochRef.current !== sessionEpoch) {
        try {
          session.close?.()
        } catch {
          // close できないなら捨てる
        }
        return
      }
      sessionRef.current = session
      await setupMic()
    } catch (err) {
      console.error('[Gemini] 接続エラー:', err)
      resetSessionState()
      const domErr = err as { name?: string; message?: string }
      if (domErr?.name === 'NotAllowedError' || domErr?.name === 'PermissionDeniedError') {
        intentionalCloseRef.current = true
        setConnectionError({
          type: 'mic_permission',
          message: 'マイク権限が拒否されています。システム設定で Robot Secretary のマイク使用を許可して、アプリを再起動してください。',
        })
        return
      }
      const msg = String(err)
      const isOffline = !navigator.onLine
      const isNetworkErr = isOffline || msg.includes('Failed to fetch') || msg.includes('ERR_INTERNET') || msg.includes('ERR_NAME_NOT_RESOLVED') || msg.includes('NetworkError')
      setConnectionError({
        type: isNetworkErr ? 'network' : 'connect_error',
        message: isNetworkErr ? 'インターネット接続を確認してください。' : `接続に失敗しました。(${msg.slice(0, 80)})`,
      })
      scheduleReconnect()
    } finally {
      connectingRef.current = false
      if (pendingConnectRef.current && !sessionRef.current && !intentionalCloseRef.current) {
        pendingConnectRef.current = false
        setTimeout(() => connectRef.current(), 0)
      }
    }
  }, [handleMessage, resetSessionState, setupMic, scheduleReconnect])

  useEffect(() => { connectRef.current = connect }, [connect])

  // アンマウント時に再接続を止め、開いているセッションを閉じる（HMR/再マウント対策）
  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true
      pendingConnectRef.current = false
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      const session = sessionRef.current
      invalidateSession()
      try {
        session?.close?.()
      } catch {
        // 既に閉じている場合は無視
      }
    }
  }, [invalidateSession])

  // ========== PTT イベント登録 ==========

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    const offStart = api.onPTTStart(() => {
      console.log('[PTT] Start — session:', !!sessionRef.current, 'muted:', isMutedRef.current)
      if (isMutedRef.current || !sessionRef.current) return
      isPTTActiveRef.current = true
      pttActivityStartedRef.current = false
      pttAudioSentRef.current = false
      pttStartTimeRef.current = performance.now()
      pttPendingChunksRef.current = []
      void micAudioCtxRef.current?.resume?.()
      void playbackCtxRef.current?.resume?.()
      onStateChangeRef.current('listening')
    })

    const offStop = api.onPTTStop(() => {
      console.log('[PTT] Stop — wasActive:', isPTTActiveRef.current)
      if (!isPTTActiveRef.current) return
      isPTTActiveRef.current = false

      // 短すぎる押下は誤爆扱い。バッファに溜めただけのチャンクを捨てて idle に戻る
      const duration = performance.now() - pttStartTimeRef.current
      if (duration < PTT_MIN_DURATION_MS) {
        console.log(`[PTT] 短すぎ (${duration.toFixed(0)}ms) — 録音を破棄`)
        if (pttActivityStartedRef.current) {
          try {
            sessionRef.current?.sendRealtimeInput({ activityEnd: {} })
          } catch {
            // WebSocketが既に閉じている場合は無視
          }
        }
        pttActivityStartedRef.current = false
        pttPendingChunksRef.current = []
        onStateChangeRef.current('idle')
        return
      }

      // 送信済みでGeminiの返事待ち。ツール呼び出しが来たら
      // 改めて processor 付きの 'thinking' に上書きする
      onStateChangeRef.current('thinking')

      // 発話終了を明示してVADタイマーを待たずに即応答させる
      if (sessionRef.current) {
        try {
          if (!pttActivityStartedRef.current) {
            sessionRef.current.sendRealtimeInput({ activityStart: {} })
            pttActivityStartedRef.current = true
          }
          if (pttPendingChunksRef.current.length) {
            console.log('[Gemini] release時に保留音声を送信:', pttPendingChunksRef.current.length)
            for (const buffered of pttPendingChunksRef.current) {
              sessionRef.current.sendRealtimeInput({
                audio: { data: buffered, mimeType: 'audio/pcm;rate=16000' },
              })
            }
            pttAudioSentRef.current = true
            pttPendingChunksRef.current = []
          }
          if (!pttAudioSentRef.current) {
            console.warn('[PTT] 音声が送信されていないためターン終了を送らない')
            pttActivityStartedRef.current = false
            onStateChangeRef.current('idle')
            return
          }
          sessionRef.current.sendRealtimeInput({ activityEnd: {} })
          pttActivityStartedRef.current = false
        } catch {
          // WebSocketが既に閉じている場合は無視
        }
      }
    })
    return () => {
      offStart?.()
      offStop?.()
    }
  }, [])

  const retry = useCallback(() => {
    setConnectionError(null)
    intentionalCloseRef.current = false
    reconnectAttemptsRef.current = 0
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    void connectRef.current()
  }, [])

  return { connect, isConnected, messages, connectionError, retry }
}
