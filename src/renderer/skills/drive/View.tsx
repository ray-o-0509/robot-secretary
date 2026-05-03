import { CYAN, FONT_MONO, MAGENTA } from '../../display/styles'
import { Card } from '../../display/components/Card'
import { EmptyState } from '../../display/components/EmptyState'
import { ErrorState } from '../../display/components/ErrorState'
import type { PanelPayload } from '../../display/types'

type DriveFile = {
  id: string
  name: string
  mimeType: string
  modifiedTime: string | null
  owners: string[]
  webViewLink: string | null
  size: number | null
  isFolder: boolean
  account: string
}

type DriveData = {
  account: string
  files: DriveFile[]
  query?: string
  error?: string
}

interface Props {
  payload: PanelPayload
}

export function DriveView({ payload }: Props) {
  if (payload.error) return <ErrorState message={payload.error} />

  const data = payload.data as DriveData | null
  if (!data) return <EmptyState message="NO DATA" />
  if (data.error) return <ErrorState message={data.error} />

  if (data.files.length === 0) {
    return (
      <>
        <DriveHeader account={data.account} count={0} query={data.query} />
        <EmptyState message={data.query ? `NO MATCHES FOR "${data.query}"` : 'DRIVE IS EMPTY'} />
      </>
    )
  }

  return (
    <>
      <DriveHeader account={data.account} count={data.files.length} query={data.query} />
      {data.files.map((f) => (
        <FileCard key={f.id} file={f} />
      ))}
    </>
  )
}

function DriveHeader({ account, count, query }: { account: string; count: number; query?: string }) {
  return (
    <div
      style={{
        fontFamily: FONT_MONO,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1.5,
        color: CYAN,
        textShadow: `0 0 6px ${CYAN}80`,
        opacity: 0.9,
        marginTop: 6,
      }}
    >
      ▸ {account} {query ? `// "${query}"` : ''} ({count})
    </div>
  )
}

function FileCard({ file }: { file: DriveFile }) {
  const open = () => {
    if (file.webViewLink) window.electronAPI?.openUrl(file.webViewLink)
  }
  return (
    <button
      onClick={open}
      title={file.webViewLink ?? ''}
      disabled={!file.webViewLink}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        margin: 0,
        textAlign: 'left',
        cursor: file.webViewLink ? 'pointer' : 'default',
        width: '100%',
        display: 'block',
      }}
    >
      <Card accent="cyan">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 4,
          }}
        >
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11.5,
              fontWeight: 700,
              color: '#e8f6ff',
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {fileIcon(file)} {file.name}
          </div>
          <span
            style={{
              flexShrink: 0,
              fontFamily: FONT_MONO,
              fontSize: 9.5,
              color: MAGENTA,
              opacity: 0.85,
            }}
          >
            {formatModified(file.modifiedTime)}
          </span>
        </div>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: 'rgba(232, 246, 255, 0.55)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {humanMime(file.mimeType)}
            {file.owners.length > 0 ? ` · ${file.owners[0]}` : ''}
          </span>
          {file.size != null && <span style={{ flexShrink: 0 }}>{humanSize(file.size)}</span>}
        </div>
      </Card>
    </button>
  )
}

function fileIcon(f: DriveFile): string {
  if (f.isFolder) return '📁'
  if (f.mimeType.startsWith('application/vnd.google-apps.document')) return '📄'
  if (f.mimeType.startsWith('application/vnd.google-apps.spreadsheet')) return '📊'
  if (f.mimeType.startsWith('application/vnd.google-apps.presentation')) return '🎞'
  if (f.mimeType === 'application/pdf') return '📕'
  if (f.mimeType.startsWith('image/')) return '🖼'
  if (f.mimeType.startsWith('video/')) return '🎬'
  if (f.mimeType.startsWith('audio/')) return '🎵'
  if (f.mimeType.startsWith('text/')) return '📝'
  return '📎'
}

function humanMime(mime: string): string {
  if (mime === 'application/vnd.google-apps.folder') return 'Folder'
  if (mime === 'application/vnd.google-apps.document') return 'Google Docs'
  if (mime === 'application/vnd.google-apps.spreadsheet') return 'Google Sheets'
  if (mime === 'application/vnd.google-apps.presentation') return 'Google Slides'
  if (mime === 'application/pdf') return 'PDF'
  if (mime.startsWith('application/vnd.google-apps.')) return mime.slice('application/vnd.google-apps.'.length)
  return mime
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatModified(raw: string | null): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}
