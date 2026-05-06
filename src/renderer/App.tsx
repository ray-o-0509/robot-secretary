import { useState, useEffect, useRef } from 'react'
import i18n, { toLng } from './i18n'
import { RobotScene } from './components/RobotScene'
import { StatusBanner } from './components/StatusBanner'
import { ChatPanel, type ChatMessage } from './components/ChatPanel'
import { ConfirmationCard, type ConfirmationRequest } from './components/ConfirmationCard'
import { DisplayApp } from './display/DisplayApp'
import { EmailDetailApp } from './skills/gmail/DetailApp'
import { SearchApp } from './search/SearchApp'
import { WeatherApp } from './weather/WeatherApp'
import { SetupApp } from './setup/SetupApp'
import { SettingsApp } from './settings/SettingsApp'
import { OverlayApp } from './overlay/OverlayApp'
import { LoginApp } from './login/LoginApp'
import type { PanelPayload } from './display/types'
import { useGeminiLive } from './hooks/useGeminiLive'

export type RobotState = 'idle' | 'listening' | 'speaking' | 'thinking'
export type RobotProcessor = 'gemini' | 'claude'

export type Procedure = {
  name: string
  description: string
  learnedAt: string
  updatedAt: string
}
export type MemorySnapshot = {
  facts: string[]
  preferences: string[]
  ongoing_topics: string[]
  procedures: Procedure[]
  updatedAt: string | null
}

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
      setupGetStatus: () => Promise<{
        micPermission: string
        screenPermission: string
        accessibilityPermission: boolean
        geminiApiKey: boolean
        ticktickToken: boolean
        gmailAccounts: string[]
      }>
      setupOpenSettings: (type: string) => void
      setupLaunch: () => Promise<void>

      // Auth
      authGetStatus: () => Promise<{ isLoggedIn: boolean; email?: string; displayName?: string | null; avatarUrl?: string | null }>
      authLogin: () => Promise<{ email: string; displayName?: string | null; avatarUrl?: string | null }>
      authLogout: () => Promise<void>
      authRelaunch: () => Promise<void>
      authListApiKeys: () => Promise<Array<{ name: string; isSet: boolean }>>
      authSetApiKey: (name: string, value: string) => Promise<void>
      authDeleteApiKey: (name: string) => Promise<void>

      // Notification watch
      startNotificationWatch: () => Promise<void>
      notificationSessionReady: () => Promise<{ bundleId: string; appName: string; title?: string; body?: string; ts: string }[]>
      onNotification: (cb: (notifs: { bundleId: string; appName: string; title?: string; body?: string; ts: string }[]) => void) => () => void

      // Settings window
      onRobotVelocity: (cb: (v: { vx: number; vy: number; speed: number }) => void) => () => void
      chatClose: () => void
      settingsClose: () => void
      settingsGetProfile: () => Promise<Record<string, string>>
      settingsUpsertProfile: (key: string, value: string) => Promise<Record<string, string>>
      settingsDeleteProfile: (key: string) => Promise<Record<string, string>>
      settingsGetDefaultApps: () => Promise<{ email?: string; browser?: string; terminal?: string; editor?: string }>
      settingsSaveDefaultApps: (apps: { email?: string; browser?: string; terminal?: string; editor?: string }) => Promise<{ ok: boolean }>
      settingsListInstalledApps: () => Promise<{ name: string; path: string }[]>
      settingsGetAppIcon: (appPath: string) => Promise<string | null>
      settingsGetMemory: () => Promise<MemorySnapshot>
      settingsSaveMemory: (memory: MemorySnapshot) => Promise<MemorySnapshot>
      settingsResetMemory: () => Promise<MemorySnapshot>
      settingsUpsertProcedure: (
        oldName: string | null,
        name: string,
        description: string,
      ) => Promise<MemorySnapshot>
      settingsDeleteProcedure: (name: string) => Promise<MemorySnapshot>
      settingsUpsertMemoryItem: (
        kind: 'facts' | 'preferences' | 'ongoing_topics',
        oldText: string | null,
        text: string,
      ) => Promise<MemorySnapshot>
      settingsDeleteMemoryItem: (
        kind: 'facts' | 'preferences' | 'ongoing_topics',
        text: string,
      ) => Promise<MemorySnapshot>
      settingsGetLanguage: () => Promise<string>
      settingsListSkills: () => Promise<Array<{ id: string; label: string; description: string; tools: string[]; enabled: boolean; secrets: Array<{ key: string; label: string; hint?: string }> }>>
      settingsListCoreSecrets: () => Promise<Array<{ key: string; label: string; hint?: string }>>
      settingsSetSkillEnabled: (id: string, enabled: boolean) => Promise<Record<string, boolean>>
      settingsGetSecrets: () => Promise<Record<string, { set: boolean; preview: string }>>
      settingsSetSecret: (key: string, value: string) => Promise<Record<string, { set: boolean; preview: string }>>
      settingsGetSecretValue: (key: string) => Promise<string | undefined>

      // Appearance
      appearanceGetRobotSize: () => Promise<{ size: number; min: number; max: number; default: number }>
      appearanceSetRobotSize: (size: number) => Promise<{ size: number }>

      // Google アカウント連携
      googleAccountsCheckSetup: () => Promise<{
        clientSecretPath: string
        clientSecretExists: boolean
        primaryTokensDir: string
        fallbackTokensDir: string
      }>
      googleAccountsList: () => Promise<{
        email: string
        path: string
        source: 'primary' | 'legacy'
        scopes: string[]
        hasRefreshToken: boolean
        missingScopes: string[]
        expiry: string | null
      }[]>
      googleAccountsAdd: (loginHint?: string, scopes?: string[]) => Promise<{ email: string }>
      googleAccountsRemove: (email: string) => Promise<{ ok: boolean }>
      googleAccountsAbort: () => Promise<{ ok: boolean }>

      // Interactive PTY (two channels)
      ptyOnData: (cb: (id: 'claude' | 'shell', data: string) => void) => () => void
      ptyWrite: (id: 'claude' | 'shell', data: string) => void
      ptyResize: (id: 'claude' | 'shell', cols: number, rows: number) => void
      ptyGetBuffer: (id: 'claude' | 'shell') => Promise<string>
      onRegionImage: (cb: (payload: { base64: string; mediaType: string }) => void) => () => void
      loadingComplete: () => void
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
const isRegionOverlayWindow = hash === '#region-overlay'
const isLoginWindow = hash === '#login'
const isLoadingWindow = hash === '#loading'

// ログインが必要なウィンドウに掛けるガード。
// メインプロセスは currentUser なしでこれらのウィンドウを作らないが、
// dev モード（Vite 直接アクセス）やハッシュルーティングのズレに備えた二重チェック。
function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'ng'>('loading')

  useEffect(() => {
    if (!window.electronAPI) {
      // Electron 外（ブラウザで直接開いた場合）は表示しない
      setStatus('ng')
      return
    }
    window.electronAPI.authGetStatus().then((s) => {
      setStatus(s.isLoggedIn ? 'ok' : 'ng')
    }).catch(() => setStatus('ng'))
  }, [])

  if (status === 'loading') return <AppStartingScreen />
  if (status === 'ng') return null
  return <>{children}</>
}

function LoadingScreen() {
  return (
    <>
      <style>{`
        @keyframes ls-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes ls-fade {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          background: 'rgba(6, 8, 18, 0.88)',
          borderRadius: 14,
          animation: 'ls-fade 0.18s ease-out',
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            border: '2.5px solid rgba(0, 240, 255, 0.18)',
            borderTopColor: '#00f0ff',
            animation: 'ls-spin 0.85s linear infinite',
            boxShadow: '0 0 14px rgba(0, 240, 255, 0.35)',
          }}
        />
        <span
          style={{
            fontFamily: '"JetBrains Mono", "SF Mono", monospace',
            fontSize: 8,
            letterSpacing: 3,
            color: 'rgba(0, 240, 255, 0.45)',
          }}
        >
          LOADING
        </span>
      </div>
    </>
  )
}

function AppStartingScreen() {
  return (
    <>
      <style>{`
        @keyframes app-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes app-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          background: 'rgba(6, 8, 18, 0.92)',
          animation: 'app-fade-in 0.2s ease-out',
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: '2.5px solid rgba(0, 240, 255, 0.2)',
            borderTopColor: '#00f0ff',
            animation: 'app-spin 0.9s linear infinite',
            boxShadow: '0 0 12px rgba(0, 240, 255, 0.4)',
          }}
        />
        <span
          style={{
            fontFamily: '"JetBrains Mono", "SF Mono", monospace',
            fontSize: 9,
            letterSpacing: 3,
            color: 'rgba(0, 240, 255, 0.5)',
          }}
        >
          INITIALIZING
        </span>
      </div>
    </>
  )
}

export default function App() {
  useEffect(() => {
    const off = window.electronAPI?.onLanguageChange((lang) => {
      i18n.changeLanguage(toLng(lang))
    })
    return () => off?.()
  }, [])

  // 認証不要ウィンドウ（ローディング・ログイン・セットアップ・オーバーレイ）はそのまま返す
  if (isLoadingWindow) return <LoadingScreen />
  if (isLoginWindow) return <LoginApp />
  if (isSetupWindow) return <SetupApp />
  if (isSettingsWindow) return <SettingsApp />
  if (isRegionOverlayWindow) return <OverlayApp />

  // 認証が必要なウィンドウは AuthGate で包む
  if (isChatWindow) return <AuthGate><ChatWindowApp /></AuthGate>
  if (isDisplayWindow) return <AuthGate><DisplayApp /></AuthGate>
  if (isEmailDetailWindow) return <AuthGate><EmailDetailApp /></AuthGate>
  if (isSearchWindow) return <AuthGate><SearchApp /></AuthGate>
  if (isWeatherWindow) return <AuthGate><WeatherApp /></AuthGate>
  return <AuthGate><RobotWindowApp /></AuthGate>
}

function RobotWindowApp() {
  const [robotState, setRobotState] = useState<RobotState>('idle')
  const velocityRef = useRef({ vx: 0, vy: 0, speed: 0 })
  const [isMuted, setIsMuted] = useState(false)
  const [interactive, setInteractive] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState<ConfirmationRequest | null>(null)
  const [languageCode, setLanguageCode] = useState<string>(DEFAULT_LANGUAGE)
  const [isModelLoaded, setIsModelLoaded] = useState(false)

  useEffect(() => {
    if (isModelLoaded) window.electronAPI?.loadingComplete()
  }, [isModelLoaded])

  useEffect(() => {
    window.electronAPI?.settingsGetLanguage().then((lang) => {
      setLanguageCode(lang)
      i18n.changeLanguage(toLng(lang))
    })
  }, [])

  const { connect, isConnected, messages, connectionError, retry } = useGeminiLive({
    onStateChange: (state, processor) => {
      setRobotState(state)
      window.electronAPI?.sendRobotState(state, processor)
    },
    isMuted,
    languageCode,
  })

  useEffect(() => {
    const offVel = window.electronAPI?.onRobotVelocity((v) => { velocityRef.current = v })
    return () => offVel?.()
  }, [])

  useEffect(() => {
    const offMute = window.electronAPI?.onMuteChanged((muted) => setIsMuted(muted))
    const offLang = window.electronAPI?.onLanguageChange((lang) => {
      setLanguageCode(lang)
    })
    const offConfirm = window.electronAPI?.onConfirmationRequest((req) => {
      setPendingConfirmation(req)
      window.electronAPI?.setClickThrough(false)
    })
    return () => {
      offMute?.()
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
  if (interactive) {
    ;(wrapperStyle as Record<string, unknown>).WebkitAppRegion = 'drag'
  }

  return (
    <div style={wrapperStyle} onMouseLeave={handleLeave}>
      <RobotScene
        state={robotState}
        isConnected={isConnected}
        velocityRef={velocityRef}
        onLoad={() => setIsModelLoaded(true)}
      />
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
