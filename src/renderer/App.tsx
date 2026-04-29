import { useState, useEffect } from 'react'
import { RobotScene } from './components/RobotScene'
import { StatusRing } from './components/StatusRing'
import { StatusBanner } from './components/StatusBanner'
import { SettingsPanel } from './components/SettingsPanel'
import { ChatPanel, type ChatMessage } from './components/ChatPanel'
import { DisplayApp } from './display/DisplayApp'
import { EmailDetailApp } from './display/EmailDetailApp'
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
    }
  }
}

const DEFAULT_LANGUAGE = 'ja-JP'

const hash = typeof window !== 'undefined' ? window.location.hash : ''
const isChatWindow = hash === '#chat'
const isDisplayWindow = hash === '#display'
const isEmailDetailWindow = hash === '#email-detail'

export default function App() {
  if (isChatWindow) return <ChatWindowApp />
  if (isDisplayWindow) return <DisplayApp />
  if (isEmailDetailWindow) return <EmailDetailApp />
  return <RobotWindowApp />
}

function RobotWindowApp() {
  const [robotState, setRobotState] = useState<RobotState>('idle')
  const [showSettings, setShowSettings] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [interactive, setInteractive] = useState(false)
  const [languageCode, setLanguageCode] = useState<string>(
    () => localStorage.getItem('LANGUAGE_CODE') ?? DEFAULT_LANGUAGE,
  )

  const { connect, isConnected, messages } = useGeminiLive({
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
    return () => {
      offMute?.()
      offSettings?.()
      offLang?.()
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
    window.electronAPI?.setClickThrough(true)
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
      <RobotScene state={robotState} />
      <StatusRing isConnected={isConnected} />
      {showSettings && (
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <SettingsPanel onClose={() => setShowSettings(false)} />
        </div>
      )}
    </div>
  )
}

function ChatWindowApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [robotState, setRobotState] = useState<RobotState>('idle')
  const [processor, setProcessor] = useState<RobotProcessor | undefined>(undefined)
  const [languageCode, setLanguageCode] = useState<string>(
    () => localStorage.getItem('LANGUAGE_CODE') ?? DEFAULT_LANGUAGE,
  )

  useEffect(() => {
    window.electronAPI?.onChatMessages((msgs) => setMessages(msgs))
    window.electronAPI?.onRobotState((s, p) => {
      setRobotState(s as RobotState)
      setProcessor(p)
    })
    window.electronAPI?.onLanguageChange((lang) => {
      localStorage.setItem('LANGUAGE_CODE', lang)
      setLanguageCode(lang)
    })
  }, [])

  const handleLanguageChange = (lang: string) => {
    if (lang === languageCode) return
    localStorage.setItem('LANGUAGE_CODE', lang)
    setLanguageCode(lang)
    window.electronAPI?.setLanguage(lang)
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <StatusBanner state={robotState} processor={processor} />
      <ChatPanel
        messages={messages}
        languageCode={languageCode}
        onLanguageChange={handleLanguageChange}
      />
    </div>
  )
}
