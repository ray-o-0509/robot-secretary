import { CYAN, FONT_MONO } from '../styles'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import type { DashboardPayload, PanelPayload, ToolsData } from '../types'

const TAG_COLORS: Record<string, string> = {
  AI: '#b08aff',
  New: '#4cd49c',
  Trending: '#ff9c5a',
  Update: '#5aa6ff',
  Stable: '#a0a8b8',
}

interface Props {
  payload: PanelPayload
}

export function ToolsView({ payload }: Props) {
  if (payload.error) {
    return <ErrorState message={payload.error} hint="TURSO_DATABASE_URL を .env.local で確認" />
  }

  const wrap = payload.data as DashboardPayload<ToolsData> | null
  if (!wrap || 'error' in wrap) {
    return <ErrorState message={(wrap as { error: string } | null)?.error ?? '取得失敗'} />
  }
  const data = wrap.data
  const categories = data?.categories ?? []
  const total = categories.reduce((s, c) => s + (c.tools?.length ?? 0), 0)

  if (total === 0) {
    return <EmptyState message="ツールなし" />
  }

  return (
    <>
      {wrap.subtitle && (
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            letterSpacing: 1.5,
            color: 'rgba(0, 240, 255, 0.7)',
            marginBottom: 4,
          }}
        >
          {wrap.id} — {wrap.subtitle}
        </div>
      )}

      {categories.map((cat) => (
        <div key={cat.name} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1.5,
              color: CYAN,
              textShadow: `0 0 6px ${CYAN}80`,
              marginTop: 6,
            }}
          >
            ▸ {cat.name} ({cat.tools?.length ?? 0})
          </div>
          {(cat.tools ?? []).map((t, i) => (
            <Card key={`${cat.name}-${i}`} accent="cyan">
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                {t.url ? (
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#e8f6ff',
                      textDecoration: 'none',
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.name} ↗
                  </a>
                ) : (
                  <div
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#e8f6ff',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.name}
                  </div>
                )}
                {t.tag && <ToolTag tag={t.tag} />}
              </div>
              {t.tagline && (
                <div
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 11,
                    color: 'rgba(232, 246, 255, 0.85)',
                    marginBottom: t.why ? 4 : 0,
                    lineHeight: 1.5,
                  }}
                >
                  {t.tagline}
                </div>
              )}
              {t.why && (
                <div
                  style={{
                    paddingLeft: 10,
                    borderLeft: `2px solid ${CYAN}40`,
                    fontFamily: FONT_MONO,
                    fontSize: 10.5,
                    color: 'rgba(232, 246, 255, 0.55)',
                    lineHeight: 1.5,
                  }}
                >
                  {t.why}
                </div>
              )}
            </Card>
          ))}
        </div>
      ))}
    </>
  )
}

function ToolTag({ tag }: { tag: string }) {
  const color = TAG_COLORS[tag] ?? '#7fdfff'
  return (
    <span
      style={{
        flexShrink: 0,
        fontFamily: FONT_MONO,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        color,
        background: `${color}18`,
        padding: '2px 6px',
        border: `1px solid ${color}50`,
        textShadow: `0 0 6px ${color}60`,
      }}
    >
      {tag}
    </span>
  )
}
