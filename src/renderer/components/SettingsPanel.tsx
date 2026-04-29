import { useState } from 'react'

interface Props {
  onClose: () => void
}

export function SettingsPanel({ onClose }: Props) {
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('GEMINI_API_KEY') ?? '')
  const [slackToken, setSlackToken] = useState(localStorage.getItem('SLACK_BOT_TOKEN') ?? '')
  const [autoConnect, setAutoConnect] = useState(localStorage.getItem('AUTO_CONNECT_ON_STARTUP') !== 'false')

  function save() {
    localStorage.setItem('GEMINI_API_KEY', geminiKey)
    localStorage.setItem('SLACK_BOT_TOKEN', slackToken)
    localStorage.setItem('AUTO_CONNECT_ON_STARTUP', String(autoConnect))
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(10,10,20,0.92)',
      backdropFilter: 'blur(12px)',
      color: '#eee',
      fontFamily: '-apple-system, sans-serif',
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      overflowY: 'auto',
      borderRadius: 16,
    }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: '#adf' }}>設定</h2>

      {[
        { label: 'Gemini API Key', value: geminiKey, set: setGeminiKey },
        { label: 'Slack Bot Token', value: slackToken, set: setSlackToken },
      ].map(({ label, value, set }) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#999' }}>{label}</label>
          <input
            type="password"
            value={value}
            onChange={(e) => set(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              color: '#eee',
              padding: '6px 10px',
              fontSize: 12,
              outline: 'none',
            }}
          />
        </div>
      ))}

      <label style={{ fontSize: 12, color: '#bbb', display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={autoConnect} onChange={(e)=>setAutoConnect(e.target.checked)} />
        起動時に自動でGemini Liveへ接続する
      </label>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={save} style={btnStyle('#4af')}>保存</button>
        <button onClick={onClose} style={btnStyle('#555')}>キャンセル</button>
      </div>

      <p style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
        Google認証（Gmail/Calendar）は .env ファイルで設定してください
      </p>
    </div>
  )
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    flex: 1,
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '8px 0',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  }
}
