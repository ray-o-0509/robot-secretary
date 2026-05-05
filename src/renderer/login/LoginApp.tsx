import { useState, type CSSProperties } from 'react'

type DraggableStyle = CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' }

const LOGIN_STYLES = `
@keyframes login-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes login-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}
`

export function LoginApp() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      if (!window.electronAPI) throw new Error('アプリの初期化に失敗しました。再起動してください。')
      await window.electronAPI.authLogin()
    } catch (e) {
      setError((e as Error).message ?? 'ログインに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#0a0a14',
      color: '#e2e8f0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
      gap: 24,
      userSelect: 'none',
      WebkitAppRegion: 'drag',
    } as DraggableStyle}>
      <style>{LOGIN_STYLES}</style>

      <img
        src="assets/icon.png"
        alt="Robot Secretary"
        style={{
          width: 72,
          height: 72,
          borderRadius: 16,
          animation: loading ? 'login-pulse 1.2s ease-in-out infinite' : undefined,
        }}
      />
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#a5b4fc' }}>
        Robot Secretary
      </h1>
      <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', textAlign: 'center', maxWidth: 280 }}>
        Googleアカウントでサインインして<br />すべての設定とデータを同期します
      </p>

      {error && (
        <p style={{ margin: 0, fontSize: 12, color: '#f87171', textAlign: 'center', maxWidth: 280 }}>
          {error}
        </p>
      )}

      <button
        onClick={handleLogin}
        disabled={loading}
        style={{
          WebkitAppRegion: 'no-drag',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: loading ? '#1e2340' : '#4f46e5',
          color: '#fff',
          border: loading ? '1px solid #4f46e580' : 'none',
          borderRadius: 8,
          padding: '10px 20px',
          fontSize: 14,
          fontWeight: 500,
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s, border-color 0.2s',
          minWidth: 200,
          justifyContent: 'center',
        } as DraggableStyle}
      >
        {loading && (
          <span
            style={{
              display: 'inline-block',
              width: 14,
              height: 14,
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.2)',
              borderTopColor: '#a5b4fc',
              animation: 'login-spin 0.8s linear infinite',
              flexShrink: 0,
            }}
          />
        )}
        {loading ? 'ブラウザで認証中...' : 'Googleでサインイン'}
      </button>
    </div>
  )
}
