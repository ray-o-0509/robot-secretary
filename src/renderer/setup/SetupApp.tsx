import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCheck, LuX, LuAlertTriangle } from 'react-icons/lu'

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
  const { t } = useTranslation()
  const color = ok ? '#4ade80' : required ? '#f87171' : '#facc15'
  const Icon = ok ? LuCheck : required ? LuX : LuAlertTriangle

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
      <span style={{ color, width: 20, textAlign: 'center', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={16} />
      </span>
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
          {actionLabel ?? t('setup.openSettings')}
        </button>
      )}
    </div>
  )
}

export function SetupApp() {
  const { t } = useTranslation()
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
        <div style={{ padding: '28px 24px', color: '#64748b', fontSize: 13 }}>{t('setup.checking')}</div>
      </div>
    )
  }

  const micOk = status.micPermission === 'granted'
  const micDetail = status.micPermission === 'denied'
    ? t('setup.mic.denied')
    : status.micPermission === 'not-determined'
    ? t('setup.mic.notDetermined')
    : t('setup.mic.granted')

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
          {t('setup.header')}
        </div>
        <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
          {t('setup.subtitle')}
        </div>
      </div>

      {/* Scrollable body — ノードラッグ */}
      <div style={{ ...noDrag, flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
        {/* Required section */}
        <Section title={t('setup.required')} color="#f87171">
          <CheckRow
            label={t('setup.mic.label')}
            ok={micOk}
            required={true}
            detail={micDetail}
            actionLabel={t('setup.openSettings')}
            onAction={status.micPermission === 'denied'
              ? () => window.electronAPI.setupOpenSettings('microphone')
              : undefined}
          />
          <CheckRow
            label="Gemini API Key"
            ok={status.geminiApiKey}
            required={true}
            detail={status.geminiApiKey ? t('setup.geminiKey.set') : t('setup.geminiKey.unset')}
          />
        </Section>

        {/* Optional section */}
        <Section title={t('setup.optional')} color="#facc15">
          <CheckRow
            label={t('setup.accessibility.label')}
            ok={status.accessibilityPermission}
            required={false}
            detail={status.accessibilityPermission ? t('setup.accessibility.granted') : t('setup.accessibility.denied')}
            actionLabel={t('setup.openSettings')}
            onAction={() => window.electronAPI.setupOpenSettings('accessibility')}
          />
          <CheckRow
            label={`Gmail (${status.gmailAccounts.length})`}
            ok={status.gmailAccounts.length > 0}
            required={false}
            detail={status.gmailAccounts.length > 0
              ? status.gmailAccounts.join(', ')
              : t('setup.gmail.noTokens')}
          />
          <CheckRow
            label="TickTick"
            ok={status.ticktickToken}
            required={false}
            detail={status.ticktickToken ? t('setup.ticktick.set') : t('setup.ticktick.unset')}
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
            {launching ? t('setup.launching') : canLaunch ? t('setup.launch') : t('setup.checkRequired')}
          </button>

          {!canLaunch && (
            <div style={{ fontSize: 11, color: '#475569', textAlign: 'center', marginTop: 8 }}>
              {!micOk && !status.geminiApiKey
                ? t('setup.missingBoth')
                : !micOk
                ? t('setup.missingMic')
                : t('setup.missingKey')}
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
