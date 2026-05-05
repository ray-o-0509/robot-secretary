import { useState, type CSSProperties } from 'react'

type DraggableStyle = CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' }

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
      <img
        src="assets/icon.png"
        alt="Robot Secretary"
        style={{ width: 72, height: 72, borderRadius: 16 }}
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
          gap: 8,
          background: loading ? '#334155' : '#4f46e5',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '10px 20px',
          fontSize: 14,
          fontWeight: 500,
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s',
        } as DraggableStyle}
      >
        {loading ? 'ブラウザで認証中...' : 'Googleでサインイン'}
      </button>
    </div>
  )
}
