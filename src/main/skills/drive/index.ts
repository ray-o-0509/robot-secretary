import { google, type drive_v3 } from 'googleapis'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { homedir } from 'node:os'
import { getGoogleAuth, listAccounts } from '../shared/googleAuth'

type DriveFile = {
  id: string
  name: string
  mimeType: string
  modifiedTime: string | null
  owners: string[]
  webViewLink: string | null
  size: number | null
  parents: string[]
  isFolder: boolean
  account: string
}

const FILE_FIELDS =
  'id,name,mimeType,modifiedTime,owners(displayName,emailAddress),webViewLink,size,parents'

function toDriveFile(account: string, f: drive_v3.Schema$File): DriveFile {
  return {
    id: f.id ?? '',
    name: f.name ?? '(no name)',
    mimeType: f.mimeType ?? 'application/octet-stream',
    modifiedTime: f.modifiedTime ?? null,
    owners: (f.owners ?? []).map((o) => o.displayName ?? o.emailAddress ?? ''),
    webViewLink: f.webViewLink ?? null,
    size: f.size ? Number(f.size) : null,
    parents: f.parents ?? [],
    isFolder: f.mimeType === 'application/vnd.google-apps.folder',
    account,
  }
}

function getDriveClient(account?: string) {
  const acc = account ?? listAccounts()[0]
  if (!acc) throw new Error('No Google account registered')
  const auth = getGoogleAuth(acc)
  return { drive: google.drive({ version: 'v3', auth }), account: acc }
}

// Drive query strings interpolate user-supplied values; escape single quotes to prevent injection.
function escapeDriveQuery(s: string): string {
  return s.replace(/'/g, "\\'")
}

async function listFiles(opts: { account?: string; pageSize: number; orderBy: string; q: string }) {
  const { drive, account: acc } = getDriveClient(opts.account)
  const res = await drive.files.list({
    pageSize: Math.max(1, Math.min(100, opts.pageSize)),
    orderBy: opts.orderBy,
    q: opts.q,
    fields: `nextPageToken,files(${FILE_FIELDS})`,
  })
  return {
    account: acc,
    files: (res.data.files ?? []).map((f) => toDriveFile(acc, f)),
    truncated: Boolean(res.data.nextPageToken),
  }
}

export async function listRecentDriveFiles(maxResults = 30, account?: string) {
  return listFiles({
    account,
    pageSize: maxResults,
    orderBy: 'modifiedTime desc',
    q: 'trashed = false',
  })
}

export async function listDriveFolder(opts: {
  folderId: string
  maxResults?: number
  account?: string
}) {
  const result = await listFiles({
    account: opts.account,
    pageSize: opts.maxResults ?? 100,
    orderBy: 'folder,name',
    q: `'${escapeDriveQuery(opts.folderId)}' in parents and trashed = false`,
  })
  return { ...result, folderId: opts.folderId }
}

export async function searchDriveFiles(opts: {
  query: string
  mimeType?: string
  maxResults?: number
  account?: string
}) {
  const safe = escapeDriveQuery(opts.query)
  const clauses = ['trashed = false', `(name contains '${safe}' or fullText contains '${safe}')`]
  if (opts.mimeType) clauses.push(`mimeType = '${escapeDriveQuery(opts.mimeType)}'`)
  const result = await listFiles({
    account: opts.account,
    pageSize: opts.maxResults ?? 30,
    orderBy: 'modifiedTime desc',
    q: clauses.join(' and '),
  })
  return { ...result, query: opts.query }
}

const EXPORT_MAP: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
}

const TEXTUAL_MIME_RE = /^(text\/|application\/(json|xml|x-yaml|yaml|javascript))/

const READ_MAX_BYTES = 256 * 1024 // truncate to 256 KB to keep voice loop bounded

export async function readDriveFile(fileId: string, account?: string) {
  const { drive, account: acc } = getDriveClient(account)
  const meta = await drive.files.get({
    fileId,
    fields: 'id,name,mimeType,size,webViewLink,modifiedTime',
  })
  const mime = meta.data.mimeType ?? ''
  const exportMime = EXPORT_MAP[mime]

  let content: string
  let exportedAs: string | null = null
  let truncated = false

  if (exportMime) {
    const res = await drive.files.export(
      { fileId, mimeType: exportMime },
      { responseType: 'text' },
    )
    content = String(res.data ?? '')
    exportedAs = exportMime
  } else if (TEXTUAL_MIME_RE.test(mime)) {
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'text' },
    )
    content = String(res.data ?? '')
  } else {
    return {
      id: fileId,
      name: meta.data.name ?? '',
      mimeType: mime,
      account: acc,
      webViewLink: meta.data.webViewLink ?? null,
      content: null,
      error: `Cannot read binary mimeType "${mime}" as text. Open the file in Drive instead.`,
    }
  }

  if (content.length > READ_MAX_BYTES) {
    content = content.slice(0, READ_MAX_BYTES)
    truncated = true
  }

  return {
    id: fileId,
    name: meta.data.name ?? '',
    mimeType: mime,
    exportedAs,
    truncated,
    account: acc,
    webViewLink: meta.data.webViewLink ?? null,
    content,
  }
}

export async function createDriveFile(opts: {
  name: string
  content: string
  mimeType?: string
  parentId?: string
  account?: string
}) {
  const { drive, account: acc } = getDriveClient(opts.account)
  const mimeType = opts.mimeType ?? 'text/plain'
  const res = await drive.files.create({
    requestBody: {
      name: opts.name,
      mimeType,
      ...(opts.parentId ? { parents: [opts.parentId] } : {}),
    },
    media: { mimeType, body: opts.content },
    fields: FILE_FIELDS,
  })
  return { ok: true, account: acc, file: toDriveFile(acc, res.data) }
}

export async function uploadDriveFile(opts: {
  localPath: string
  name?: string
  parentId?: string
  account?: string
}) {
  const expanded = opts.localPath.startsWith('~')
    ? path.join(homedir(), opts.localPath.slice(1))
    : opts.localPath
  let stat: fs.Stats
  try {
    stat = fs.statSync(expanded)
  } catch {
    throw new Error(`File not found: ${expanded}`)
  }
  if (!stat.isFile()) throw new Error(`Not a file: ${expanded}`)

  const { drive, account: acc } = getDriveClient(opts.account)
  const name = opts.name ?? path.basename(expanded)
  const { requireConfirmation } = await import('../confirmation/index')
  const confirmed = await requireConfirmation({
    action: 'Upload local file to Drive',
    summary: `Upload "${expanded}" to Google Drive as "${name}"`,
    details: {
      Account: acc,
      'Local path': expanded,
      Name: name,
      Size: `${stat.size} bytes`,
      Destination: opts.parentId ? `Folder ${opts.parentId}` : 'My Drive root',
    },
  })
  if (!confirmed) return { ok: false, cancelled: true as const, account: acc }

  // Drive infers mimeType from upload by default; we leave it unset
  const res = await drive.files.create({
    requestBody: {
      name,
      ...(opts.parentId ? { parents: [opts.parentId] } : {}),
    },
    media: { body: fs.createReadStream(expanded) },
    fields: FILE_FIELDS,
  })
  return { ok: true, account: acc, file: toDriveFile(acc, res.data) }
}

export async function moveDriveItem(opts: {
  fileId: string
  newParentId: string
  account?: string
}) {
  const { drive, account: acc } = getDriveClient(opts.account)
  const meta = await drive.files.get({ fileId: opts.fileId, fields: 'parents,name' })
  const oldParents = (meta.data.parents ?? []).join(',')
  const res = await drive.files.update({
    fileId: opts.fileId,
    addParents: opts.newParentId,
    removeParents: oldParents || undefined,
    fields: FILE_FIELDS,
  })
  return { ok: true, account: acc, file: toDriveFile(acc, res.data) }
}

export async function copyDriveItem(opts: {
  fileId: string
  newName?: string
  parentId?: string
  account?: string
}) {
  const { drive, account: acc } = getDriveClient(opts.account)
  const res = await drive.files.copy({
    fileId: opts.fileId,
    requestBody: {
      ...(opts.newName ? { name: opts.newName } : {}),
      ...(opts.parentId ? { parents: [opts.parentId] } : {}),
    },
    fields: FILE_FIELDS,
  })
  return { ok: true, account: acc, file: toDriveFile(acc, res.data) }
}

// Trash only — recoverable for 30 days, then Drive purges. No permanent delete.
export async function trashDriveItem(opts: { fileId: string; account?: string }) {
  const { drive, account: acc } = getDriveClient(opts.account)
  const res = await drive.files.update({
    fileId: opts.fileId,
    requestBody: { trashed: true },
    fields: 'id,name,trashed',
  })
  return {
    ok: true,
    account: acc,
    id: res.data.id ?? opts.fileId,
    name: res.data.name ?? '',
    trashed: res.data.trashed ?? true,
  }
}

export async function shareDriveItem(opts: {
  fileId: string
  email: string
  role: 'reader' | 'commenter' | 'writer'
  account?: string
}) {
  const { requireConfirmation } = await import('../confirmation/index')
  const { drive, account: acc } = getDriveClient(opts.account)
  const meta = await drive.files.get({ fileId: opts.fileId, fields: 'name,webViewLink' })

  const confirmed = await requireConfirmation({
    action: 'Share Drive item',
    summary: `Share "${meta.data.name ?? opts.fileId}" with ${opts.email}`,
    details: { Role: opts.role, File: meta.data.name ?? '', To: opts.email },
  })
  if (!confirmed) return { ok: false, cancelled: true as const }

  await drive.permissions.create({
    fileId: opts.fileId,
    sendNotificationEmail: true,
    requestBody: { type: 'user', role: opts.role, emailAddress: opts.email },
  })
  return {
    ok: true as const,
    account: acc,
    fileId: opts.fileId,
    name: meta.data.name ?? '',
    webViewLink: meta.data.webViewLink ?? null,
    sharedWith: opts.email,
    role: opts.role,
  }
}
