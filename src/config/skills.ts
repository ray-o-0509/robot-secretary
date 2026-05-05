// Skill registry — groups tool names into user-toggleable skills.
// Tool names referenced here must match those declared in
// src/main/skills/dispatcher.ts (toolSchemas) and src/config/tools.ts (secretaryTools).

export type SkillId =
  | 'gmail'
  | 'calendar'
  | 'tasks'
  | 'drive'
  | 'weather'
  | 'web_search'
  | 'open_app'
  | 'keyboard'
  | 'timer'
  | 'shell'
  | 'screen'
  | 'memory'
  | 'dashboard'

export type SkillSecret = {
  key: string
  label: string
  hint?: string
}

export type SkillDef = {
  id: SkillId
  label: string
  description: string
  tools: string[]
  defaultEnabled: boolean
  secrets?: SkillSecret[]
}

// App-wide secrets shown at the top of the Skills tab (not tied to a single skill).
export const CORE_SECRETS: SkillSecret[] = [
  { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key', hint: 'Claude エージェント (delegate_task) で使用' },
  { key: 'GEMINI_API_KEY', label: 'Gemini API Key', hint: 'Gemini Live 音声会話とメモリ要約で使用' },
]

export const SKILL_REGISTRY: SkillDef[] = [
  {
    id: 'gmail',
    label: 'Gmail',
    description: 'Gmail の受信トレイ取得・検索・返信・アーカイブ・ゴミ箱',
    tools: ['get_gmail_inbox', 'trash_gmail', 'archive_gmail', 'get_email_detail', 'reply_gmail', 'search_gmail'],
    defaultEnabled: true,
  },
  {
    id: 'calendar',
    label: 'Google Calendar',
    description: '予定の取得と作成',
    tools: ['get_calendar_events', 'create_calendar_event'],
    defaultEnabled: true,
  },
  {
    id: 'tasks',
    label: 'TickTick タスク',
    description: 'TickTick のタスク作成・更新・完了',
    tools: ['get_tasks', 'create_task', 'complete_task', 'complete_subtask', 'update_task'],
    defaultEnabled: true,
    secrets: [{ key: 'TICKTICK_ACCESS_TOKEN', label: 'TickTick Access Token', hint: 'TickTick OAuth で取得したアクセストークン' }],
  },
  {
    id: 'drive',
    label: 'Google Drive',
    description: 'Drive のファイル一覧・検索・読み書き・共有',
    tools: [
      'list_drive_recent', 'list_drive_folder', 'search_drive', 'read_drive_file',
      'create_drive_file', 'upload_drive_file', 'move_drive_item', 'copy_drive_item',
      'trash_drive_item', 'share_drive_item',
    ],
    defaultEnabled: true,
  },
  {
    id: 'weather',
    label: '天気',
    description: '指定地点の現在の天気と3日間の予報',
    tools: ['get_weather'],
    defaultEnabled: true,
  },
  {
    id: 'web_search',
    label: 'Web 検索',
    description: 'Web を検索して最新情報を取得',
    tools: ['web_search'],
    defaultEnabled: true,
    secrets: [{ key: 'TAVILY_API_KEY', label: 'Tavily API Key', hint: 'tavily.com で取得' }],
  },
  {
    id: 'open_app',
    label: 'アプリ起動',
    description: 'macOS アプリの起動',
    tools: ['open_app'],
    defaultEnabled: true,
  },
  {
    id: 'keyboard',
    label: 'キーボード操作',
    description: 'テキスト入力・キーボードショートカット・待機',
    tools: ['type_text', 'press_keys', 'wait'],
    defaultEnabled: true,
  },
  {
    id: 'timer',
    label: 'タイマー / ストップウォッチ',
    description: 'カウントダウンタイマーとストップウォッチ',
    tools: [
      'start_timer', 'pause_timer', 'resume_timer', 'cancel_timer',
      'start_stopwatch', 'pause_stopwatch', 'resume_stopwatch', 'stop_stopwatch',
    ],
    defaultEnabled: true,
  },
  {
    id: 'shell',
    label: 'シェル実行',
    description: 'zsh コマンドの実行',
    tools: ['run_command'],
    defaultEnabled: true,
  },
  {
    id: 'screen',
    label: '画面解析',
    description: '現在のスクリーンショットを解析',
    tools: ['analyze_screen'],
    defaultEnabled: true,
  },
  {
    id: 'memory',
    label: 'メモリ / 手順学習',
    description: 'プロフィール項目の保存と手順の学習',
    tools: ['update_profile', 'delete_profile', 'learn_procedure', 'forget_procedure'],
    defaultEnabled: true,
  },
  {
    id: 'dashboard',
    label: 'ダッシュボード',
    description: '日次ダイジェスト (AI ニュース・ツール・映画など)',
    tools: ['get_dashboard_entry'],
    defaultEnabled: true,
    secrets: [
      { key: 'TURSO_DATABASE_URL', label: 'Turso Database URL', hint: 'libsql://… 形式' },
      { key: 'TURSO_AUTH_TOKEN', label: 'Turso Auth Token' },
    ],
  },
]

export type SkillsEnabled = Record<string, boolean>

export function defaultSkillsEnabled(): SkillsEnabled {
  const out: SkillsEnabled = {}
  for (const s of SKILL_REGISTRY) out[s.id] = s.defaultEnabled
  return out
}

// Tools that are not part of any optional skill — always allowed.
const SKILL_TOOL_SET = new Set(SKILL_REGISTRY.flatMap((s) => s.tools))

export function isToolEnabled(toolName: string, enabled: SkillsEnabled): boolean {
  if (!SKILL_TOOL_SET.has(toolName)) return true
  for (const skill of SKILL_REGISTRY) {
    if (skill.tools.includes(toolName)) {
      return enabled[skill.id] ?? skill.defaultEnabled
    }
  }
  return true
}
