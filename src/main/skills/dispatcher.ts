import type Anthropic from '@anthropic-ai/sdk'
import { optString, reqString } from './shared/validation'

let _privateSchemas: Anthropic.Tool[] = []
let _privateExecute: ((name: string, args: Record<string, unknown>) => Promise<unknown>) | null = null

async function loadPrivate() {
  if (_privateExecute) return
  try {
    const priv = await import('../private/main-skills/dispatcher')
    _privateSchemas = priv.toolSchemas
    _privateExecute = priv.executeTool
  } catch {
    // private skills not available
  }
}

export async function getToolSchemas(): Promise<Anthropic.Tool[]> {
  await loadPrivate()
  return [...publicToolSchemas, ..._privateSchemas]
}

const publicToolSchemas: Anthropic.Tool[] = [
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
    name: 'web_search',
    description: 'Webを検索して最新情報・ニュース・調べ物を返す',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '検索クエリ（日本語でもOK）' },
      },
      required: ['query'],
    },
  },
  {
    name: 'update_task',
    description: 'TickTickのタスクを更新する。期限変更・タイトル変更・優先度変更などに使う。事前に get_tasks で taskId と projectId を取得すること',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'タスクID' },
        projectId: { type: 'string', description: 'プロジェクトID' },
        title: { type: 'string', description: '新しいタイトル（変更する場合）' },
        due: { type: 'string', description: '新しい期限 YYYY-MM-DD。null を渡すと期限を解除' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'none'], description: '新しい優先度' },
      },
      required: ['taskId', 'projectId'],
    },
  },
  {
    name: 'reply_gmail',
    description: '指定メッセージへ返信メールを送信する。呼び出すと確認ダイアログが表示され、ユーザーが「実行」を押した場合のみ送信される。事前に get_gmail_inbox で id と account を取得すること',
    input_schema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: '送信元 Gmail アカウント' },
        messageId: { type: 'string', description: '返信先メッセージID（get_gmail_inbox の id）' },
        body: { type: 'string', description: '返信本文（プレーンテキスト）' },
      },
      required: ['account', 'messageId', 'body'],
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Googleカレンダーに新しいイベントを作成する。出席者を指定すると確認ダイアログが表示され、ユーザーが「実行」を押した場合のみ作成・招待が送られる',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'イベントタイトル' },
        startDateTime: { type: 'string', description: '開始日時（ISO 8601 または YYYY-MM-DD）' },
        endDateTime: { type: 'string', description: '終了日時（ISO 8601 または YYYY-MM-DD）' },
        account: { type: 'string', description: 'Googleアカウント（省略で最初のアカウント）' },
        allDay: { type: 'boolean', description: '終日イベントなら true' },
        location: { type: 'string', description: '場所（任意）' },
        description: { type: 'string', description: '説明（任意）' },
        attendees: { type: 'array', items: { type: 'string' }, description: '出席者のメールアドレス配列（任意）' },
        timeZone: { type: 'string', description: 'タイムゾーン（省略で Asia/Tokyo）' },
      },
      required: ['title', 'startDateTime', 'endDateTime'],
    },
  },
  {
    name: 'get_weather',
    description: '指定した場所の現在の天気と3日間の予報を取得する（Open-Meteo、認証不要）',
    input_schema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: '地名（例: "東京", "大阪", "札幌"）' },
      },
      required: ['location'],
    },
  },
]

export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_gmail_inbox': {
      const { getInboxEmails } = await import('./gmail/index')
      return await getInboxEmails(args.maxResults as number | undefined, optString(args, 'account'))
    }
    case 'trash_gmail': {
      const { trashEmails } = await import('./gmail/index')
      return await trashEmails(reqString(args, 'account'), args.ids as string[])
    }
    case 'archive_gmail': {
      const { archiveEmails } = await import('./gmail/index')
      return await archiveEmails(reqString(args, 'account'), args.ids as string[])
    }
    case 'get_calendar_events': {
      const { getTodayEvents, getTomorrowEvents, getUpcomingEvents } = await import('./calendar/index')
      const range = (args.range as string | undefined) ?? 'today'
      if (range === 'tomorrow') return await getTomorrowEvents()
      if (range === 'upcoming') return await getUpcomingEvents((args.days as number | undefined) ?? 7)
      return await getTodayEvents()
    }
    case 'get_tasks': {
      const { getTodos } = await import('./tasks/index')
      return await getTodos()
    }
    case 'create_task': {
      const { createTask } = await import('./tasks/index')
      return await createTask({
        title: reqString(args, 'title'),
        due: args.due as string | undefined,
        priority: args.priority as 'low' | 'medium' | 'high' | undefined,
        projectId: args.projectId as string | undefined,
      })
    }
    case 'complete_task': {
      const { completeTask } = await import('./tasks/index')
      return await completeTask({
        taskId: reqString(args, 'taskId'),
        projectId: reqString(args, 'projectId'),
      })
    }
    case 'complete_subtask': {
      const { completeSubtask } = await import('./tasks/index')
      return await completeSubtask({
        taskId: reqString(args, 'taskId'),
        projectId: reqString(args, 'projectId'),
        subtaskId: reqString(args, 'subtaskId'),
      })
    }
    case 'get_email_detail': {
      const { getEmailDetail } = await import('./gmail/index')
      return await getEmailDetail(reqString(args, 'account'), reqString(args, 'id'))
    }
    case 'web_search': {
      const { webSearch } = await import('./web-search/index')
      return await webSearch(reqString(args, 'query'))
    }
    case 'update_task': {
      const { updateTask } = await import('./tasks/index')
      return await updateTask({
        taskId: reqString(args, 'taskId'),
        projectId: reqString(args, 'projectId'),
        title: args.title as string | undefined,
        due: args.due as string | null | undefined,
        priority: args.priority as 'low' | 'medium' | 'high' | 'none' | undefined,
      })
    }
    case 'reply_gmail': {
      const { replyToEmail } = await import('./gmail/index')
      return await replyToEmail({
        account: reqString(args, 'account'),
        messageId: reqString(args, 'messageId'),
        body: reqString(args, 'body'),
      })
    }
    case 'create_calendar_event': {
      const { createCalendarEvent } = await import('./calendar/index')
      return await createCalendarEvent({
        title: reqString(args, 'title'),
        startDateTime: reqString(args, 'startDateTime'),
        endDateTime: reqString(args, 'endDateTime'),
        account: args.account as string | undefined,
        allDay: args.allDay as boolean | undefined,
        location: args.location as string | undefined,
        description: args.description as string | undefined,
        attendees: args.attendees as string[] | undefined,
        timeZone: args.timeZone as string | undefined,
      })
    }
    case 'get_weather': {
      const { getWeather } = await import('./weather/index')
      return await getWeather(reqString(args, 'location'))
    }
    default: {
      await loadPrivate()
      if (_privateExecute) {
        const result = await _privateExecute(name, args)
        if (result !== null) return result
      }
      throw new Error(`Unknown tool: ${name}`)
    }
  }
}
