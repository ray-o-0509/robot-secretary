import type Anthropic from '@anthropic-ai/sdk'

export const toolSchemas: Anthropic.Tool[] = [
  {
    name: 'get_slack_unread',
    description: 'Slackの未読メッセージを取得する',
    input_schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'チャンネルID（省略時は全チャンネル）' },
      },
    },
  },
  {
    name: 'send_slack_message',
    description: 'Slackにメッセージを送信する',
    input_schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'チャンネルID' },
        text: { type: 'string', description: '送信するテキスト' },
      },
      required: ['channel', 'text'],
    },
  },
  {
    name: 'get_gmail_unread',
    description: 'Gmailの未読メールを取得する',
    input_schema: {
      type: 'object',
      properties: {
        maxResults: { type: 'number', description: '取得件数の上限（省略時は5）' },
      },
    },
  },
  {
    name: 'get_calendar_events',
    description: '今日のGoogleカレンダーの予定を取得する',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_notion_tasks',
    description: 'Notionのタスクを取得する',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'ステータスでフィルタ（省略可）' },
      },
    },
  },
]

export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_slack_unread': {
      const { getUnreadMessages } = await import('./slack')
      return await getUnreadMessages(args.channel as string | undefined)
    }
    case 'send_slack_message': {
      const { sendMessage } = await import('./slack')
      return await sendMessage(args.channel as string, args.text as string)
    }
    case 'get_gmail_unread': {
      const { getUnreadEmails } = await import('./gmail')
      return await getUnreadEmails(args.maxResults as number | undefined)
    }
    case 'get_calendar_events': {
      const { getTodayEvents } = await import('./calendar')
      return await getTodayEvents()
    }
    case 'get_notion_tasks': {
      const { getMyTasks } = await import('./notion')
      return await getMyTasks(args.status as string | undefined)
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
