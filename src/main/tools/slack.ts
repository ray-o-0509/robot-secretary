import { WebClient } from '@slack/web-api'

function getClient() {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) throw new Error('SLACK_BOT_TOKEN が設定されていません')
  return new WebClient(token)
}

export async function getUnreadMessages(channel?: string) {
  const client = getClient()

  if (channel) {
    // 特定チャンネルの最新メッセージ
    const res = await client.conversations.history({ channel, limit: 5 })
    return (res.messages ?? []).map((m) => ({
      text: m.text,
      user: m.user,
      ts: m.ts,
    }))
  }

  // 全チャンネルの未読を取得
  const channels = await client.conversations.list({ types: 'public_channel,private_channel,im' })
  const results: { channel: string; messages: unknown[] }[] = []

  for (const ch of channels.channels ?? []) {
    if (!ch.id || !ch.is_member) continue
    const unread = (ch as { unread_count?: number }).unread_count ?? 0
    if (unread === 0) continue

    const hist = await client.conversations.history({ channel: ch.id, limit: 3 })
    results.push({
      channel: ch.name ?? ch.id,
      messages: (hist.messages ?? []).map((m) => ({ text: m.text, user: m.user })),
    })
  }

  return results
}

export async function sendMessage(channel: string, text: string) {
  const client = getClient()
  await client.chat.postMessage({ channel, text })
  return { success: true }
}
