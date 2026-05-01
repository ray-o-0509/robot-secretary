import { useState, useEffect, useCallback } from 'react'

type PermissionStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'

interface SetupStatus {
  micPermission: PermissionStatus
  accessibilityPermission: boolean
  geminiApiKey: boolean
  ticktickToken: boolean
  gmailAccounts: string[]
}

interface CheckRowProps {
  label: string
  ok: boolean
  required: boolean
  detail?: string
  actionLabel?: string
  onAction?: () => void
}

function CheckRow({ label, ok, required, detail, actionLabel, onAction }: CheckRowProps) {
  const color = ok ? '#4ade80' : required ? '#f87171' : '#facc15'
  const icon = ok ? '✓' : required ? '✗' : '⚠'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 14px',
      background: 'rgba(255,255,255,0.04)',
      borderRadius: 8,
      border: `1px solid ${ok ? 'rgba(74,222,128,0.2)' : required ? 'rgba(248,113,113,0.2)' : 'rgba(250,204,21,0.2)'}`,
    }}>
      <span style={{ fontSize: 16, color, width: 20, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>{label}</div>
        {detail && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{detail}</div>}
      </div>
      {!ok && onAction && (
        <button
          onClick={onAction}
          style={{
            fontSize: 11,
            padding: '4px 10px',
            background: 'rgba(99,102,241,0.2)',
            border: '1px solid rgba(99,102,241,0.5)',
            borderRadius: 5,
            color: '#a5b4fc',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {actionLabel ?? '設定を開く'}
        </button>
      )}
    </div>
  )
}

export function SetupApp() {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [launching, setLaunching] = useState(false)

  const refresh = useCallback(async () => {
    const s = await window.electronAPI.setupGetStatus()
    setStatus(s as SetupStatus)
  }, [])

  useEffect(() => {
    refresh()
    // 権限変更を検知するため定期リフレッシュ
    const id = setInterval(refresh, 2000)
    return () => clearInterval(id)
  }, [refresh])

  const canLaunch = status
    ? (status.micPermission === 'granted' && status.geminiApiKey)
    : false

  const handleLaunch = async () => {
    setLaunching(true)
    await window.electronAPI.setupLaunch()
  }

  if (!status) {
    return (
      <div style={containerStyle}>
        <div style={{ padding: '28px 24px', color: '#64748b', fontSize: 13 }}>確認中...</div>
      </div>
    )
  }

  const micOk = status.micPermission === 'granted'
  const micDetail = status.micPermission === 'denied'
    ? 'システム設定で許可してください'
    : status.micPermission === 'not-determined'
    ? 'ダイアログが表示されたら「OK」を押してください'
    : '許可済み'

  // ノードラッグ領域（ボタン・入力など操作が必要な要素）
  const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

  return (
    <div style={containerStyle}>
      {/* Header — ドラッグ可能 */}
      <div style={{ padding: '20px 24px 16px', flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: '#6366f1', letterSpacing: '0.15em', fontFamily: 'monospace', marginBottom: 6 }}>
          ROBOT SECRETARY // SETUP
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>
          起動前チェック
        </div>
        <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
          必要な権限とAPIキーを確認してください
        </div>
      </div>

      {/* Scrollable body — ノードラッグ */}
      <div style={{ ...noDrag, flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
        {/* Required section */}
        <Section title="必須" color="#f87171">
          <CheckRow
            label="マイク権限"
            ok={micOk}
            required={true}
            detail={micDetail}
            actionLabel="設定を開く"
            onAction={status.micPermission === 'denied'
              ? () => window.electronAPI.setupOpenSettings('microphone')
              : undefined}
          />
          <CheckRow
            label="Gemini API Key"
            ok={status.geminiApiKey}
            required={true}
            detail={status.geminiApiKey ? '設定済み (.env.local)' : '.env.local に GEMINI_API_KEY を設定してください'}
          />
        </Section>

        {/* Optional section */}
        <Section title="オプション" color="#facc15">
          <CheckRow
            label="Accessibility（PTTホットキー）"
            ok={status.accessibilityPermission}
            required={false}
            detail={status.accessibilityPermission ? '許可済み' : 'Optionキーでの音声入力が使えません'}
            actionLabel="設定を開く"
            onAction={() => window.electronAPI.setupOpenSettings('accessibility')}
          />
          <CheckRow
            label={`Gmail（${status.gmailAccounts.length}アカウント）`}
            ok={status.gmailAccounts.length > 0}
            required={false}
            detail={status.gmailAccounts.length > 0
              ? status.gmailAccounts.join(', ')
              : '~/.config/gmail-triage/tokens/ にトークンがありません'}
          />
          <CheckRow
            label="TickTick"
            ok={status.ticktickToken}
            required={false}
            detail={status.ticktickToken ? '設定済み' : '.env.local に TICKTICK_ACCESS_TOKEN を設定してください'}
          />
        </Section>

        {/* Launch button */}
        <div style={{ marginTop: 8 }}>
          <button
            onClick={handleLaunch}
            disabled={!canLaunch || launching}
            style={{
              width: '100%',
              padding: '12px 0',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.1em',
              fontFamily: 'monospace',
              borderRadius: 8,
              border: 'none',
              cursor: canLaunch && !launching ? 'pointer' : 'not-allowed',
              background: canLaunch
                ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                : 'rgba(100,100,120,0.3)',
              color: canLaunch ? '#fff' : '#475569',
              transition: 'opacity 0.2s',
              opacity: launching ? 0.6 : 1,
            }}
          >
            {launching ? 'LAUNCHING...' : canLaunch ? 'LAUNCH' : '必須項目を確認してください'}
          </button>

          {!canLaunch && (
            <div style={{ fontSize: 11, color: '#475569', textAlign: 'center', marginTop: 8 }}>
              {!micOk && !status.geminiApiKey
                ? 'マイク権限とGemini APIキーが必要です'
                : !micOk
                ? 'マイク権限が必要です'
                : 'Gemini APIキーが必要です'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.12em',
        color,
        fontFamily: 'monospace',
        marginBottom: 8,
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background: 'linear-gradient(160deg, #0a0a14 0%, #0f1020 100%)',
  color: '#e2e8f0',
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  // ウィンドウ全体をドラッグ可能にする
  WebkitAppRegion: 'drag',
} as React.CSSProperties
