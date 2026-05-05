import { useRef, useState, useCallback, useEffect } from 'react'
import i18next from 'i18next'
import { LIMITS, MODELS } from '../../config/models'
import { secretaryTools } from '../../config/tools'
import { getSystemPrompt, getRegionContextSuffix, resolveLocation } from '../prompt/systemPrompt'
import { useAudioPlayback } from './useAudioPlayback'
import { useMicCapture } from './useMicCapture'
import type { RobotState, RobotProcessor } from '../App'
import type { ChatMessage } from '../components/ChatPanel'

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
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intentionalCloseRef = useRef(false)
  const sessionHandleRef = useRef<string | null>(null)
  const connectRef = useRef<() => Promise<void>>(async () => {})
  const locationRef = useRef<string>(
    Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop()?.replace(/_/g, ' ') ?? 'Unknown'
  )
  const sessionEpochRef = useRef(0)

  const playback = useAudioPlayback()

  // Mic chunk handler: gates on PTT/mute, buffers chunks during the 1s minimum-hold window,
  // then flushes them and continues live-streaming until PTT release.
  const handleMicChunk = useCallback((data: string) => {
    const session = sessionRef.current
    if (!session || !isPTTActiveRef.current || isMutedRef.current) return

    const elapsed = performance.now() - pttStartTimeRef.current
    if (elapsed < PTT_MIN_DURATION_MS) {
      pttPendingChunksRef.current.push(data)
      return
    }
    if (!pttActivityStartedRef.current) {
      session.sendRealtimeInput({ activityStart: {} })
      pttActivityStartedRef.current = true
    }
    if (pttPendingChunksRef.current.length) {
      for (const buffered of pttPendingChunksRef.current) {
        session.sendRealtimeInput({ audio: { data: buffered, mimeType: 'audio/pcm;rate=16000' } })
      }
      pttAudioSentRef.current = true
      pttPendingChunksRef.current = []
    }
    session.sendRealtimeInput({ audio: { data, mimeType: 'audio/pcm;rate=16000' } })
    pttAudioSentRef.current = true
  }, [])

  const mic = useMicCapture({ onChunk: handleMicChunk })

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

  useEffect(() => {
    const off = window.electronAPI?.onRegionImage?.(({ base64, mediaType: mimeType }) => {
      const session = sessionRef.current
      if (!session) {
        console.warn('[Gemini] region-image received but no active session')
        return
      }
      const send = (msg: unknown, label: string) => {
        try {
          session.sendRealtimeInput(msg)
        } catch (err) {
          console.error(`[Gemini] ${label} failed:`, err)
        }
      }
      // Force activityStart even if PTT is under PTT_MIN_DURATION_MS, so an image-only
      // turn still completes when activityEnd fires on Alt release.
      if (!pttActivityStartedRef.current) {
        send({ activityStart: {} }, 'activityStart')
        pttActivityStartedRef.current = true
        for (const buffered of pttPendingChunksRef.current) {
          send({ audio: { data: buffered, mimeType: 'audio/pcm;rate=16000' } }, 'pending audio')
        }
        if (pttPendingChunksRef.current.length) pttAudioSentRef.current = true
        pttPendingChunksRef.current = []
      }
      send({ text: getRegionContextSuffix(languageCodeRef.current) }, 'region context')
      // Per Gemini Live capabilities docs, image frames go on the `video` field.
      send({ video: { data: base64, mimeType } }, 'video frame')
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
      await playback.enqueuePCM(part.inlineData.data, 24000)
    }

    if (m.serverContent?.turnComplete) {
      userMsgIdRef.current = null
      assistantMsgIdRef.current = null
      onStateChangeRef.current('idle')
    }
  }, [appendTranscript, playback])


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

    const stored = (await window.electronAPI.settingsGetSecretValue?.('GEMINI_API_KEY'))?.trim()
    const apiKey = stored || import.meta.env.VITE_GEMINI_API_KEY?.trim()
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

      playback.ensureContext()

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
      await mic.setup()
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
  }, [handleMessage, resetSessionState, mic, playback, scheduleReconnect])

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
      mic.teardown()
      playback.teardown()
    }
  }, [invalidateSession, mic, playback])


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
      if (playback.isPlaying()) {
        console.log('[PTT] Interrupt: stopping active audio playback')
        playback.interrupt()
      }

      isPTTActiveRef.current = true
      pttActivityStartedRef.current = false
      pttAudioSentRef.current = false
      pttStartTimeRef.current = performance.now()
      pttPendingChunksRef.current = []
      mic.resume()
      playback.resume()
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
