import { google, type gmail_v1 } from 'googleapis'
import { getGoogleAuth, listAccounts, sanitizeGoogleError } from '../shared/googleAuth'

type InboxEmail = {
  id: string
  threadId: string
  account: string
  from: string
  subject: string
  date: string
  snippet: string | null | undefined
}

async function getActualEmail(auth: ReturnType<typeof getGoogleAuth>): Promise<string> {
  const gmail = google.gmail({ version: 'v1', auth })
  const profile = await gmail.users.getProfile({ userId: 'me' })
  return profile.data.emailAddress ?? ''
}

async function getInboxFor(account: string, maxResults: number): Promise<{ actualAccount: string; messages: InboxEmail[] }> {
  const auth = getGoogleAuth(account)
  const gmail = google.gmail({ version: 'v1', auth })

  // 実際の認証済みアカウントを取得（トークンファイル名と異なる場合がある）
  const actualAccount = await getActualEmail(auth)

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
      threadId: detail.data.threadId ?? msg.id,
      account: actualAccount,
      from: get('From'),
      subject: get('Subject'),
      date: get('Date'),
      snippet: detail.data.snippet,
    })
  }

  return { actualAccount, messages: results }
}

export async function getInboxEmails(maxResults = 100, account?: string) {
  const accounts = account ? [account] : listAccounts()
  const perAccount = await Promise.all(
    accounts.map(async (a) => {
      try {
        const { actualAccount, messages } = await getInboxFor(a, maxResults)
        return { account: actualAccount, messages, error: null as string | null }
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err)
        console.error(`[get_gmail_inbox] error: ${a} →`, raw)
        return { account: a, messages: [] as InboxEmail[], error: sanitizeGoogleError(err) }
      }
    }),
  )

  // 重複アカウント（トークンファイルが同じGoogleアカウントを指す場合）を除外
  const seen = new Set<string>()
  const deduped = perAccount.filter(({ account }) => {
    if (seen.has(account)) return false
    seen.add(account)
    return true
  })

  return {
    accounts: deduped.map(({ account, messages, error }) => ({ account, error, count: messages.length })),
    messages: deduped.flatMap((p) => p.messages),
  }
}

export async function searchEmails(query: string, maxResults = 20, account?: string) {
  const accounts = account ? [account] : listAccounts()
  const seen = new Set<string>()
  const perAccount = await Promise.all(
    accounts.map(async (a) => {
      try {
        const auth = getGoogleAuth(a)
        const gmail = google.gmail({ version: 'v1', auth })
        const actualAccount = await getActualEmail(auth)
        if (seen.has(actualAccount)) return null // 重複アカウントをスキップ
        seen.add(actualAccount)

        const list = await gmail.users.messages.list({ userId: 'me', q: query, maxResults })
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
            threadId: detail.data.threadId ?? msg.id,
            account: actualAccount,
            from: get('From'),
            subject: get('Subject'),
            date: get('Date'),
            snippet: detail.data.snippet,
          })
        }
        return { account: actualAccount, messages: results, error: null as string | null }
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err)
        console.error(`[search_gmail] error: ${a} →`, raw)
        return { account: a, messages: [] as InboxEmail[], error: sanitizeGoogleError(err) }
      }
    }),
  )
  const filtered = perAccount.filter((p): p is NonNullable<typeof p> => p !== null)
  return {
    query,
    accounts: filtered.map(({ account, messages, error }) => ({ account, error, count: messages.length })),
    messages: filtered.flatMap((p) => p.messages),
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
        console.log(`[trash_gmail] ok: ${account} ${id}`)
        return { id, ok: true as const }
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err)
        console.error(`[trash_gmail] error: ${account} ${id} →`, raw)
        return { id, ok: false as const, error: sanitizeGoogleError(err) }
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

export async function replyToEmail(opts: {
  account: string
  messageId: string
  body: string
}) {
  const { requireConfirmation } = await import('../confirmation/index')
  const auth = getGoogleAuth(opts.account)
  const gmail = google.gmail({ version: 'v1', auth })

  // 元メッセージの情報を取得
  const orig = await gmail.users.messages.get({
    userId: 'me', id: opts.messageId,
    format: 'metadata', metadataHeaders: ['From', 'Subject', 'Message-ID'],
  })
  const headers = orig.data.payload?.headers ?? []
  const get = (name: string) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
  const originalFrom = get('From')
  const originalSubject = get('Subject')
  const originalMessageId = get('Message-ID')
  const threadId = orig.data.threadId ?? ''
  const reSubject = originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`

  const confirmed = await requireConfirmation({
    action: 'Reply to email',
    summary: `Reply to ${originalFrom}`,
    details: {
      'To': originalFrom,
      'Subject': reSubject,
      'Body': opts.body.length > 80 ? opts.body.slice(0, 80) + '…' : opts.body,
    },
  })
  if (!confirmed) return { ok: false, cancelled: true }

  const raw = [
    `From: ${opts.account}`,
    `To: ${originalFrom}`,
    `Subject: ${reSubject}`,
    ...(originalMessageId ? [`In-Reply-To: ${originalMessageId}`, `References: ${originalMessageId}`] : []),
    'Content-Type: text/plain; charset=UTF-8',
    '',
    opts.body,
  ].join('\r\n')

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: Buffer.from(raw).toString('base64url'), threadId },
  })
  return { ok: true, to: originalFrom, subject: reSubject }
}

// ゴミ箱から受信トレイに復元する
export async function untrashEmails(account: string, ids: string[]) {
  const auth = getGoogleAuth(account)
  const gmail = google.gmail({ version: 'v1', auth })
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        await gmail.users.messages.untrash({ userId: 'me', id })
        console.log(`[untrash_gmail] ok: ${account} ${id}`)
        return { id, ok: true as const }
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err)
        console.error(`[untrash_gmail] error: ${account} ${id} →`, raw)
        return { id, ok: false as const, error: sanitizeGoogleError(err) }
      }
    }),
  )
  return { account, results }
}

// 送信者をブロック (スパムフィルターを作成)
export async function blockSender(account: string, senderEmail: string) {
  const auth = getGoogleAuth(account)
  const gmail = google.gmail({ version: 'v1', auth })
  try {
    const filter = await gmail.users.settings.filters.create({
      userId: 'me',
      requestBody: {
        criteria: { from: senderEmail },
        action: { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] },
      },
    })
    console.log(`[block_sender] ok: ${account} blocked ${senderEmail} (filterId: ${filter.data.id})`)
    return { account, senderEmail, ok: true as const, filterId: filter.data.id }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    console.error(`[block_sender] error: ${account} ${senderEmail} →`, raw)
    return { account, senderEmail, ok: false as const, error: sanitizeGoogleError(err) }
  }
}

// 送信者のブロックを解除 (スパムフィルターを削除)
export async function unblockSender(account: string, senderEmail: string) {
  const auth = getGoogleAuth(account)
  const gmail = google.gmail({ version: 'v1', auth })
  try {
    const listRes = await gmail.users.settings.filters.list({ userId: 'me' })
    const matching = (listRes.data.filter ?? []).filter((f) => f.criteria?.from === senderEmail)
    if (matching.length === 0) {
      return { account, senderEmail, ok: true as const, removed: 0, message: 'No block filter found' }
    }
    await Promise.all(
      matching.map((f) => f.id
        ? gmail.users.settings.filters.delete({ userId: 'me', id: f.id })
        : Promise.resolve()
      )
    )
    console.log(`[unblock_sender] ok: ${account} unblocked ${senderEmail} (removed ${matching.length} filter(s))`)
    return { account, senderEmail, ok: true as const, removed: matching.length }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    console.error(`[unblock_sender] error: ${account} ${senderEmail} →`, raw)
    return { account, senderEmail, ok: false as const, error: sanitizeGoogleError(err) }
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
