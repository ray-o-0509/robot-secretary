import type Anthropic from '@anthropic-ai/sdk'
import { optString, reqString } from './shared/validation'

type GmailTarget = { account: string; id: string }
type CalendarEventInput = {
  title: string
  startDateTime: string
  endDateTime: string
  account?: string
  allDay?: boolean
  location?: string
  description?: string
  attendees?: string[]
  timeZone?: string
}
type DriveMoveInput = { fileId: string; newParentId: string; account?: string }
type DriveCopyInput = { fileId: string; newName?: string; parentId?: string; account?: string }
type DriveTrashInput = { fileId: string; account?: string }
type DriveShareInput = { fileId: string; email: string; role: 'reader' | 'commenter' | 'writer'; account?: string }
type TaskCreateInput = { title: string; due?: string; priority?: 'low' | 'medium' | 'high'; projectId?: string }
type TaskRef = { taskId: string; projectId: string }
type TaskUpdateInput = TaskRef & { title?: string; due?: string | null; priority?: 'low' | 'medium' | 'high' | 'none' }

function gmailTargets(args: Record<string, unknown>): Map<string, string[]> {
  const grouped = new Map<string, string[]>()
  if (Array.isArray(args.targets)) {
    for (const raw of args.targets) {
      const target = raw as Partial<GmailTarget>
      if (typeof target.account !== 'string' || typeof target.id !== 'string') continue
      const ids = grouped.get(target.account) ?? []
      ids.push(target.id)
      grouped.set(target.account, ids)
    }
  } else {
    const account = reqString(args, 'account')
    const ids = Array.isArray(args.ids) ? args.ids.filter((id): id is string => typeof id === 'string') : []
    if (ids.length) grouped.set(account, ids)
  }
  if (grouped.size === 0) throw new Error('Provide either account + ids, or targets: [{ account, id }]')
  return grouped
}

function ensureRole(role: string): 'reader' | 'commenter' | 'writer' {
  if (role !== 'reader' && role !== 'commenter' && role !== 'writer') {
    throw new Error(`role must be one of: reader, commenter, writer (got "${role}")`)
  }
  return role
}

function calendarEvents(args: Record<string, unknown>): CalendarEventInput[] {
  if (Array.isArray(args.events)) {
    return args.events.map((raw) => {
      const event = raw as Partial<CalendarEventInput>
      if (typeof event.title !== 'string' || typeof event.startDateTime !== 'string' || typeof event.endDateTime !== 'string') {
        throw new Error('Each calendar event requires title, startDateTime, and endDateTime')
      }
      return event as CalendarEventInput
    })
  }
  return [{
    title: reqString(args, 'title'),
    startDateTime: reqString(args, 'startDateTime'),
    endDateTime: reqString(args, 'endDateTime'),
    account: optString(args, 'account'),
    allDay: args.allDay as boolean | undefined,
    location: optString(args, 'location'),
    description: optString(args, 'description'),
    attendees: args.attendees as string[] | undefined,
    timeZone: optString(args, 'timeZone'),
  }]
}

function driveMoveItems(args: Record<string, unknown>): DriveMoveInput[] {
  if (Array.isArray(args.items)) {
    return args.items.map((raw) => {
      const item = raw as Partial<DriveMoveInput>
      if (typeof item.fileId !== 'string' || typeof item.newParentId !== 'string') throw new Error('Each Drive move item requires fileId and newParentId')
      return item as DriveMoveInput
    })
  }
  const fileIds = Array.isArray(args.fileIds) ? args.fileIds.filter((id): id is string => typeof id === 'string') : []
  const newParentId = reqString(args, 'newParentId')
  if (fileIds.length) return fileIds.map((fileId) => ({ fileId, newParentId, account: optString(args, 'account') }))
  return [{ fileId: reqString(args, 'fileId'), newParentId, account: optString(args, 'account') }]
}

function driveCopyItems(args: Record<string, unknown>): DriveCopyInput[] {
  if (Array.isArray(args.items)) {
    return args.items.map((raw) => {
      const item = raw as Partial<DriveCopyInput>
      if (typeof item.fileId !== 'string') throw new Error('Each Drive copy item requires fileId')
      return item as DriveCopyInput
    })
  }
  const fileIds = Array.isArray(args.fileIds) ? args.fileIds.filter((id): id is string => typeof id === 'string') : []
  if (fileIds.length) return fileIds.map((fileId) => ({ fileId, parentId: optString(args, 'parentId'), account: optString(args, 'account') }))
  return [{ fileId: reqString(args, 'fileId'), newName: optString(args, 'newName'), parentId: optString(args, 'parentId'), account: optString(args, 'account') }]
}

function driveTrashItems(args: Record<string, unknown>): DriveTrashInput[] {
  if (Array.isArray(args.items)) {
    return args.items.map((raw) => {
      const item = raw as Partial<DriveTrashInput>
      if (typeof item.fileId !== 'string') throw new Error('Each Drive trash item requires fileId')
      return item as DriveTrashInput
    })
  }
  const fileIds = Array.isArray(args.fileIds) ? args.fileIds.filter((id): id is string => typeof id === 'string') : []
  if (fileIds.length) return fileIds.map((fileId) => ({ fileId, account: optString(args, 'account') }))
  return [{ fileId: reqString(args, 'fileId'), account: optString(args, 'account') }]
}

function driveShareItems(args: Record<string, unknown>): DriveShareInput[] {
  if (Array.isArray(args.items)) {
    return args.items.map((raw) => {
      const item = raw as Partial<DriveShareInput>
      if (typeof item.fileId !== 'string' || typeof item.email !== 'string' || typeof item.role !== 'string') throw new Error('Each Drive share item requires fileId, email, and role')
      return { ...item, role: ensureRole(item.role) } as DriveShareInput
    })
  }
  const fileIds = Array.isArray(args.fileIds) ? args.fileIds.filter((id): id is string => typeof id === 'string') : []
  const email = reqString(args, 'email')
  const role = ensureRole(reqString(args, 'role'))
  if (fileIds.length) return fileIds.map((fileId) => ({ fileId, email, role, account: optString(args, 'account') }))
  return [{ fileId: reqString(args, 'fileId'), email, role, account: optString(args, 'account') }]
}

function taskCreates(args: Record<string, unknown>): TaskCreateInput[] {
  if (Array.isArray(args.tasks)) {
    return args.tasks.map((raw) => {
      const task = raw as Partial<TaskCreateInput>
      if (typeof task.title !== 'string') throw new Error('Each task requires title')
      return task as TaskCreateInput
    })
  }
  return [{
    title: reqString(args, 'title'),
    due: optString(args, 'due'),
    priority: args.priority as 'low' | 'medium' | 'high' | undefined,
    projectId: optString(args, 'projectId'),
  }]
}

function taskRefs(args: Record<string, unknown>): TaskRef[] {
  if (Array.isArray(args.tasks)) {
    return args.tasks.map((raw) => {
      const task = raw as Partial<TaskRef>
      if (typeof task.taskId !== 'string' || typeof task.projectId !== 'string') throw new Error('Each task requires taskId and projectId')
      return task as TaskRef
    })
  }
  return [{ taskId: reqString(args, 'taskId'), projectId: reqString(args, 'projectId') }]
}

function taskUpdates(args: Record<string, unknown>): TaskUpdateInput[] {
  if (Array.isArray(args.tasks)) {
    return args.tasks.map((raw) => {
      const task = raw as Partial<TaskUpdateInput>
      if (typeof task.taskId !== 'string' || typeof task.projectId !== 'string') throw new Error('Each task update requires taskId and projectId')
      return task as TaskUpdateInput
    })
  }
  return [{
    taskId: reqString(args, 'taskId'),
    projectId: reqString(args, 'projectId'),
    title: args.title as string | undefined,
    due: args.due as string | null | undefined,
    priority: args.priority as 'low' | 'medium' | 'high' | 'none' | undefined,
  }]
}

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
    description: 'Move one or more Gmail messages to trash. Recoverable for 30 days; Google permanently deletes them after that. Permanent deletion is not supported. Fetch id and account from get_gmail_inbox first. Use account+ids for one account, or targets for messages across multiple accounts.',
    input_schema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Email address of the target account (account field from get_gmail_inbox)' },
        ids: { type: 'array', items: { type: 'string' }, description: 'Array of message IDs to trash' },
        targets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              account: { type: 'string' },
              id: { type: 'string' },
            },
            required: ['account', 'id'],
          },
          description: 'Messages to trash across accounts. Use this when selected messages belong to different Gmail accounts.',
        },
      },
    },
  },
  {
    name: 'archive_gmail',
    description: 'Archive one or more Gmail messages (removes the INBOX label only; the message is kept and remains searchable). Fetch id and account from get_gmail_inbox first. Use account+ids for one account, or targets for messages across multiple accounts.',
    input_schema: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Email address of the target account (account field from get_gmail_inbox)' },
        ids: { type: 'array', items: { type: 'string' }, description: 'Array of message IDs to archive' },
        targets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              account: { type: 'string' },
              id: { type: 'string' },
            },
            required: ['account', 'id'],
          },
          description: 'Messages to archive across accounts. Use this when selected messages belong to different Gmail accounts.',
        },
      },
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
    description: 'Create one or more tasks in TickTick. Goes to inbox if projectId is not specified. Use tasks for batch creation.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        due: { type: 'string', description: 'Due date (YYYY-MM-DD, optional)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Priority (optional)' },
        projectId: { type: 'string', description: 'Project ID (optional, defaults to inbox)' },
        tasks: { type: 'array', items: { type: 'object' }, description: 'Multiple tasks to create; each item uses title and optional due, priority, projectId' },
      },
    },
  },
  {
    name: 'complete_task',
    description: 'Mark one or more TickTick tasks as complete. Use tasks for batch completion.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (taskId field from get_tasks response)' },
        projectId: { type: 'string', description: 'Project ID (projectId field from get_tasks response)' },
        tasks: { type: 'array', items: { type: 'object' }, description: 'Multiple tasks to complete, each with taskId and projectId' },
      },
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
    description: 'Update one or more TickTick tasks. Use for changing due date, title, or priority. Fetch taskId and projectId from get_tasks first. Use tasks for batch updates.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID' },
        projectId: { type: 'string', description: 'Project ID' },
        title: { type: 'string', description: 'New title (if changing)' },
        due: { type: 'string', description: 'New due date YYYY-MM-DD. Pass null to remove the due date.' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'none'], description: 'New priority' },
        tasks: { type: 'array', items: { type: 'object' }, description: 'Multiple task updates, each with taskId, projectId, and fields to change' },
      },
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
    description: 'Create one or more events in Google Calendar. If attendees are specified, a confirmation dialog is shown and invites are only sent if the user confirms. Use events for batch creation.',
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
        events: { type: 'array', items: { type: 'object' }, description: 'Multiple events to create; each item uses title, startDateTime, endDateTime, and optional account/allDay/location/description/attendees/timeZone.' },
      },
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
    name: 'list_drive_recent',
    description: 'List recently modified files on Google Drive (excludes trashed). Single account; use the default account if not specified.',
    input_schema: {
      type: 'object',
      properties: {
        maxResults: { type: 'number', description: 'Max files to return (1–100, default 30)' },
        account: { type: 'string', description: 'Google account email (omit to use the default)' },
      },
    },
  },
  {
    name: 'list_drive_folder',
    description: 'List the contents of a specific Google Drive folder (excludes trashed). Pass folderId from a prior list/search result, or "root" for the My Drive top level. Folders sort first.',
    input_schema: {
      type: 'object',
      properties: {
        folderId: { type: 'string', description: 'Drive folder ID, or "root" for My Drive top level' },
        maxResults: { type: 'number', description: 'Max items to return (1–100, default 100)' },
        account: { type: 'string', description: 'Google account email' },
      },
      required: ['folderId'],
    },
  },
  {
    name: 'search_drive',
    description: 'Search Google Drive files by name and full-text content (excludes trashed). Optionally filter by mimeType. Results show in the Drive panel.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword (matched against name and full text)' },
        mimeType: { type: 'string', description: 'Optional Drive mimeType filter (e.g. "application/vnd.google-apps.document", "application/pdf", "application/vnd.google-apps.folder")' },
        maxResults: { type: 'number', description: 'Max files to return (1–100, default 30)' },
        account: { type: 'string', description: 'Google account email (omit to use the default)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_drive_file',
    description: 'Read the text contents of a Drive file. Google Docs/Sheets/Slides are exported to text/csv. Plain-text and JSON-like files are downloaded directly. Binary files cannot be read this way. Truncates at 256 KB.',
    input_schema: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Drive file ID (from list_drive_recent or search_drive)' },
        account: { type: 'string', description: 'Google account email' },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'create_drive_file',
    description: 'Create a new file on Drive with the given text content. Defaults to text/plain at the account root. Pass parentId to put it in a specific folder.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'File name (e.g. "memo.txt")' },
        content: { type: 'string', description: 'Text content' },
        mimeType: { type: 'string', description: 'Optional mimeType (default "text/plain")' },
        parentId: { type: 'string', description: 'Optional parent folder ID' },
        account: { type: 'string', description: 'Google account email' },
      },
      required: ['name', 'content'],
    },
  },
  {
    name: 'upload_drive_file',
    description: 'Upload a local file to Drive after user confirmation. Mime type is inferred. Pass parentId to upload into a specific folder.',
    input_schema: {
      type: 'object',
      properties: {
        localPath: { type: 'string', description: 'Absolute or ~ path to a local file' },
        name: { type: 'string', description: 'Override the uploaded file name (defaults to basename of localPath)' },
        parentId: { type: 'string', description: 'Optional parent folder ID' },
        account: { type: 'string', description: 'Google account email' },
      },
      required: ['localPath'],
    },
  },
  {
    name: 'move_drive_item',
    description: 'Move one or more Drive files or folders. Use fileIds with one newParentId for a batch into the same folder, or items for per-file destinations/accounts.',
    input_schema: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Drive file or folder ID to move' },
        fileIds: { type: 'array', items: { type: 'string' }, description: 'Drive file or folder IDs to move to the same destination folder' },
        newParentId: { type: 'string', description: 'Destination folder ID' },
        account: { type: 'string', description: 'Google account email' },
        items: { type: 'array', items: { type: 'object' }, description: 'Multiple move items, each with fileId, newParentId, and optional account' },
      },
    },
  },
  {
    name: 'copy_drive_item',
    description: 'Copy one or more Drive files. Folders cannot be copied via this API. Use fileIds to copy several files to one parent, or items for per-file names/parents/accounts.',
    input_schema: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Drive file ID to copy' },
        fileIds: { type: 'array', items: { type: 'string' }, description: 'Drive file IDs to copy' },
        newName: { type: 'string', description: 'Optional new name for the copy' },
        parentId: { type: 'string', description: 'Optional destination folder ID' },
        account: { type: 'string', description: 'Google account email' },
        items: { type: 'array', items: { type: 'object' }, description: 'Multiple copy items, each with fileId and optional newName, parentId, account' },
      },
    },
  },
  {
    name: 'trash_drive_item',
    description: 'Move one or more Drive files or folders to trash. Recoverable for 30 days, then Drive purges automatically. Permanent deletion is not supported.',
    input_schema: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Drive file or folder ID to trash' },
        fileIds: { type: 'array', items: { type: 'string' }, description: 'Drive file or folder IDs to trash' },
        account: { type: 'string', description: 'Google account email' },
        items: { type: 'array', items: { type: 'object' }, description: 'Multiple trash items, each with fileId and optional account' },
      },
    },
  },
  {
    name: 'share_drive_item',
    description: 'Share one or more Drive files or folders. Shows a confirmation dialog and only sends the invite if the user confirms. Use fileIds for several files to the same recipient/role, or items for per-file recipients/roles.',
    input_schema: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Drive file or folder ID' },
        fileIds: { type: 'array', items: { type: 'string' }, description: 'Drive file or folder IDs to share with the same recipient and role' },
        email: { type: 'string', description: 'Email address of the person to share with' },
        role: { type: 'string', enum: ['reader', 'commenter', 'writer'], description: 'Permission level' },
        account: { type: 'string', description: 'Google account email (the owner)' },
        items: { type: 'array', items: { type: 'object' }, description: 'Multiple share items, each with fileId, email, role, and optional account' },
      },
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
      const results = await Promise.all(
        Array.from(gmailTargets(args)).map(async ([account, ids]) => trashEmails(account, ids))
      )
      return { results }
    }
    case 'archive_gmail': {
      const { archiveEmails } = await import('./gmail/index')
      const results = await Promise.all(
        Array.from(gmailTargets(args)).map(async ([account, ids]) => archiveEmails(account, ids))
      )
      return { results }
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
      const items = taskCreates(args)
      const results = await Promise.all(items.map((item) => createTask(item)))
      return items.length > 1 ? { results } : results[0]
    }
    case 'complete_task': {
      const { completeTask } = await import('./tasks/index')
      const items = taskRefs(args)
      const results = await Promise.all(items.map((item) => completeTask(item)))
      return items.length > 1 ? { results } : results[0]
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
      const items = taskUpdates(args)
      const results = await Promise.all(items.map((item) => updateTask(item)))
      return items.length > 1 ? { results } : results[0]
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
      const results = await Promise.all(calendarEvents(args).map((event) => createCalendarEvent(event)))
      return Array.isArray(args.events) ? { results } : results[0]
    }
    case 'get_weather': {
      const { getWeather } = await import('./weather/index')
      return await getWeather(reqString(args, 'location'))
    }
    case 'list_drive_recent': {
      const { listRecentDriveFiles } = await import('./drive/index')
      return await listRecentDriveFiles(args.maxResults as number | undefined, optString(args, 'account'))
    }
    case 'list_drive_folder': {
      const { listDriveFolder } = await import('./drive/index')
      return await listDriveFolder({
        folderId: reqString(args, 'folderId'),
        maxResults: args.maxResults as number | undefined,
        account: optString(args, 'account'),
      })
    }
    case 'search_drive': {
      const { searchDriveFiles } = await import('./drive/index')
      return await searchDriveFiles({
        query: reqString(args, 'query'),
        mimeType: optString(args, 'mimeType'),
        maxResults: args.maxResults as number | undefined,
        account: optString(args, 'account'),
      })
    }
    case 'read_drive_file': {
      const { readDriveFile } = await import('./drive/index')
      return await readDriveFile(reqString(args, 'fileId'), optString(args, 'account'))
    }
    case 'create_drive_file': {
      const { createDriveFile } = await import('./drive/index')
      return await createDriveFile({
        name: reqString(args, 'name'),
        content: reqString(args, 'content'),
        mimeType: optString(args, 'mimeType'),
        parentId: optString(args, 'parentId'),
        account: optString(args, 'account'),
      })
    }
    case 'upload_drive_file': {
      const { uploadDriveFile } = await import('./drive/index')
      return await uploadDriveFile({
        localPath: reqString(args, 'localPath'),
        name: optString(args, 'name'),
        parentId: optString(args, 'parentId'),
        account: optString(args, 'account'),
      })
    }
    case 'move_drive_item': {
      const { moveDriveItem } = await import('./drive/index')
      const items = driveMoveItems(args)
      const results = await Promise.all(items.map((item) => moveDriveItem(item)))
      return items.length > 1 ? { results } : results[0]
    }
    case 'copy_drive_item': {
      const { copyDriveItem } = await import('./drive/index')
      const items = driveCopyItems(args)
      const results = await Promise.all(items.map((item) => copyDriveItem(item)))
      return items.length > 1 ? { results } : results[0]
    }
    case 'trash_drive_item': {
      const { trashDriveItem } = await import('./drive/index')
      const items = driveTrashItems(args)
      const results = await Promise.all(items.map((item) => trashDriveItem(item)))
      return items.length > 1 ? { results } : results[0]
    }
    case 'share_drive_item': {
      const { shareDriveItem } = await import('./drive/index')
      const items = driveShareItems(args)
      const results = await Promise.all(items.map((item) => shareDriveItem(item)))
      return items.length > 1 ? { results } : results[0]
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
