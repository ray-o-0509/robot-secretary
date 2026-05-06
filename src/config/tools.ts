// Function-declaration list passed to Gemini Live as the tool surface.
// Tool names here must match handlers in main: registerCoreIpc.ts (call-tool) and skills/dispatcher.ts.

export type ToolDeclaration = {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export const secretaryTools: ToolDeclaration[] = [
  {
    name: 'delegate_task',
    description:
      'Delegate any task to the Claude agent. Use for: multi-step research, cross-source analysis, Gmail/Calendar work, screen inspection, asking Claude a question, or any work that benefits from a second AI. Do not use for code edits (use run_claude_code) or destructive Gmail/Calendar actions (use the dedicated tools).',
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'Detailed instructions for the task to perform (include all necessary information)',
        },
        includeScreenshot: {
          type: 'boolean',
          description: 'Set true when the decision requires seeing the current screen contents',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'get_projects',
    description: 'List all TickTick projects (id and name). Call before create_task when the user specifies a project by name.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_tasks',
    description: 'Retrieve all incomplete tasks from TickTick across all projects. Call this directly when asked about tasks or to-dos.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'create_task',
    description: 'Create one or more tasks in TickTick. If projectId is omitted, the task goes to inbox. Use tasks for batch creation.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        due: { type: 'string', description: 'Due date: YYYY-MM-DD (all-day) or "YYYY-MM-DD HH:mm" (with time, JST assumed)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Priority (optional; use "high" for urgent/important)' },
        projectId: { type: 'string', description: 'Project ID (optional; omit to use inbox)' },
        subtasks: { type: 'array', items: { type: 'string' }, description: 'Checklist subtask titles (e.g. ["買い物", "掃除"])' },
        description: { type: 'string', description: 'Note/description for the task (optional)' },
        tasks: { type: 'array', items: { type: 'object' }, description: 'Multiple tasks to create; each item uses title and optional due, priority, projectId, subtasks, description' },
      },
    },
  },
  {
    name: 'complete_task',
    description: 'Mark one or more TickTick tasks as complete. Requires taskId and projectId obtained beforehand via get_tasks. Use tasks for batch completion.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (from get_tasks result)' },
        projectId: { type: 'string', description: 'Project ID (from get_tasks result)' },
        tasks: { type: 'array', items: { type: 'object' }, description: 'Multiple tasks to complete, each with taskId and projectId' },
      },
    },
  },
  {
    name: 'delete_task',
    description: 'Permanently delete a TickTick task. Requires taskId and projectId from get_tasks. Cannot be undone.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (from get_tasks result)' },
        projectId: { type: 'string', description: 'Project ID (from get_tasks result)' },
      },
      required: ['taskId', 'projectId'],
    },
  },
  {
    name: 'get_gmail_inbox',
    description:
      'Fetch Gmail inbox messages across registered accounts. Use this to get message ids and account values before trash_gmail, archive_gmail, get_email_detail, or reply flows.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: { type: 'number', description: 'Maximum messages per account (default 100)' },
        account: { type: 'string', description: 'Optional email account to restrict to' },
      },
    },
  },
  {
    name: 'trash_gmail',
    description:
      'Move one or more Gmail messages to trash. Use this for user-approved email deletion/trashing instead of run_claude_code or shell commands. Requires message ids and account from Gmail lookup results. Use account+ids for one account, or targets for messages across multiple accounts.',
    parameters: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Email account address from Gmail results' },
        ids: { type: 'array', items: { type: 'string' }, description: 'Message IDs to move to trash' },
        targets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              account: { type: 'string', description: 'Email account address from Gmail results' },
              id: { type: 'string', description: 'Message ID to move to trash' },
            },
            required: ['account', 'id'],
          },
          description: 'Messages to trash across multiple Gmail accounts',
        },
      },
    },
  },
  {
    name: 'archive_gmail',
    description:
      'Archive one or more Gmail messages by removing them from the inbox. Use this for user-approved email archiving instead of run_claude_code or shell commands. Requires message ids and account from Gmail lookup results. Use account+ids for one account, or targets for messages across multiple accounts.',
    parameters: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Email account address from Gmail results' },
        ids: { type: 'array', items: { type: 'string' }, description: 'Message IDs to archive' },
        targets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              account: { type: 'string', description: 'Email account address from Gmail results' },
              id: { type: 'string', description: 'Message ID to archive' },
            },
            required: ['account', 'id'],
          },
          description: 'Messages to archive across multiple Gmail accounts',
        },
      },
    },
  },
  {
    name: 'update_profile',
    description: 'Call this when the user shares personal information or says "remember this". key = field name (e.g. "name", "job", "hobby"), value = the content to persist.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Field name (e.g. "name", "job", "address", "hobby")' },
        value: { type: 'string', description: 'Content to store' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'delete_profile',
    description: 'Delete a specific field from the profile. Call when asked to remove or forget a piece of information.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Field name to delete' },
      },
      required: ['key'],
    },
  },
  {
    name: 'update_task',
    description: 'Update title, due date/time, priority, description, or subtasks of one or more TickTick tasks. Confirm taskId and projectId via get_tasks before calling. Use tasks for batch updates.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID (from get_tasks result)' },
        projectId: { type: 'string', description: 'Project ID (from get_tasks result)' },
        title: { type: 'string', description: 'New title (if changing)' },
        due: { type: 'string', description: 'New due: YYYY-MM-DD (all-day) or "YYYY-MM-DD HH:mm" (with time, JST). Pass null to clear.' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'none'], description: 'New priority ("none" to clear)' },
        description: { type: 'string', description: 'New note/description. Pass null to clear.' },
        addSubtasks: { type: 'array', items: { type: 'string' }, description: 'New subtask titles to append to the existing checklist' },
        updateSubtasks: { type: 'array', items: { type: 'object' }, description: 'Update existing subtask titles: [{id, title}, ...]' },
        tasks: { type: 'array', items: { type: 'object' }, description: 'Multiple task updates, each with taskId, projectId, and fields to change' },
      },
    },
  },
  {
    name: 'get_weather',
    description: 'Get a weather forecast. Call directly when asked about weather or whether to bring an umbrella.',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'Place name (e.g. "Tokyo", "Osaka", "Sapporo")' },
      },
      required: ['location'],
    },
  },
  {
    name: 'create_calendar_event',
    description:
      'Create one or more Google Calendar events. If attendees are specified, a confirmation dialog appears and invites are only sent if the user confirms. Use events for multiple event creation.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        startDateTime: { type: 'string', description: 'Start date/time (ISO 8601 or YYYY-MM-DD)' },
        endDateTime: { type: 'string', description: 'End date/time (ISO 8601 or YYYY-MM-DD)' },
        account: { type: 'string', description: 'Google account email' },
        allDay: { type: 'boolean', description: 'Set true for all-day events' },
        location: { type: 'string', description: 'Location' },
        description: { type: 'string', description: 'Description' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee email addresses' },
        timeZone: { type: 'string', description: 'Time zone' },
        events: {
          type: 'array',
          items: { type: 'object' },
          description: 'Multiple events to create; each item uses title, startDateTime, endDateTime, and optional account/allDay/location/description/attendees/timeZone',
        },
      },
    },
  },
  {
    name: 'analyze_screen',
    description: 'Capture and analyze the current screen. Use when asked what is on screen or what app is open.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'What you want to know about the screen (optional)' },
      },
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for the latest information, news, or general lookups.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'untrash_gmail',
    description:
      'Restore one or more Gmail messages from trash back to the inbox. Use account+ids for one account, or targets for messages across multiple accounts.',
    parameters: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Email account address from Gmail results' },
        ids: { type: 'array', items: { type: 'string' }, description: 'Message IDs to restore from trash' },
        targets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              account: { type: 'string', description: 'Email account address' },
              id: { type: 'string', description: 'Message ID to restore' },
            },
            required: ['account', 'id'],
          },
          description: 'Messages to restore across multiple Gmail accounts',
        },
      },
    },
  },
  {
    name: 'block_sender',
    description:
      'Block a sender by creating a Gmail spam filter. Future emails from this sender will go to spam automatically. Requires gmail.settings.basic scope — prompt user to re-auth if this fails.',
    parameters: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Gmail account to apply the block on' },
        senderEmail: { type: 'string', description: 'Email address of the sender to block' },
      },
      required: ['account', 'senderEmail'],
    },
  },
  {
    name: 'unblock_sender',
    description:
      'Unblock a sender by deleting the Gmail spam filter for that address. Requires gmail.settings.basic scope — prompt user to re-auth if this fails.',
    parameters: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Gmail account to remove the block from' },
        senderEmail: { type: 'string', description: 'Email address of the sender to unblock' },
      },
      required: ['account', 'senderEmail'],
    },
  },
  {
    name: 'search_gmail',
    description: 'Search Gmail messages by keyword, sender, subject, etc. Supports Gmail search operators including in:trash for trash search. Results are shown on the display.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query (e.g. "from:hoge@example.com", "subject:invoice", "in:trash subject:Amazon")' },
        account: { type: 'string', description: 'Restrict to a specific account (omit to search all accounts)' },
        maxResults: { type: 'number', description: 'Max results per account (default 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_drive_recent',
    description: 'List recently modified files on Google Drive (excludes trashed). Returns id, name, mimeType, modifiedTime, owner, webViewLink. Use this to find a fileId before calling read_drive_file / move_drive_item / etc.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: { type: 'number', description: 'Max files to return (1–100, default 30)' },
        account: { type: 'string', description: 'Google account email (omit to use the default)' },
      },
    },
  },
  {
    name: 'list_drive_folder',
    description: 'List the contents of a specific Google Drive folder. Pass folderId obtained from list_drive_recent / search_drive (item with isFolder:true), or "root" for the My Drive top level. Folders sort first. Use this to browse into a folder the user mentions by name.',
    parameters: {
      type: 'object',
      properties: {
        folderId: { type: 'string', description: 'Drive folder ID, or "root" for top level' },
        maxResults: { type: 'number', description: 'Max items to return (1–100, default 100)' },
        account: { type: 'string', description: 'Google account email' },
      },
      required: ['folderId'],
    },
  },
  {
    name: 'search_drive',
    description: 'Search Google Drive files by name and full-text content (excludes trashed). Optionally filter by mimeType. Results are also shown on the Drive panel.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword' },
        mimeType: { type: 'string', description: 'Optional mimeType filter (e.g. "application/vnd.google-apps.document", "application/pdf", "application/vnd.google-apps.folder")' },
        maxResults: { type: 'number', description: 'Max files to return (1–100, default 30)' },
        account: { type: 'string', description: 'Google account email' },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_drive_file',
    description: 'Read the text contents of a Drive file. Google Docs/Sheets/Slides are exported to text/csv. Plain-text/JSON files are downloaded directly. Binary files cannot be read this way. Truncated at 256 KB. Get fileId from list_drive_recent or search_drive first.',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Drive file ID' },
        account: { type: 'string', description: 'Google account email' },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'create_drive_file',
    description: 'Create a new file on Drive with text content. Defaults to text/plain at the account root. Pass parentId to put it in a specific folder.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'File name' },
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
    description: 'Upload a local file to Drive after user confirmation. mimeType is inferred. Pass parentId to upload into a specific folder.',
    parameters: {
      type: 'object',
      properties: {
        localPath: { type: 'string', description: 'Local file path (~ accepted)' },
        name: { type: 'string', description: 'Override the uploaded name' },
        parentId: { type: 'string', description: 'Optional parent folder ID' },
        account: { type: 'string', description: 'Google account email' },
      },
      required: ['localPath'],
    },
  },
  {
    name: 'move_drive_item',
    description: 'Move one or more Drive files or folders. Use fileIds with one newParentId for a batch into the same folder, or items for per-file destinations/accounts. Get ids via list_drive_recent / search_drive first.',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'File or folder ID to move' },
        fileIds: { type: 'array', items: { type: 'string' }, description: 'File or folder IDs to move to the same destination folder' },
        newParentId: { type: 'string', description: 'Destination folder ID' },
        account: { type: 'string', description: 'Google account email' },
        items: { type: 'array', items: { type: 'object' }, description: 'Multiple move items, each with fileId, newParentId, and optional account' },
      },
    },
  },
  {
    name: 'copy_drive_item',
    description: 'Copy one or more Drive files. Optionally rename and place in a parent folder. Folders cannot be copied through this API. Use fileIds for a batch or items for per-file names/parents/accounts.',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'File ID to copy' },
        fileIds: { type: 'array', items: { type: 'string' }, description: 'File IDs to copy' },
        newName: { type: 'string', description: 'Optional new name' },
        parentId: { type: 'string', description: 'Optional destination folder ID' },
        account: { type: 'string', description: 'Google account email' },
        items: { type: 'array', items: { type: 'object' }, description: 'Multiple copy items, each with fileId and optional newName, parentId, account' },
      },
    },
  },
  {
    name: 'trash_drive_item',
    description: 'Move one or more Drive files or folders to the trash. Recoverable for 30 days, then Drive purges it. Permanent deletion is not supported.',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'File or folder ID to trash' },
        fileIds: { type: 'array', items: { type: 'string' }, description: 'File or folder IDs to trash' },
        account: { type: 'string', description: 'Google account email' },
        items: { type: 'array', items: { type: 'object' }, description: 'Multiple trash items, each with fileId and optional account' },
      },
    },
  },
  {
    name: 'share_drive_item',
    description: 'Share one or more Drive files or folders. A confirmation dialog appears and invites are only sent if the user confirms. Use fileIds for several files to the same recipient/role, or items for per-file recipients/roles.',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'File or folder ID' },
        fileIds: { type: 'array', items: { type: 'string' }, description: 'File or folder IDs to share with the same recipient and role' },
        email: { type: 'string', description: 'Email address to share with' },
        role: { type: 'string', enum: ['reader', 'commenter', 'writer'], description: 'Permission level' },
        account: { type: 'string', description: 'Google account email (the owner)' },
        items: { type: 'array', items: { type: 'object' }, description: 'Multiple share items, each with fileId, email, role, and optional account' },
      },
    },
  },
  {
    name: 'open_app',
    description:
      'Launch a macOS application. app_name must be the official English name (e.g. "Safari", "Finder", "Google Chrome").',
    parameters: {
      type: 'object',
      properties: {
        app_name: {
          type: 'string',
          description: 'Official English app name (e.g. "Notion", "Spotify", "Google Chrome")',
        },
      },
      required: ['app_name'],
    },
  },
  {
    name: 'type_text',
    description:
      'Type literal text into the currently focused application as if the user typed it. Non-ASCII text (Japanese etc.) is pasted via the clipboard. Useful after open_app + press_keys to drive an app, e.g. typing a URL into a browser address bar.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to type. Newlines become Return key presses.' },
      },
      required: ['text'],
    },
  },
  {
    name: 'press_keys',
    description:
      'Press a keyboard shortcut or special key on the currently focused application. Examples: "cmd+t" (new tab), "cmd+shift+n" (new private window), "cmd+l" (focus address bar), "enter", "escape", "tab", "up". Modifiers: cmd/shift/alt/option/ctrl. Special keys: enter/return, tab, space, delete, escape, up/down/left/right, home, end, pageup, pagedown.',
    parameters: {
      type: 'object',
      properties: {
        combo: {
          type: 'string',
          description: 'Key combo like "cmd+t" or single key like "enter".',
        },
      },
      required: ['combo'],
    },
  },
  {
    name: 'wait',
    description:
      'Pause for a short time before the next tool call. Use between open_app and press_keys, or after press_keys when an app needs a moment to react (autocomplete, page load). Capped at 5 seconds.',
    parameters: {
      type: 'object',
      properties: {
        seconds: {
          type: 'number',
          description: 'Seconds to wait (fractional allowed, e.g. 0.5). Max 5.',
        },
      },
      required: ['seconds'],
    },
  },
  {
    name: 'show_panel',
    description:
      'Display email, calendar, tasks, AI news, tools, movies, timers, or recent Drive files in a dedicated panel. Only call when the user explicitly asks to show or display something. For checks like "any new mail?" use delegate_task instead. The response data field contains raw data — summarize it verbally as usual and note that it is also shown on screen.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: [
            'email',
            'calendar_today',
            'calendar_tomorrow',
            'calendar_week',
            'tasks',
            'news',
            'tools',
            'movies',
            'timer',
            'drive_recent',
            'terminal_output',
          ],
          description:
            'email=Gmail inbox, calendar_today=today\'s events, calendar_tomorrow=tomorrow, calendar_week=next 7 days, tasks=TickTick incomplete, news=AI news daily digest, tools=recommended tools, movies=now-playing/upcoming movies, timer=active timers and stopwatches, drive_recent=recently modified Google Drive files, terminal_output=interactive shell terminal',
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'start_timer',
    description: 'Start a countdown timer. Opens the timer panel automatically. Multiple timers can run simultaneously.',
    parameters: {
      type: 'object',
      properties: {
        duration_seconds: { type: 'number', description: 'Duration in seconds (e.g. 180 for 3 minutes)' },
        name: { type: 'string', description: 'Optional label for this timer (e.g. "ポモドーロ", "cooking")' },
      },
      required: ['duration_seconds'],
    },
  },
  {
    name: 'pause_timer',
    description: 'Pause a running countdown timer by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Timer ID (e.g. "timer-1")' },
      },
      required: ['id'],
    },
  },
  {
    name: 'resume_timer',
    description: 'Resume a paused countdown timer by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Timer ID (e.g. "timer-1")' },
      },
      required: ['id'],
    },
  },
  {
    name: 'cancel_timer',
    description: 'Cancel and remove a countdown timer by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Timer ID (e.g. "timer-1")' },
      },
      required: ['id'],
    },
  },
  {
    name: 'start_stopwatch',
    description: 'Start a stopwatch. Opens the timer panel automatically. Multiple stopwatches can run simultaneously.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Optional label for this stopwatch' },
      },
    },
  },
  {
    name: 'pause_stopwatch',
    description: 'Pause a running stopwatch by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Stopwatch ID (e.g. "sw-1")' },
      },
      required: ['id'],
    },
  },
  {
    name: 'resume_stopwatch',
    description: 'Resume a paused stopwatch by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Stopwatch ID (e.g. "sw-1")' },
      },
      required: ['id'],
    },
  },
  {
    name: 'stop_stopwatch',
    description: 'Stop and finalize a stopwatch by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Stopwatch ID (e.g. "sw-1")' },
      },
      required: ['id'],
    },
  },
  {
    name: 'cd',
    description:
      'Change the working directory. Validates that the path exists and is a directory before switching, runs `ls -la` so the contents show up in the terminal panel, and mirrors the cd into the live pty. Subsequent run_command / run_claude_code calls execute in the new cwd. If the response contains an `error` field the cd did NOT happen — surface the failure or retry with a corrected path; do NOT claim success.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Destination path (~/... format accepted)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'run_command',
    description:
      'Run a shell command and display the output on screen. Supports git, ls, cat, npm, and anything else. If cwd is omitted, runs in the current working directory. Results appear in the panel. Always inspect ok/exitCode/stdout/stderr before answering. If ok is false, say the command failed and use stderr to explain or retry. Do not use this for persistent directory changes; call the cd tool instead. Do not run Claude Code commands through this tool; use run_claude_code for code work and dedicated app tools for email/calendar/Drive actions.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to execute (zsh)',
        },
        cwd: {
          type: 'string',
          description: 'Override directory for this run only',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'run_claude_code',
    description:
      'Type a prompt into the interactive Claude Code terminal. If Claude Code is already open, paste the prompt there; otherwise start `cc` in the current working directory and paste the prompt. Use this only for codebase work such as reading code, editing files, debugging, tests, refactors, or reviews. Do not use this for Gmail deletion/archive, calendar changes, Drive operations, tasks, or profile updates; use the dedicated tools. This returns after handing off the prompt; the user should watch the terminal panel for progress and results. Write the prompt in the SAME language the user is currently speaking to VEGA in (the configured/active language), and append an explicit instruction telling Claude Code to also respond in that same language. The prompt MUST be written in polite/formal register and contain three labelled sections: 依頼内容 (request), 背景 (background), 注意点 (caveats) — never relay the user\'s raw words; infer background and caveats from conversation context.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Instructions for Claude Code. Must be written in the same language the user is speaking to VEGA, and must explicitly tell Claude Code to respond in that same language.',
        },
        cwd: {
          type: 'string',
          description: 'Override directory for this run only',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'learn_procedure',
    description:
      'Save a new procedure for future use. Call this AFTER the user has taught you how to do something ' +
      'and you have successfully executed it once. Use a short identifier name (in the user language) and a ' +
      'description that includes concrete URLs/commands/app names so future-you can re-execute via ' +
      'run_command/open_app/etc. Re-calling with the SAME name overwrites the existing procedure.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Short identifier (e.g. "大学のコースページを開く")',
        },
        description: {
          type: 'string',
          description: 'Concrete steps including full URLs, exact commands, exact app names',
        },
      },
      required: ['name', 'description'],
    },
  },
  {
    name: 'forget_procedure',
    description:
      'Remove a previously learned procedure by exact name. Use only when the user explicitly asks to forget.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact name of the procedure to remove' },
      },
      required: ['name'],
    },
  },
  {
    name: 'music_play_pause',
    description: 'Apple Music の再生・一時停止をトグルする。',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'music_next_track',
    description: 'Apple Music で次の曲にスキップする。',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'music_prev_track',
    description: 'Apple Music で前の曲に戻る。',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'music_stop',
    description: 'Apple Music の再生を停止する。',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'music_get_current',
    description: '現在 Apple Music で再生中の曲名・アーティスト・アルバム・再生状態を取得する。',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'music_set_volume',
    description: 'Apple Music の音量を 0〜100 の範囲で設定する。',
    parameters: {
      type: 'object',
      properties: {
        level: { type: 'number', description: '音量 (0〜100)' },
      },
      required: ['level'],
    },
  },
  {
    name: 'music_play_track',
    description: 'Apple Music のライブラリから曲名またはアーティスト名で検索して再生する。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '曲名またはアーティスト名' },
      },
      required: ['query'],
    },
  },
]
