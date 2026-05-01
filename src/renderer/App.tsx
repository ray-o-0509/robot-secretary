import { useState, useEffect } from 'react'
import i18n, { toLng } from './i18n'
import { RobotScene } from './components/RobotScene'
import { StatusBanner } from './components/StatusBanner'
import { SettingsPanel } from './components/SettingsPanel'
import { ChatPanel, type ChatMessage } from './components/ChatPanel'
import { ConfirmationCard, type ConfirmationRequest } from './components/ConfirmationCard'
import { DisplayApp } from './display/DisplayApp'
import { EmailDetailApp } from './skills/gmail/DetailApp'
import { SearchApp } from './search/SearchApp'
import { WeatherApp } from './weather/WeatherApp'
import { SetupApp } from './setup/SetupApp'
import { SettingsApp } from './settings/SettingsApp'
import type { PanelPayload } from './display/types'
import { useGeminiLive } from './hooks/useGeminiLive'

export type RobotState = 'idle' | 'listening' | 'speaking' | 'thinking'
export type RobotProcessor = 'gemini' | 'claude'

declare global {
  interface Window {
    electronAPI: {
      callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
      onPTTStart: (cb: () => void) => () => void
      onPTTStop: (cb: () => void) => () => void
      onMuteChanged: (cb: (muted: boolean) => void) => () => void
      onOpenSettings: (cb: () => void) => () => void
      sendRobotState: (state: string, processor?: RobotProcessor) => void
      sendChatMessages: (messages: ChatMessage[]) => void
      onChatMessages: (cb: (messages: ChatMessage[]) => void) => () => void
      onRobotState: (cb: (state: string, processor?: RobotProcessor) => void) => () => void
      setClickThrough: (enabled: boolean) => void
      setChatInteractive: (enabled: boolean) => void
      setLanguage: (lang: string) => void
      onLanguageChange: (cb: (lang: string) => void) => () => void
      memoryGetInjection: () => Promise<string>
      memoryRecordTranscript: (role: 'user' | 'assistant', text: string) => void
      onDisplayData: (cb: (payload: PanelPayload) => void) => () => void
      displayClose: () => void
      displayRefresh: (type: string) => Promise<unknown>
      openEmailDetail: (account: string, id: string) => void
      closeEmailDetail: () => void
      onEmailDetailArgs: (cb: (args: { account: string; id: string }) => void) => () => void
      onSearchData: (cb: (data: unknown) => void) => () => void
      searchClose: () => void
      openUrl: (url: string) => Promise<void>
      openWebView: (url: string) => void
      onConfirmationRequest: (cb: (req: ConfirmationRequest) => void) => () => void
      respondToConfirmation: (id: string, confirmed: boolean) => void
      onWeatherData: (cb: (data: unknown) => void) => () => void
      weatherClose: () => void
      sendConnectionError: (err: unknown) => void
      onConnectionError: (cb: (err: unknown) => void) => () => void
      sendGeminiRetry: () => void
      onGeminiRetry: (cb: () => void) => () => void
      setupGetStatus: () => Promise<unknown>
      setupOpenSettings: (type: string) => void
      setupLaunch: () => Promise<void>

      // Notification watch
      startNotificationWatch: () => Promise<void>
      notificationSessionReady: () => Promise<{ bundleId: string; appName: string; title?: string; body?: string; ts: string }[]>
      onNotification: (cb: (notifs: { bundleId: string; appName: string; title?: string; body?: string; ts: string }[]) => void) => () => void

      // Settings window
      chatClose: () => void
      settingsClose: () => void
      settingsGetProfile: () => Promise<Record<string, string>>
      settingsUpsertProfile: (key: string, value: string) => Promise<Record<string, string>>
      settingsDeleteProfile: (key: string) => Promise<Record<string, string>>
      settingsGetDefaultApps: () => Promise<{ email?: string; browser?: string; terminal?: string; editor?: string }>
      settingsSaveDefaultApps: (apps: { email?: string; browser?: string; terminal?: string; editor?: string }) => Promise<{ ok: boolean }>
    }
  }
}

const DEFAULT_LANGUAGE = 'ja-JP'

const hash = typeof window !== 'undefined' ? window.location.hash : ''
const isChatWindow = hash === '#chat'
const isDisplayWindow = hash === '#display'
const isEmailDetailWindow = hash === '#email-detail'
const isSearchWindow = hash === '#search'
const isWeatherWindow = hash === '#weather'
const isSetupWindow = hash === '#setup'
const isSettingsWindow = hash === '#settings'

export default function App() {
  useEffect(() => {
    const off = window.electronAPI?.onLanguageChange((lang) => {
      localStorage.setItem('LANGUAGE_CODE', lang)
      i18n.changeLanguage(toLng(lang))
    })
    return () => off?.()
  }, [])

  if (isSetupWindow) return <SetupApp />
  if (isSettingsWindow) return <SettingsApp />
  if (isChatWindow) return <ChatWindowApp />
  if (isDisplayWindow) return <DisplayApp />
  if (isEmailDetailWindow) return <EmailDetailApp />
  if (isSearchWindow) return <SearchApp />
  if (isWeatherWindow) return <WeatherApp />
  return <RobotWindowApp />
}

function RobotWindowApp() {
  const [robotState, setRobotState] = useState<RobotState>('idle')
  const [showSettings, setShowSettings] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [interactive, setInteractive] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<ConfirmationRequest | null>(null)
  const [languageCode, setLanguageCode] = useState<string>(
    () => localStorage.getItem('LANGUAGE_CODE') ?? DEFAULT_LANGUAGE,
  )

  const { connect, isConnected, messages, connectionError, retry } = useGeminiLive({
    onStateChange: (state, processor) => {
      setRobotState(state)
      window.electronAPI?.sendRobotState(state, processor)
    },
    isMuted,
    languageCode,
  })

  useEffect(() => {
    const offMute = window.electronAPI?.onMuteChanged((muted) => setIsMuted(muted))
    const offSettings = window.electronAPI?.onOpenSettings(() => setShowSettings(true))
    const offLang = window.electronAPI?.onLanguageChange((lang) => {
      localStorage.setItem('LANGUAGE_CODE', lang)
      setLanguageCode(lang)
    })
    const offConfirm = window.electronAPI?.onConfirmationRequest((req) => {
      setPendingConfirmation(req)
      window.electronAPI?.setClickThrough(false)
    })
    return () => {
      offMute?.()
      offSettings?.()
      offLang?.()
      offConfirm?.()
    }
  }, [])

  // 起動時にGemini Live セッションを接続（PTTで発話制御）
  useEffect(() => {
    connect()
  }, [connect])

  // チャットウィンドウへメッセージを転送
  useEffect(() => {
    window.electronAPI?.sendChatMessages(messages)
  }, [messages])

  // エラー状態をチャットウィンドウへ転送
  useEffect(() => {
    window.electronAPI?.sendConnectionError(connectionError)
  }, [connectionError])

  // チャットウィンドウからのリトライ要求を受信
  useEffect(() => {
    const off = window.electronAPI?.onGeminiRetry(() => retry())
    return () => off?.()
  }, [retry])

  // ホバー検出: forwarded mousemove でカーソル滞在を判定
  useEffect(() => {
    const onMove = () => {
      if (!interactive) {
        setInteractive(true)
        window.electronAPI?.setClickThrough(false)
      }
    }
    document.addEventListener('mousemove', onMove)
    return () => document.removeEventListener('mousemove', onMove)
  }, [interactive])

  const handleLeave = () => {
    if (!interactive) return
    setInteractive(false)
    // 確認カードが表示中はクリックスルーに戻さない
    if (!pendingConfirmation) window.electronAPI?.setClickThrough(true)
  }

  const handleConfirmationRespond = (id: string, confirmed: boolean) => {
    window.electronAPI?.respondToConfirmation(id, confirmed)
    setPendingConfirmation(null)
    if (!interactive) window.electronAPI?.setClickThrough(true)
  }

  const wrapperStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    position: 'relative',
  }
  if (interactive && !showSettings) {
    ;(wrapperStyle as Record<string, unknown>).WebkitAppRegion = 'drag'
  }

  return (
    <div style={wrapperStyle} onMouseLeave={handleLeave}>
      <RobotScene state={robotState} isConnected={isConnected} />
      {showSettings && (
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <SettingsPanel onClose={() => setShowSettings(false)} />
        </div>
      )}
      {pendingConfirmation && (
        <ConfirmationCard request={pendingConfirmation} onRespond={handleConfirmationRespond} />
      )}
    </div>
  )
}

function ChatWindowApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [robotState, setRobotState] = useState<RobotState>('idle')
  const [processor, setProcessor] = useState<RobotProcessor | undefined>(undefined)
  const [connectionError, setConnectionError] = useState<unknown>(null)

  useEffect(() => {
    window.electronAPI?.onChatMessages((msgs) => setMessages(msgs))
    window.electronAPI?.onRobotState((s, p) => {
      setRobotState(s as RobotState)
      setProcessor(p)
    })
    window.electronAPI?.onConnectionError((err) => setConnectionError(err))
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <StatusBanner state={robotState} processor={processor} />
      <ChatPanel
        messages={messages}
        connectionError={connectionError as import('./hooks/useGeminiLive').ConnectionError | null}
        onRetry={() => window.electronAPI?.sendGeminiRetry()}
      />
    </div>
  )
}
