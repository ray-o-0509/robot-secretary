import { useRef, useState, useCallback, useEffect } from 'react'
import i18next from 'i18next'
import { LIMITS, MODELS } from '../../config/models'
import type { RobotState, RobotProcessor } from '../App'
import type { ChatMessage } from '../components/ChatPanel'
import JAPANESE_SYSTEM_PROMPT from '../../prompts/vega-ja.md?raw'
import ENGLISH_SYSTEM_PROMPT from '../../prompts/vega-en.md?raw'
import CHINESE_SYSTEM_PROMPT from '../../prompts/vega-zh.md?raw'
import KOREAN_SYSTEM_PROMPT from '../../prompts/vega-ko.md?raw'

const secretaryTools = [
  {
    name: 'delegate_task',
    description:
      'Delegate tasks to a Claude agent: checking Gmail, Google Calendar, screen contents, complex summarization, or cross-cutting research. Use this for everything except task management (get_tasks/create_task/complete_task).',
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'Detailed instructions for the task to perform (include all necessary information)',
        },
        includeScreenshot: {
          type: 'boolean',
          description: 'Set true when the decision requires seeing the current screen contents',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'get_tasks',
    description: 'Retrieve all incomplete tasks from TickTick across all projects. Call this directly when asked about tasks or to-dos.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'create_task',
    description: 'Create a new task in TickTick. If projectId is omitted, the task goes to inbox.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        due: { type: 'string', description: 'Due date (YYYY-MM-DD, optional)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Priority (optional; use "high" for urgent/important)' },
        projectId: { type: 'string', description: 'Project ID (optional; omit to use inbox)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a TickTick task as complete. Requires taskId and projectId obtained beforehand via get_tasks.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (from get_tasks result)' },
        projectId: { type: 'string', description: 'Project ID (from get_tasks result)' },
      },
      required: ['taskId', 'projectId'],
    },
  },
  {
    name: 'update_profile',
    description: 'Call this when the user shares personal information or says "remember this". key = field name (e.g. "name", "job", "hobby"), value = the content to persist.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Field name (e.g. "name", "job", "address", "hobby")' },
        value: { type: 'string', description: 'Content to store' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'delete_profile',
    description: 'Delete a specific field from the profile. Call when asked to remove or forget a piece of information.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Field name to delete' },
      },
      required: ['key'],
    },
  },
  {
    name: 'update_task',
    description: 'Update the due date, title, or priority of a TickTick task. Confirm taskId and projectId via get_tasks before calling.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (from get_tasks result)' },
        projectId: { type: 'string', description: 'Project ID (from get_tasks result)' },
        title: { type: 'string', description: 'New title (if changing)' },
        due: { type: 'string', description: 'New due date YYYY-MM-DD. Pass null to clear the due date.' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'none'], description: 'New priority' },
      },
      required: ['taskId', 'projectId'],
    },
  },
  {
    name: 'get_weather',
    description: 'Get a weather forecast. Call directly when asked about weather or whether to bring an umbrella.',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'Place name (e.g. "Tokyo", "Osaka", "Sapporo")' },
      },
      required: ['location'],
    },
  },
  {
    name: 'analyze_screen',
    description: 'Capture and analyze the current screen. Use when asked what is on screen or what app is open.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'What you want to know about the screen (optional)' },
      },
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for the latest information, news, or general lookups.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_gmail',
    description: 'Search Gmail messages by keyword, sender, subject, etc. Searches across all accounts including non-inbox. Results are shown on the display.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query (e.g. "from:hoge@example.com", "subject:invoice", "John")' },
        account: { type: 'string', description: 'Restrict to a specific account (omit to search all accounts)' },
        maxResults: { type: 'number', description: 'Max results per account (default 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'open_app',
    description:
      'Launch a macOS application. app_name must be the official English name (e.g. "Safari", "Finder", "Google Chrome").',
    parameters: {
      type: 'object',
      properties: {
        app_name: {
          type: 'string',
          description: 'Official English app name (e.g. "Notion", "Spotify", "Google Chrome")',
        },
      },
      required: ['app_name'],
    },
  },
  {
    name: 'show_panel',
    description:
      'Display email, calendar, tasks, AI news, tools, or movies in a dedicated panel. Only call when the user explicitly asks to show or display something. For checks like "any new mail?" use delegate_task instead. The response data field contains raw data — summarize it verbally as usual and note that it is also shown on screen.',
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
            'news',
            'tools',
            'movies',
          ],
          description:
            'email=Gmail inbox, calendar_today=today\'s events, calendar_tomorrow=tomorrow, calendar_week=next 7 days, tasks=TickTick incomplete, news=AI news daily digest, tools=recommended tools, movies=now-playing/upcoming movies',
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'cd',
    description:
      'Change the working directory. Subsequent run_command and run_claude calls will execute here.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Destination path (~/... format is accepted)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'run_command',
    description:
      'Run a shell command and display the output on screen. Supports git, ls, cat, npm, and anything else. If cwd is omitted, runs in the current working directory. Results appear in the panel.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to execute (zsh)',
        },
        cwd: {
          type: 'string',
          description: 'Override directory for this run only',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'run_claude',
    description:
      'Pass a prompt to the Claude Code CLI and execute it. Use when asked to have Claude write or modify code. If cwd is omitted, runs in the current working directory.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Instructions for Claude',
        },
        cwd: {
          type: 'string',
          description: 'Override directory for this run only',
        },
      },
      required: ['prompt'],
    },
  },
]


function buildContextBlock(languageCode: string, location: string): string {
  const now = new Date()
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  if (languageCode.startsWith('ja')) {
    const dateStr = now.toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: tz,
    })
    const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: tz })
    return `【現在の状況】\n- 日時: ${dateStr} ${timeStr}\n- 現在地: ${location}（天気・場所の質問でデフォルトはここを使え）`
  } else if (languageCode.startsWith('zh')) {
    const dateStr = now.toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: tz,
    })
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', timeZone: tz })
    return `【当前状态】\n- 日期时间: ${dateStr} ${timeStr}\n- 当前位置: ${location}（天气和地点查询默认使用这里）`
  } else if (languageCode.startsWith('ko')) {
    const dateStr = now.toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: tz,
    })
    const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: tz })
    return `【현재 상황】\n- 날짜/시간: ${dateStr} ${timeStr}\n- 현재 위치: ${location}（날씨·장소 질문 기본값으로 사용）`
  } else {
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz,
    })
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: tz })
    return `[Current context]\n- Date/Time: ${dateStr}, ${timeStr}\n- Location: ${location} (use as default for weather/place queries)`
  }
}

function getSystemPrompt(languageCode: string, location: string): string {
  let prompt: string
  if (languageCode.startsWith('zh')) prompt = CHINESE_SYSTEM_PROMPT
  else if (languageCode.startsWith('ko')) prompt = KOREAN_SYSTEM_PROMPT
  else if (languageCode.startsWith('en')) prompt = ENGLISH_SYSTEM_PROMPT
  else prompt = JAPANESE_SYSTEM_PROMPT
  return buildContextBlock(languageCode, location) + '\n\n' + prompt
}

async function resolveLocation(): Promise<string> {
  const tzFallback = Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop()?.replace(/_/g, ' ') ?? 'Unknown'
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

// Threshold after which consecutive reconnect failures are abandoned, preventing infinite re-sends of long prompts
const MAX_RECONNECT_ATTEMPTS = LIMITS.geminiMaxReconnectAttempts
// How many handle-based failures before discarding the handle and starting a fresh session.
// Handles expire after 2 hours, so this recovers from long sleep/resume scenarios.
const HANDLE_RETRY_THRESHOLD = 3
// PTT presses shorter than this are treated as accidental taps and discarded
const PTT_MIN_DURATION_MS = 1000

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
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([])
  const isPTTActiveRef = useRef(false)
  const pttActivityStartedRef = useRef(false)
  const pttAudioSentRef = useRef(false)
  const pttStartTimeRef = useRef(0)
  // Staging area for chunks collected within PTT_MIN_DURATION_MS of PTT start.
  // Flushed the moment the threshold is exceeded; discarded entirely if PTT is released before threshold.
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
    Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop()?.replace(/_/g, ' ') ?? 'Unknown'
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

  // Fetch actual location on startup and use it in the system prompt
  useEffect(() => {
    resolveLocation().then((loc) => { locationRef.current = loc })
  }, [])

  // Start notification watch and inject incoming notifications into the current session
  useEffect(() => {
    void window.electronAPI?.startNotificationWatch?.()
    const off = window.electronAPI?.onNotification?.((notifs) => {
      if (sessionRef.current && notifs.length > 0) {
        injectNotifications(sessionRef.current, notifs)
      }
    })
    return () => off?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // When the language changes, close the existing session and reconnect via onclose → scheduleReconnect
  useEffect(() => {
    languageCodeRef.current = languageCode
    if (isFirstLanguageRunRef.current) {
      isFirstLanguageRunRef.current = false
      return
    }
    if (!sessionRef.current) {
      if (connectingRef.current) {
        console.log('[Gemini] Language changed while connecting', languageCode, '— replacing pending connect')
        sessionHandleRef.current = null
        pendingConnectRef.current = true
        invalidateSession()
      }
      return
    }
    console.log('[Gemini] Language changed', languageCode, '— reconnecting')
    sessionHandleRef.current = null // do not carry over old language context
    const session = sessionRef.current
    invalidateSession()
    try {
      session?.close?.()
    } catch {
      // already closed — ignore
    }
    void connectRef.current()
  }, [invalidateSession, languageCode])

  // ========== Mic initialization (once per process) ==========

  const setupMic = useCallback(async () => {
    if (micSetupRef.current) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const audioCtx = new AudioContext()
      micAudioCtxRef.current = audioCtx
      const nativeSR = audioCtx.sampleRate
      console.log('[Gemini] Mic AudioContext sampleRate:', nativeSR)
      const source = audioCtx.createMediaStreamSource(stream)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1)

      let audioSendCount = 0
      processor.onaudioprocess = (e) => {
        if (!sessionRef.current || !isPTTActiveRef.current || isMutedRef.current) return
        try {
          const inputData = e.inputBuffer.getChannelData(0)

          // Downsample from native rate to 16000 Hz
          const ratio = nativeSR / 16000
          const outLen = Math.floor(inputData.length / ratio)
          const int16 = new Int16Array(outLen)
          for (let i = 0; i < outLen; i++) {
            const sample = inputData[Math.floor(i * ratio)]
            int16[i] = Math.max(-32768, Math.min(32767, sample * 32768))
          }
          const data = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)))

          // Buffer chunks for the minimum hold duration; discard all if PTT is released before threshold
          // so accidental short taps never reach the API
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
            console.log('[Gemini] Flushing buffered audio chunks:', pttPendingChunksRef.current.length)
            for (const buffered of pttPendingChunksRef.current) {
              sessionRef.current.sendRealtimeInput({
                audio: { data: buffered, mimeType: 'audio/pcm;rate=16000' },
              })
            }
            pttAudioSentRef.current = true
            pttPendingChunksRef.current = []
          }

          if (audioSendCount++ % 20 === 0) console.log('[Gemini] Sending audio...', audioSendCount)
          sessionRef.current.sendRealtimeInput({
            audio: { data, mimeType: 'audio/pcm;rate=16000' },
          })
          pttAudioSentRef.current = true
        } catch {
          // WebSocket already closed — ignore
        }
      }

      source.connect(processor)
      processor.connect(audioCtx.destination)
      micSetupRef.current = true
    } catch (err) {
      micSetupRef.current = false
      const e = err as { name?: string; message?: string }
      console.error('[Gemini] Mic initialization failed:', e?.name ?? String(err), e?.message ?? '')
      throw err
    }
  }, [])

  // ========== Reconnect scheduling ==========

  const scheduleReconnect = useCallback(() => {
    if (intentionalCloseRef.current) return
    if (reconnectTimerRef.current) return // 二重スケジュール防止

    const attempt = reconnectAttemptsRef.current
    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[Gemini] Reconnect failed after ${MAX_RECONNECT_ATTEMPTS} attempts. Giving up.`)
      intentionalCloseRef.current = true
      setConnectionError({ type: 'max_retries', message: i18next.t('connection.maxRetries') })
      return
    }
    // resumption handle で連続失敗したら handle を破棄してフレッシュなセッションを試す
    if (attempt >= HANDLE_RETRY_THRESHOLD && sessionHandleRef.current) {
      console.warn('[Gemini] Discarding resumption handle and reconnecting with a fresh session')
      sessionHandleRef.current = null
    }
    // 1s, 2s, 4s, 8s, 16s, 30s, 30s, ... (30sで上限固定)
    const delay = Math.min(1000 * 2 ** attempt, 30000)
    console.log(`[Gemini] Retrying in ${delay / 1000}s (attempt ${attempt + 1})`)

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null
      reconnectAttemptsRef.current++
      connectRef.current()
    }, delay)
  }, [])

  // ========== Message handling ==========

  const handleMessage = useCallback(async (msg: unknown) => {
    console.log('[Gemini] Message received:', JSON.stringify(msg).slice(0, 300))
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

    // Save the resumption handle. Passing it on the next reconnect resumes context,
    // avoiding resending the long system prompt and re-billing past turns.
    if (m.sessionResumptionUpdate?.resumable && m.sessionResumptionUpdate.newHandle) {
      sessionHandleRef.current = m.sessionResumptionUpdate.newHandle
    }

    // Server sent a disconnect notice — just log it. Actual reconnect happens via onclose.
    if (m.goAway) {
      console.log('[Gemini] Server going away, timeLeft:', m.goAway.timeLeft)
    }

    // Audio transcription
    const inputT = m.serverContent?.inputTranscription?.text
    if (inputT) {
      appendTranscript('user', inputT)
      window.electronAPI?.memoryRecordTranscript('user', inputT)
    }
    const outputT = m.serverContent?.outputTranscription?.text
    if (outputT) {
      // Close out the user turn once the model starts responding
      userMsgIdRef.current = null
      appendTranscript('assistant', outputT)
      window.electronAPI?.memoryRecordTranscript('assistant', outputT)
    }

    // Tool call
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

    // Play audio chunks sequentially
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
      activeSourcesRef.current.push(src)
      src.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== src)
      }
    }

    if (m.serverContent?.turnComplete) {
      userMsgIdRef.current = null
      assistantMsgIdRef.current = null
      onStateChangeRef.current('idle')
    }
  }, [appendTranscript])

  // ========== Notification injection helper ==========

  function injectNotifications(
    session: LiveSession,
    notifs: { appName: string; title?: string; body?: string }[],
  ) {
    const text = notifs.map((n) =>
      n.title
        ? `[NOTIFICATION] ${n.appName}: "${n.title}"${n.body ? ' — ' + n.body : ''}`
        : `[NOTIFICATION] New notification from ${n.appName}`
    ).join('\n')
    try {
      ;(session as unknown as {
        sendClientContent: (opts: unknown) => void
      }).sendClientContent({
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      })
    } catch (e) {
      console.warn('[notification] sendClientContent failed:', e)
    }
  }

  // ========== Connection (with auto-reconnect) ==========

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
      console.warn('[Gemini] API Key is not set. Enter it via right-click → Settings.')
      intentionalCloseRef.current = true
      connectingRef.current = false
      setConnectionError({ type: 'no_api_key', message: i18next.t('connection.noApiKey') })
      return
    }

    try {
      console.log('[Gemini] Connecting...')
      const { GoogleGenAI } = await import('@google/genai')
      const ai = new GoogleGenAI({ apiKey })

      if (!playbackCtxRef.current) playbackCtxRef.current = new AudioContext()

      // Inject past conversation memory into the system prompt. Connection proceeds even on failure.
      let memoryInjection = ''
      try {
        memoryInjection = (await window.electronAPI?.memoryGetInjection?.()) ?? ''
      } catch (err) {
        console.warn('[Gemini] Failed to retrieve memory injection:', err)
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
          // Prevent accumulated past-turn tokens from being billed on every turn
          contextWindowCompression: { slidingWindow: {} },
          // Enable resuming with context on reconnect.
          // Use handle if available; otherwise start a fresh session.
          sessionResumption: handle ? { handle } : {},
        },
        callbacks: {
          onopen: () => {
            if (sessionEpochRef.current !== sessionEpoch) return
            console.log('[Gemini] Connected ✓', handle ? '(resumed)' : '(fresh)')
            reconnectAttemptsRef.current = 0
            setIsConnected(true)
            setConnectionError(null)
            onStateChangeRef.current('idle')

            // Session connected — flush any notifications that arrived before the session was ready
            void window.electronAPI?.notificationSessionReady?.().then((pending) => {
              if (pending && pending.length > 0) {
                injectNotifications(session, pending)
              }
            }).catch(() => {/* ignore if notifications are unavailable */})
          },
          onmessage: (msg: unknown) => {
            if (sessionEpochRef.current !== sessionEpoch) return
            handleMessage(msg)
          },
          onerror: (e: unknown) => {
            if (sessionEpochRef.current !== sessionEpoch) return
            console.error('[Gemini] Error:', e)
            resetSessionState()
            // onclose usually follows, but scheduleReconnect guards against double-scheduling
            scheduleReconnect()
          },
          onclose: (e?: { code?: number; reason?: string }) => {
            const code = e?.code
            const reason = e?.reason
            console.log('[Gemini] Connection closed — code:', code, 'reason:', reason)
            if (sessionEpochRef.current !== sessionEpoch) return
            resetSessionState()
            // Auth/policy errors won't recover on retry — stop immediately.
            // 1008=policy violation, 4401/4403=app-defined auth errors
            if (code === 1008 || code === 4401 || code === 4403) {
              console.error('[Gemini] Permanent error, stopping reconnect:', code, reason)
              intentionalCloseRef.current = true
              setConnectionError({ type: 'auth', message: i18next.t('connection.authError', { code }) })
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
          // cannot close — discard
        }
        return
      }
      sessionRef.current = session
      await setupMic()
    } catch (err) {
      console.error('[Gemini] Connection error:', err)
      resetSessionState()
      const domErr = err as { name?: string; message?: string }
      if (domErr?.name === 'NotAllowedError' || domErr?.name === 'PermissionDeniedError') {
        intentionalCloseRef.current = true
        setConnectionError({
          type: 'mic_permission',
          message: i18next.t('connection.micDenied'),
        })
        return
      }
      const msg = String(err)
      const isOffline = !navigator.onLine
      const isNetworkErr = isOffline || msg.includes('Failed to fetch') || msg.includes('ERR_INTERNET') || msg.includes('ERR_NAME_NOT_RESOLVED') || msg.includes('NetworkError')
      setConnectionError({
        type: isNetworkErr ? 'network' : 'connect_error',
        message: isNetworkErr ? i18next.t('connection.network') : i18next.t('connection.connectError', { msg: msg.slice(0, 80) }),
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

  // On unmount, stop reconnecting and close any open session (HMR / remount safety)
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
        // already closed — ignore
      }
    }
  }, [invalidateSession])

  // ========== PTT event registration ==========

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    const offStart = api.onPTTStart(() => {
      console.log('[PTT] Start — session:', !!sessionRef.current, 'muted:', isMutedRef.current)
      if (isMutedRef.current) return

      // If the session is gone, attempt to reconnect (won't be ready for this PTT but will help next time)
      if (!sessionRef.current) {
        if (!connectingRef.current) {
          console.log('[PTT] No session — starting reconnect')
          intentionalCloseRef.current = false
          reconnectAttemptsRef.current = 0
          void connectRef.current()
        }
        return
      }

      // If currently speaking, stop playback immediately and interrupt
      if (activeSourcesRef.current.length > 0) {
        console.log('[PTT] Interrupt: stopping active audio playback')
        for (const src of activeSourcesRef.current) {
          try { src.stop() } catch { /* already stopped */ }
        }
        activeSourcesRef.current = []
        nextPlayTimeRef.current = 0
      }

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

      // Too short — treat as accidental tap. Discard buffered chunks and return to idle.
      const duration = performance.now() - pttStartTimeRef.current
      if (duration < PTT_MIN_DURATION_MS) {
        console.log(`[PTT] Too short (${duration.toFixed(0)}ms) — discarding recording`)
        if (pttActivityStartedRef.current) {
          try {
            sessionRef.current?.sendRealtimeInput({ activityEnd: {} })
          } catch {
            // WebSocket already closed — ignore
          }
        }
        pttActivityStartedRef.current = false
        pttPendingChunksRef.current = []
        onStateChangeRef.current('idle')
        return
      }

      // Audio sent — waiting for Gemini's response. If a tool call arrives,
      // the state will be overwritten with 'thinking' (with processor).
      onStateChangeRef.current('thinking')

      // Signal end of utterance so Gemini responds without waiting for VAD timeout
      if (sessionRef.current) {
        try {
          if (!pttActivityStartedRef.current) {
            sessionRef.current.sendRealtimeInput({ activityStart: {} })
            pttActivityStartedRef.current = true
          }
          if (pttPendingChunksRef.current.length) {
            console.log('[Gemini] Flushing buffered audio on release:', pttPendingChunksRef.current.length)
            for (const buffered of pttPendingChunksRef.current) {
              sessionRef.current.sendRealtimeInput({
                audio: { data: buffered, mimeType: 'audio/pcm;rate=16000' },
              })
            }
            pttAudioSentRef.current = true
            pttPendingChunksRef.current = []
          }
          if (!pttAudioSentRef.current) {
            console.warn('[PTT] No audio was sent — skipping activityEnd')
            pttActivityStartedRef.current = false
            onStateChangeRef.current('idle')
            return
          }
          sessionRef.current.sendRealtimeInput({ activityEnd: {} })
          pttActivityStartedRef.current = false
        } catch {
          // WebSocket already closed — ignore
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
