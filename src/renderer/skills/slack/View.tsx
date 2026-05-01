import { CYAN, FONT_MONO } from '../../display/styles'
import { Card } from '../../display/components/Card'
import { EmptyState } from '../../display/components/EmptyState'
import { ErrorState } from '../../display/components/ErrorState'
import type { PanelPayload } from '../../display/types'

type SlackData = Array<{
  channel: string
  messages: Array<{ text?: string; user?: string }>
}>

interface Props {
  payload: PanelPayload
}

export function SlackView({ payload }: Props) {
  if (payload.error) {
    return (
      <ErrorState
        message={payload.error}
        hint="SLACK_BOT_TOKEN を .env.local で確認しろ"
      />
    )
  }

  const data = payload.data as SlackData
  if (!data || data.length === 0) {
    return <EmptyState message="未読 Slack なし。静かでいいな" />
  }

  return (
    <>
      {data.map((group) => (
        <div key={group.channel} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
            ▸ #{group.channel} ({group.messages.length})
          </div>
          {group.messages.map((m, i) => (
            <Card key={`${group.channel}-${i}`} accent="cyan">
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  color: 'rgba(0, 240, 255, 0.7)',
                  marginBottom: 4,
                }}
              >
                {m.user ? `@${m.user}` : '(unknown)'}
              </div>
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  color: '#e8f6ff',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {m.text || '(本文なし)'}
              </div>
            </Card>
          ))}
        </div>
      ))}
    </>
  )
}
