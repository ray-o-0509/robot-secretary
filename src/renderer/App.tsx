import { useState, useEffect } from 'react'
import { RobotScene } from './components/RobotScene'
import { StatusRing } from './components/StatusRing'
import { StatusBanner } from './components/StatusBanner'
import { SettingsPanel } from './components/SettingsPanel'
import { ChatPanel, type ChatMessage } from './components/ChatPanel'
import { useGeminiLive } from './hooks/useGeminiLive'

export type RobotState = 'idle' | 'listening' | 'speaking' | 'thinking'

declare global {
  interface Window {
    electronAPI: {
      callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
      onPTTStart: (cb: () => void) => void
      onPTTStop: (cb: () => void) => void
      onMuteChanged: (cb: (muted: boolean) => void) => void
      onOpenSettings: (cb: () => void) => void
      sendRobotState: (state: string) => void
      sendChatMessages: (messages: ChatMessage[]) => void
      onChatMessages: (cb: (messages: ChatMessage[]) => void) => void
      onRobotState: (cb: (state: string) => void) => void
      setClickThrough: (enabled: boolean) => void
    }
  }
}

const isChatWindow = typeof window !== 'undefined' && window.location.hash === '#chat'

export default function App() {
  if (isChatWindow) return <ChatWindowApp />
  return <RobotWindowApp />
}

function RobotWindowApp() {
  const [robotState, setRobotState] = useState<RobotState>('idle')
  const [showSettings, setShowSettings] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [interactive, setInteractive] = useState(false)

  const { connect, isConnected, messages } = useGeminiLive({
    onStateChange: (state) => {
      setRobotState(state)
      window.electronAPI?.sendRobotState(state)
    },
    isMuted,
  })

  useEffect(() => {
    window.electronAPI?.onMuteChanged((muted) => setIsMuted(muted))
    window.electronAPI?.onOpenSettings(() => setShowSettings(true))
  }, [])

  // 起動時にGemini Live セッションを接続（PTTで発話制御）
  useEffect(() => {
    connect()
  }, [])

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

  useEffect(() => {
    window.electronAPI?.onChatMessages((msgs) => setMessages(msgs))
    window.electronAPI?.onRobotState((s) => setRobotState(s as RobotState))
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <StatusBanner state={robotState} />
      <ChatPanel messages={messages} />
    </div>
  )
}
