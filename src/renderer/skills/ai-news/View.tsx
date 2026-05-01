import { useTranslation } from 'react-i18next'
import { CYAN, FONT_MONO, MAGENTA } from '../../display/styles'
import { Card } from '../../display/components/Card'
import { EmptyState } from '../../display/components/EmptyState'
import { ErrorState } from '../../display/components/ErrorState'
import type { DashboardPayload, NewsData, PanelPayload } from '../../display/types'

const TAG_COLORS: Record<string, string> = {
  Model: '#5aa6ff',
  Product: '#b08aff',
  Research: '#4cd49c',
  Infra: '#ff9c5a',
  Business: '#ffc83c',
  Policy: '#ff5a7a',
  Japan: '#ff5a5a',
}

interface Props {
  payload: PanelPayload
}

export function NewsView({ payload }: Props) {
  const { t } = useTranslation()

  if (payload.error) {
    return <ErrorState message={payload.error} hint={t('news.dbHint')} />
  }

  const wrap = payload.data as DashboardPayload<NewsData> | null
  if (!wrap || 'error' in wrap) {
    return <ErrorState message={(wrap as { error: string } | null)?.error ?? t('news.fetchFailed')} />
  }
  const data = wrap.data

  if (!data?.items || data.items.length === 0) {
    return <EmptyState message={t('news.noNews')} />
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

      {data.highlight && (
        <div
          style={{
            padding: '12px 14px',
            fontFamily: FONT_MONO,
            fontSize: 11,
            lineHeight: 1.6,
            color: '#e8f6ff',
            background: 'rgba(255, 43, 214, 0.08)',
            border: `1px solid ${MAGENTA}80`,
            boxShadow: `0 0 14px rgba(255, 43, 214, 0.2)`,
            clipPath:
              'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
            marginBottom: 6,
          }}
        >
          <div style={{ color: MAGENTA, textShadow: `0 0 6px ${MAGENTA}`, fontWeight: 700, marginBottom: 4, fontSize: 9.5, letterSpacing: 2 }}>
            ◢ HIGHLIGHT
          </div>
          {data.highlight}
        </div>
      )}

      {data.items.map((item, i) => (
        <Card key={i} accent="cyan">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 9.5,
                color: 'rgba(232, 246, 255, 0.5)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            {item.tag && <NewsTag tag={item.tag} />}
          </div>

          {item.image && (
            <div style={{ marginBottom: 8, borderRadius: 4, overflow: 'hidden' }}>
              <img
                src={item.image}
                alt=""
                style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
            </div>
          )}

          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 12,
              fontWeight: 700,
              color: '#e8f6ff',
              marginBottom: 4,
              lineHeight: 1.4,
            }}
          >
            {item.title}
          </div>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              color: 'rgba(232, 246, 255, 0.85)',
              lineHeight: 1.55,
            }}
          >
            {item.summary}
          </div>
          {item.detail && (
            <div
              style={{
                marginTop: 8,
                paddingLeft: 10,
                borderLeft: `2px solid ${CYAN}40`,
                fontFamily: FONT_MONO,
                fontSize: 10.5,
                color: 'rgba(232, 246, 255, 0.6)',
                lineHeight: 1.55,
              }}
            >
              {item.detail}
            </div>
          )}
          {item.source?.url && (
            <a
              href={item.source.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                marginTop: 8,
                fontFamily: FONT_MONO,
                fontSize: 10,
                color: CYAN,
                textShadow: `0 0 6px ${CYAN}80`,
                textDecoration: 'none',
                letterSpacing: 0.5,
              }}
            >
              ▸ {item.source.name} ↗
            </a>
          )}
        </Card>
      ))}
    </>
  )
}

function NewsTag({ tag }: { tag: string }) {
  const color = TAG_COLORS[tag] ?? '#7fdfff'
  return (
    <span
      style={{
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
