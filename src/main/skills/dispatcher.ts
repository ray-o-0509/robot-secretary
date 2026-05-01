import type Anthropic from '@anthropic-ai/sdk'
import { optString, reqString } from './shared/validation'

export const toolSchemas: Anthropic.Tool[] = [
  {
    name: 'get_gmail_inbox',
    description: 'Fetch emails from the Gmail inbox (read and unread). Excludes spam and trash. Fetches across all registered accounts by default. Each returned message includes id and account fields (used for trash/archive).',
    input_schema: {
      type: 'object',
      properties: {
        maxResults: { type: 'number', description: 'Maximum number of results per account (default 100).' },
        account: { type: 'string', description: 'Email address to filter to a specific Gmail account. Omit for all accounts.' },
      },
    },
  },
  {
    name: 'trash_gmail',
    description: 'Move Gmail messages to trash. Recoverable for 30 days; Google permanently deletes them after that. Permanent deletion is not supported. Fetch id and account from get_gmail_inbox first.',
    input_schema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Email address of the target account (account field from get_gmail_inbox)' },
        ids: { type: 'array', items: { type: 'string' }, description: 'Array of message IDs to trash' },
      },
      required: ['account', 'ids'],
    },
  },
  {
    name: 'archive_gmail',
    description: 'Archive Gmail messages (removes the INBOX label only; the message is kept and remains searchable). Fetch id and account from get_gmail_inbox first.',
    input_schema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Email address of the target account (account field from get_gmail_inbox)' },
        ids: { type: 'array', items: { type: 'string' }, description: 'Array of message IDs to archive' },
      },
      required: ['account', 'ids'],
    },
  },
  {
    name: 'get_calendar_events',
    description: 'Fetch events from Google Calendar. Spans primary calendars across all registered accounts. Duplicate events are deduplicated by event id.',
    input_schema: {
      type: 'object',
      properties: {
        range: {
          type: 'string',
          enum: ['today', 'tomorrow', 'upcoming'],
          description: 'today=today, tomorrow=tomorrow, upcoming=from today up to days ahead (default today)',
        },
        days: { type: 'number', description: 'Number of days when range=upcoming (1–14, default 7)' },
      },
    },
  },
  {
    name: 'get_tasks',
    description: 'Fetch all incomplete tasks from TickTick across all projects',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'create_task',
    description: 'Create a new task in TickTick. Goes to inbox if projectId is not specified',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        due: { type: 'string', description: 'Due date (YYYY-MM-DD, optional)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Priority (optional)' },
        projectId: { type: 'string', description: 'Project ID (optional, defaults to inbox)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a TickTick task as complete',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (taskId field from get_tasks response)' },
        projectId: { type: 'string', description: 'Project ID (projectId field from get_tasks response)' },
      },
      required: ['taskId', 'projectId'],
    },
  },
  {
    name: 'complete_subtask',
    description: 'Mark a TickTick subtask (checklist item) as complete',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Parent task ID' },
        projectId: { type: 'string', description: 'Project ID' },
        subtaskId: { type: 'string', description: 'Subtask ID (subtasks[].id)' },
      },
      required: ['taskId', 'projectId', 'subtaskId'],
    },
  },
  {
    name: 'get_email_detail',
    description: 'Fetch the body (HTML/text) of a Gmail message. Fetch id and account from get_gmail_inbox first.',
    input_schema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Email address of the target account' },
        id: { type: 'string', description: 'Message ID' },
      },
      required: ['account', 'id'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web and return the latest information, news, and research results',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'update_task',
    description: 'Update a TickTick task. Use for changing due date, title, or priority. Fetch taskId and projectId from get_tasks first.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID' },
        projectId: { type: 'string', description: 'Project ID' },
        title: { type: 'string', description: 'New title (if changing)' },
        due: { type: 'string', description: 'New due date YYYY-MM-DD. Pass null to remove the due date.' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'none'], description: 'New priority' },
      },
      required: ['taskId', 'projectId'],
    },
  },
  {
    name: 'reply_gmail',
    description: 'Send a reply to the specified message. A confirmation dialog is shown; the message is only sent if the user confirms. Fetch id and account from get_gmail_inbox first.',
    input_schema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Sender Gmail account' },
        messageId: { type: 'string', description: 'ID of the message to reply to (id from get_gmail_inbox)' },
        body: { type: 'string', description: 'Reply body (plain text)' },
      },
      required: ['account', 'messageId', 'body'],
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Create a new event in Google Calendar. If attendees are specified, a confirmation dialog is shown and invites are only sent if the user confirms.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        startDateTime: { type: 'string', description: 'Start date/time (ISO 8601 or YYYY-MM-DD)' },
        endDateTime: { type: 'string', description: 'End date/time (ISO 8601 or YYYY-MM-DD)' },
        account: { type: 'string', description: 'Google account (defaults to first account)' },
        allDay: { type: 'boolean', description: 'Set to true for all-day events' },
        location: { type: 'string', description: 'Location (optional)' },
        description: { type: 'string', description: 'Description (optional)' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Array of attendee email addresses (optional)' },
        timeZone: { type: 'string', description: 'Time zone (defaults to Asia/Tokyo)' },
      },
      required: ['title', 'startDateTime', 'endDateTime'],
    },
  },
  {
    name: 'get_weather',
    description: 'Fetch current weather and a 3-day forecast for the specified location (Open-Meteo, no authentication required)',
    input_schema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'Location name (e.g. "Tokyo", "Osaka", "Sapporo")' },
      },
      required: ['location'],
    },
  },
  {
    name: 'get_dashboard_entry',
    description:
      "Fetch a daily summary entry from Turso DB. skill='ai-news' for AI news, 'best-tools' for recommended tools, 'movies' for movies, 'spending' for spending analysis. Omit id to return the latest.",
    input_schema: {
      type: 'object',
      properties: {
        skill: {
          type: 'string',
          enum: ['ai-news', 'best-tools', 'movies', 'spending'],
          description: 'Type of entry to fetch',
        },
        id: {
          type: 'string',
          description: "Specify only when fetching a specific date (YYYY-MM-DD). Omit or pass 'latest' for the most recent.",
        },
      },
      required: ['skill'],
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
    case 'get_dashboard_entry': {
      const { getDashboardEntry } = await import('./shared/turso')
      return await getDashboardEntry(
        args.skill as 'ai-news' | 'best-tools' | 'movies' | 'spending',
        args.id as string | undefined,
      )
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
