import { useTranslation } from 'react-i18next'
import { LuMapPin } from 'react-icons/lu'
import { CYAN, FONT_MONO, MAGENTA } from '../styles'
import { EmptyState } from '../components/EmptyState'
import type { PanelPayload, TerminalOutputData } from '../types'

interface Props {
  payload: PanelPayload
}

export function TerminalView({ payload }: Props) {
  const { t } = useTranslation()
  const d = payload.data as TerminalOutputData | null

  if (!d) {
    return <EmptyState message={t('terminal.noOutput')} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          padding: '8px 12px',
          fontFamily: FONT_MONO,
          fontSize: 12,
          color: CYAN,
          background: 'rgba(0, 240, 255, 0.07)',
          border: `1px solid rgba(0, 240, 255, 0.3)`,
          clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
          wordBreak: 'break-all',
        }}
      >
        <span style={{ opacity: 0.6, marginRight: 6 }}>$</span>
        <span style={{ textShadow: `0 0 6px ${CYAN}` }}>{d.command}</span>
      </div>

      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 10,
          color: 'rgba(0, 240, 255, 0.5)',
          letterSpacing: 0.8,
          paddingLeft: 2,
        }}
      >
        <LuMapPin size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />{d.cwd}
      </div>

      {d.stdout ? (
        <pre
          style={{
            margin: 0,
            padding: '10px 12px',
            fontFamily: FONT_MONO,
            fontSize: 11,
            lineHeight: 1.6,
            color: '#e8f6ff',
            background: 'rgba(4, 8, 18, 0.95)',
            border: '1px solid rgba(0, 240, 255, 0.15)',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {d.stdout}
        </pre>
      ) : null}

      {d.stderr ? (
        <pre
          style={{
            margin: 0,
            padding: '10px 12px',
            fontFamily: FONT_MONO,
            fontSize: 11,
            lineHeight: 1.6,
            color: '#ffd0d0',
            background: 'rgba(28, 4, 4, 0.95)',
            border: `1px solid rgba(255, 43, 214, 0.3)`,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 160,
            overflowY: 'auto',
          }}
        >
          <span style={{ color: MAGENTA, fontWeight: 700, display: 'block', marginBottom: 4 }}>stderr</span>
          {d.stderr}
        </pre>
      ) : null}

      {!d.stdout && !d.stderr && (
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            color: 'rgba(0, 240, 255, 0.4)',
            padding: '8px 2px',
          }}
        >
          {t('terminal.emptyOutput')}
        </div>
      )}
    </div>
  )
}
