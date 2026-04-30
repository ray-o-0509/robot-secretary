export type ConfirmationRequest = {
  id: string
  action: string
  summary: string
  details: Record<string, string>
}

interface Props {
  request: ConfirmationRequest
  onRespond: (id: string, confirmed: boolean) => void
}

export function ConfirmationCard({ request, onRespond }: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        right: 16,
        background: 'rgba(15, 20, 35, 0.96)',
        backdropFilter: 'blur(18px)',
        border: '1px solid rgba(255, 160, 50, 0.55)',
        borderRadius: 14,
        padding: '14px 16px',
        color: '#eee',
        fontFamily: '-apple-system, "Helvetica Neue", sans-serif',
        fontSize: 13,
        boxShadow: '0 6px 32px rgba(0,0,0,0.7)',
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      <div style={{ color: '#ffb340', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', marginBottom: 6, textTransform: 'uppercase' }}>
        ⚠ 実行確認 — {request.action}
      </div>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>{request.summary}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 12 }}>
        {Object.entries(request.details).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
            <span style={{ color: '#888', minWidth: 50, flexShrink: 0 }}>{k}</span>
            <span style={{ color: '#ccc', wordBreak: 'break-all' }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onRespond(request.id, true)}
          style={{
            flex: 1, padding: '9px 0',
            background: 'rgba(220, 70, 50, 0.9)',
            border: 'none', borderRadius: 9,
            color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}
        >
          実行
        </button>
        <button
          onClick={() => onRespond(request.id, false)}
          style={{
            flex: 1, padding: '9px 0',
            background: 'rgba(70, 75, 100, 0.8)',
            border: 'none', borderRadius: 9,
            color: '#bbb', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}
