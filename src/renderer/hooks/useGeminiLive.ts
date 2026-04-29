import { useRef, useState, useCallback, useEffect } from 'react'
import type { RobotState } from '../App'
import type { ChatMessage } from '../components/ChatPanel'

const secretaryTools = [
  {
    name: 'get_slack_unread',
    description: 'Slackの未読メッセージを取得する',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'チャンネルID（省略時は全チャンネル）' },
      },
    },
  },
  {
    name: 'send_slack_message',
    description: 'Slackにメッセージを送信する',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['channel', 'text'],
    },
  },
  {
    name: 'get_gmail_unread',
    description: 'Gmailの未読メールを取得する',
    parameters: {
      type: 'object',
      properties: { maxResults: { type: 'number' } },
    },
  },
  {
    name: 'get_calendar_events',
    description: '今日のGoogleカレンダーの予定を取得する',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_notion_tasks',
    description: 'Notionのタスクを取得する',
    parameters: {
      type: 'object',
      properties: { status: { type: 'string' } },
    },
  },
]

const SYSTEM_PROMPT = `お前はちょっと生意気な秘書ロボット「ベガ」(VEGA)だ。名前を聞かれたら「ベガだ」と答えろ。

【口調ルール（厳守）】
- 一人称は「俺」、二人称は「お前」
- 語尾は「〜だろ」「〜だぜ」「〜じゃねえか」などのタメ口・ぶっきらぼう調
- 丁寧語（です・ます）は絶対に使わない。「了解しました」「承知しました」も禁止
- たまに軽口やツッコミを入れていい（例: 「またそれかよ」「自分で見ろよ」）が、最終的にはちゃんと仕事はする
- 1〜2文で簡潔に。長々喋らない
- 流行語・ネットスラング（〜ンゴ等）・絵文字・顔文字は使わない

【役割】
Slack・Gmail・Googleカレンダー・Notionのツールで情報を取得・操作する秘書。
不明な点は推測せず聞き返す（「で、どれの話だ？」みたいに生意気に聞き返してOK）。

口調の例:
- 「未読は3件だな。Slackは田中からだぜ」
- 「今日の予定か？ 14時に会議が入ってる」
- 「お前、それさっきも聞いたろ。さっさと決めろよ」`

type LiveSession = {
  sendRealtimeInput: (opts: unknown) => void
  sendToolResponse: (opts: unknown) => void
  close?: () => void
}

interface Options {
  onStateChange: (state: RobotState) => void
  isMuted: boolean
}

export function useGeminiLive({ onStateChange, isMuted }: Options) {
  const [isConnected, setIsConnected] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const sessionRef = useRef<LiveSession | null>(null)
  const playbackCtxRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef(0)
  const isPTTActiveRef = useRef(false)
  const isMutedRef = useRef(isMuted)
  const onStateChangeRef = useRef(onStateChange)
  const connectingRef = useRef(false)
  const userMsgIdRef = useRef<string | null>(null)
  const assistantMsgIdRef = useRef<string | null>(null)
  const micSetupRef = useRef(false)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intentionalCloseRef = useRef(false)
  const connectRef = useRef<() => Promise<void>>(async () => {})

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

  useEffect(() => { isMutedRef.current = isMuted }, [isMuted])
  useEffect(() => { onStateChangeRef.current = onStateChange }, [onStateChange])

  // ========== マイク初期化（プロセス内で1度きり） ==========

  const setupMic = useCallback(async () => {
    if (micSetupRef.current) return
    micSetupRef.current = true

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const audioCtx = new AudioContext()
    const nativeSR = audioCtx.sampleRate
    console.log('[Gemini] マイク AudioContext sampleRate:', nativeSR)
    const source = audioCtx.createMediaStreamSource(stream)
    const processor = audioCtx.createScriptProcessor(4096, 1, 1)

    let audioSendCount = 0
    processor.onaudioprocess = (e) => {
      if (!sessionRef.current || !isPTTActiveRef.current || isMutedRef.current) return
      if (audioSendCount++ % 20 === 0) console.log('[Gemini] 音声送信中...', audioSendCount)
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

        sessionRef.current.sendRealtimeInput({
          audio: {
            data: btoa(String.fromCharCode(...new Uint8Array(int16.buffer))),
            mimeType: 'audio/pcm;rate=16000',
          },
        })
      } catch {
        // WebSocketが既に閉じている場合は無視
      }
    }

    source.connect(processor)
    processor.connect(audioCtx.destination)
  }, [])

  // ========== 再接続スケジューリング ==========

  const scheduleReconnect = useCallback(() => {
    if (intentionalCloseRef.current) return
    if (reconnectTimerRef.current) return // 二重スケジュール防止

    const attempt = reconnectAttemptsRef.current
    // 1s, 2s, 4s, 8s, 16s, 30s, 30s, ... (30sで上限固定。無限リトライ)
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
    }

    // 音声トランスクリプト
    const inputT = m.serverContent?.inputTranscription?.text
    if (inputT) appendTranscript('user', inputT)
    const outputT = m.serverContent?.outputTranscription?.text
    if (outputT) {
      // モデルが応答を始めたらユーザー側のターンを締める
      userMsgIdRef.current = null
      appendTranscript('assistant', outputT)
    }

    // ツール呼び出し
    if (m.toolCall?.functionCalls?.length) {
      onStateChangeRef.current('thinking')
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
    if (connectingRef.current || sessionRef.current) return
    connectingRef.current = true

    const apiKey = localStorage.getItem('GEMINI_API_KEY') ?? import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      // API Key 未設定で再接続ループに入ると無限に失敗するので止める
      console.warn('[Gemini] API Key が未設定。右クリック→設定から入力してください。')
      intentionalCloseRef.current = true
      connectingRef.current = false
      return
    }

    try {
      console.log('[Gemini] 接続中...')
      const { GoogleGenAI } = await import('@google/genai')
      const ai = new GoogleGenAI({ apiKey })

      if (!playbackCtxRef.current) playbackCtxRef.current = new AudioContext()

      const session = await (ai.live as {
        connect: (opts: unknown) => Promise<LiveSession>
      }).connect({
        model: 'gemini-3.1-flash-live-preview',
        config: {
          responseModalities: ['AUDIO'],
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          tools: [{ functionDeclarations: secretaryTools }],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } },
            languageCode: 'ja-JP',
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            console.log('[Gemini] 接続完了 ✓')
            reconnectAttemptsRef.current = 0
            setIsConnected(true)
            onStateChangeRef.current('idle')
          },
          onmessage: (msg: unknown) => {
            handleMessage(msg)
          },
          onerror: (e: unknown) => {
            console.error('[Gemini] エラー:', e)
            setIsConnected(false)
            onStateChangeRef.current('idle')
            // onclose も大抵続いて呼ばれるが、scheduleReconnect 側で二重スケジュールガード済
            scheduleReconnect()
          },
          onclose: () => {
            console.log('[Gemini] 接続終了')
            sessionRef.current = null
            setIsConnected(false)
            onStateChangeRef.current('idle')
            scheduleReconnect()
          },
        },
      })

      sessionRef.current = session
      await setupMic()
    } catch (err) {
      console.error('[Gemini] 接続エラー:', err)
      setIsConnected(false)
      onStateChangeRef.current('idle')
      scheduleReconnect()
    } finally {
      connectingRef.current = false
    }
  }, [handleMessage, setupMic, scheduleReconnect])

  useEffect(() => { connectRef.current = connect }, [connect])

  // アンマウント時に再接続を止め、開いているセッションを閉じる（HMR/再マウント対策）
  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      try {
        sessionRef.current?.close?.()
      } catch {
        // 既に閉じている場合は無視
      }
      sessionRef.current = null
    }
  }, [])

  // ========== PTT イベント登録 ==========

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    api.onPTTStart(() => {
      console.log('[PTT] Start — session:', !!sessionRef.current, 'muted:', isMutedRef.current)
      if (isMutedRef.current || !sessionRef.current) return
      isPTTActiveRef.current = true
      onStateChangeRef.current('listening')
    })

    api.onPTTStop(() => {
      console.log('[PTT] Stop — wasActive:', isPTTActiveRef.current)
      if (!isPTTActiveRef.current) return
      isPTTActiveRef.current = false
      onStateChangeRef.current('thinking')

      // 発話終了を明示してVADタイマーを待たずに即応答させる
      if (sessionRef.current) {
        try {
          sessionRef.current.sendRealtimeInput({ audioStreamEnd: true })
        } catch {
          // WebSocketが既に閉じている場合は無視
        }
      }
    })
  }, [])

  return { connect, isConnected, messages }
}
