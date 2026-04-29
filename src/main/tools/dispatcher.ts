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
    name: 'get_gmail_inbox',
    description: 'Gmailのインボックスにあるメール（既読・未読問わず）を取得する。スパム・ゴミ箱は除外。デフォルトで登録されている全アカウントを横断して取得する。返り値の各メッセージには id と account フィールドが付く（trash/archive で使う）。',
    input_schema: {
      type: 'object',
      properties: {
        maxResults: { type: 'number', description: '1アカウントあたりの取得上限（デフォルト100）。' },
        account: { type: 'string', description: '特定の Gmail アカウントだけ見たいときのメールアドレス。省略時は全アカウント。' },
      },
    },
  },
  {
    name: 'trash_gmail',
    description: 'Gmailメッセージをゴミ箱に送る。30日間は復元可、その後Google側で自動完全削除される。完全削除はサポートしない。事前に get_gmail_inbox で id と account を取得すること。',
    input_schema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: '対象アカウントのメールアドレス（get_gmail_inbox の各メッセージの account）' },
        ids: { type: 'array', items: { type: 'string' }, description: 'ゴミ箱に送るメッセージID配列' },
      },
      required: ['account', 'ids'],
    },
  },
  {
    name: 'archive_gmail',
    description: 'Gmailメッセージをアーカイブする（INBOX ラベルを外すだけ。メール本体は残り、検索すれば見つかる）。事前に get_gmail_inbox で id と account を取得すること。',
    input_schema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: '対象アカウントのメールアドレス（get_gmail_inbox の各メッセージの account）' },
        ids: { type: 'array', items: { type: 'string' }, description: 'アーカイブするメッセージID配列' },
      },
      required: ['account', 'ids'],
    },
  },
  {
    name: 'get_calendar_events',
    description: 'Googleカレンダーの予定を取得する。登録されている全アカウントの primary カレンダーを横断する。重複イベントは event id で除去済み。',
    input_schema: {
      type: 'object',
      properties: {
        range: {
          type: 'string',
          enum: ['today', 'tomorrow', 'upcoming'],
          description: 'today=今日, tomorrow=明日, upcoming=今日から days 日先まで（デフォルト today）',
        },
        days: { type: 'number', description: 'range=upcoming のときの日数（1〜14、デフォルト7）' },
      },
    },
  },
  {
    name: 'get_tasks',
    description: 'TickTickの未完了タスクを全プロジェクト横断で取得する',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'create_task',
    description: 'TickTickに新しいタスクを作成する。projectId 未指定なら inbox に入る',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'タスクのタイトル' },
        due: { type: 'string', description: '期限（YYYY-MM-DD、任意）' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: '優先度（任意）' },
        projectId: { type: 'string', description: 'プロジェクトID（任意、未指定で inbox）' },
      },
      required: ['title'],
    },
  },
  {
    name: 'complete_task',
    description: 'TickTickのタスクを完了状態にする',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'タスクID（get_tasks の返り値の taskId）' },
        projectId: { type: 'string', description: 'プロジェクトID（get_tasks の返り値の projectId）' },
      },
      required: ['taskId', 'projectId'],
    },
  },
  {
    name: 'complete_subtask',
    description: 'TickTickのサブタスク（チェックリスト項目）を完了状態にする',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: '親タスクID' },
        projectId: { type: 'string', description: 'プロジェクトID' },
        subtaskId: { type: 'string', description: 'サブタスクID（subtasks[].id）' },
      },
      required: ['taskId', 'projectId', 'subtaskId'],
    },
  },
  {
    name: 'get_email_detail',
    description: 'Gmailメッセージの本文（HTML/テキスト）を取得する。事前に get_gmail_inbox で id と account を取得しておく。',
    input_schema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: '対象アカウントのメールアドレス' },
        id: { type: 'string', description: 'メッセージID' },
      },
      required: ['account', 'id'],
    },
  },
  {
    name: 'get_dashboard_entry',
    description:
      "daily-dashboard の Turso DB から日次まとめエントリを取得する。skill='ai-news' でAIニュース、'best-tools' でおすすめツール、'movies' で映画、'spending' で支出分析。id 省略で最新を返す。",
    input_schema: {
      type: 'object',
      properties: {
        skill: {
          type: 'string',
          enum: ['ai-news', 'best-tools', 'movies', 'spending'],
          description: '取得するエントリの種類',
        },
        id: {
          type: 'string',
          description: "特定日付 (YYYY-MM-DD) を取りたいときだけ指定。省略 or 'latest' で最新。",
        },
      },
      required: ['skill'],
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
    case 'get_gmail_inbox': {
      const { getInboxEmails } = await import('./gmail')
      return await getInboxEmails(args.maxResults as number | undefined, args.account as string | undefined)
    }
    case 'trash_gmail': {
      const { trashEmails } = await import('./gmail')
      return await trashEmails(args.account as string, args.ids as string[])
    }
    case 'archive_gmail': {
      const { archiveEmails } = await import('./gmail')
      return await archiveEmails(args.account as string, args.ids as string[])
    }
    case 'get_calendar_events': {
      const { getTodayEvents, getTomorrowEvents, getUpcomingEvents } = await import('./calendar')
      const range = (args.range as string | undefined) ?? 'today'
      if (range === 'tomorrow') return await getTomorrowEvents()
      if (range === 'upcoming') return await getUpcomingEvents((args.days as number | undefined) ?? 7)
      return await getTodayEvents()
    }
    case 'get_tasks': {
      const { getTodos } = await import('./ticktick')
      return await getTodos()
    }
    case 'create_task': {
      const { createTask } = await import('./ticktick')
      return await createTask({
        title: args.title as string,
        due: args.due as string | undefined,
        priority: args.priority as 'low' | 'medium' | 'high' | undefined,
        projectId: args.projectId as string | undefined,
      })
    }
    case 'complete_task': {
      const { completeTask } = await import('./ticktick')
      return await completeTask({
        taskId: args.taskId as string,
        projectId: args.projectId as string,
      })
    }
    case 'complete_subtask': {
      const { completeSubtask } = await import('./ticktick')
      return await completeSubtask({
        taskId: args.taskId as string,
        projectId: args.projectId as string,
        subtaskId: args.subtaskId as string,
      })
    }
    case 'get_email_detail': {
      const { getEmailDetail } = await import('./gmail')
      return await getEmailDetail(args.account as string, args.id as string)
    }
    case 'get_dashboard_entry': {
      const { getDashboardEntry } = await import('./dashboard')
      return await getDashboardEntry(
        args.skill as 'ai-news' | 'best-tools' | 'movies' | 'spending',
        args.id as string | undefined,
      )
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
