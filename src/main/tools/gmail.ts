import { google, type gmail_v1 } from 'googleapis'
import { getGoogleAuth, listAccounts } from './googleAuth'

type InboxEmail = {
  id: string
  account: string
  from: string
  subject: string
  date: string
  snippet: string | null | undefined
}

async function getInboxFor(account: string, maxResults: number): Promise<InboxEmail[]> {
  const auth = getGoogleAuth(account)
  const gmail = google.gmail({ version: 'v1', auth })

  const list = await gmail.users.messages.list({
    userId: 'me',
    q: 'in:inbox -in:spam -in:trash',
    maxResults,
  })

  const messages = list.data.messages ?? []
  const results: InboxEmail[] = []

  for (const msg of messages) {
    if (!msg.id) continue
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date'],
    })
    const headers = detail.data.payload?.headers ?? []
    const get = (name: string) => headers.find((h) => h.name === name)?.value ?? ''

    results.push({
      id: msg.id,
      account,
      from: get('From'),
      subject: get('Subject'),
      date: get('Date'),
      snippet: detail.data.snippet,
    })
  }

  return results
}

export async function getInboxEmails(maxResults = 100, account?: string) {
  const accounts = account ? [account] : listAccounts()
  const perAccount = await Promise.all(
    accounts.map(async (a) => {
      try {
        return { account: a, messages: await getInboxFor(a, maxResults), error: null as string | null }
      } catch (err) {
        return { account: a, messages: [] as InboxEmail[], error: String(err instanceof Error ? err.message : err) }
      }
    }),
  )
  return {
    accounts: perAccount.map(({ account, messages, error }) => ({ account, error, count: messages.length })),
    messages: perAccount.flatMap((p) => p.messages),
  }
}

// メッセージをゴミ箱に送る (30日後にGoogle側で自動削除、それまでは復元可)
export async function trashEmails(account: string, ids: string[]) {
  const auth = getGoogleAuth(account)
  const gmail = google.gmail({ version: 'v1', auth })
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        await gmail.users.messages.trash({ userId: 'me', id })
        return { id, ok: true as const }
      } catch (err) {
        return { id, ok: false as const, error: String(err instanceof Error ? err.message : err) }
      }
    }),
  )
  return { account, results }
}

function extractBody(part: gmail_v1.Schema$MessagePart | undefined): { html?: string; text?: string } {
  const out: { html?: string; text?: string } = {}
  if (!part) return out
  const walk = (p: gmail_v1.Schema$MessagePart) => {
    const data = p.body?.data
    const mime = p.mimeType ?? ''
    if (data) {
      const decoded = Buffer.from(data, 'base64url').toString('utf-8')
      if (mime === 'text/html' && !out.html) out.html = decoded
      else if (mime === 'text/plain' && !out.text) out.text = decoded
    }
    for (const child of p.parts ?? []) walk(child)
  }
  walk(part)
  return out
}

export async function getEmailDetail(account: string, id: string) {
  const auth = getGoogleAuth(account)
  const gmail = google.gmail({ version: 'v1', auth })
  const detail = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
  const headers = detail.data.payload?.headers ?? []
  const get = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
  const body = extractBody(detail.data.payload)
  return {
    id,
    account,
    from: get('From'),
    to: get('To'),
    cc: get('Cc'),
    subject: get('Subject'),
    date: get('Date'),
    snippet: detail.data.snippet ?? '',
    html: body.html ?? null,
    text: body.text ?? null,
  }
}

// INBOX ラベルを外す (アーカイブ。メール自体は残る)
export async function archiveEmails(account: string, ids: string[]) {
  if (ids.length === 0) return { account, modified: 0 }
  const auth = getGoogleAuth(account)
  const gmail = google.gmail({ version: 'v1', auth })
  await gmail.users.messages.batchModify({
    userId: 'me',
    requestBody: { ids, removeLabelIds: ['INBOX'] },
  })
  return { account, modified: ids.length }
}
