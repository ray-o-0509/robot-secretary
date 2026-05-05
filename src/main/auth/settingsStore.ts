import type { Client } from '@libsql/client'
import { defaultSkillsEnabled, type SkillsEnabled } from '../../config/skills'

export type DefaultApps = {
  email?: string
  browser?: string
  terminal?: string
  editor?: string
}

export type UserSettings = {
  language: string
  robotSize: number
  defaultApps: DefaultApps
  skillToggles: SkillsEnabled
}

const DEFAULT_SETTINGS: UserSettings = {
  language: 'ja-JP',
  robotSize: 300,
  defaultApps: {},
  skillToggles: defaultSkillsEnabled(),
}

let _userId: string | null = null
let _db: Client | null = null
let _cached: UserSettings | null = null

export function initSettingsStore(userId: string, db: Client): void {
  _userId = userId
  _db = db
  _cached = null
}

export async function loadSettings(): Promise<UserSettings> {
  if (_cached) return { ..._cached }
  if (!_userId || !_db) throw new Error('settingsStore not initialized')

  const result = await _db.execute({
    sql: 'SELECT language, robot_size, default_apps, skill_toggles FROM settings WHERE user_id = ?',
    args: [_userId],
  })

  if (result.rows.length === 0) {
    await _db.execute({
      sql: `INSERT INTO settings (user_id, language, robot_size, default_apps, skill_toggles, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        _userId,
        DEFAULT_SETTINGS.language,
        DEFAULT_SETTINGS.robotSize,
        JSON.stringify(DEFAULT_SETTINGS.defaultApps),
        JSON.stringify(DEFAULT_SETTINGS.skillToggles),
        new Date().toISOString(),
      ],
    })
    _cached = { ...DEFAULT_SETTINGS }
    return { ..._cached }
  }

  const row = result.rows[0]
  _cached = {
    language: (row.language as string) ?? DEFAULT_SETTINGS.language,
    robotSize: (row.robot_size as number) ?? DEFAULT_SETTINGS.robotSize,
    defaultApps: parseJson(row.default_apps as string, {}),
    skillToggles: parseJson(row.skill_toggles as string, defaultSkillsEnabled()),
  }
  return { ..._cached }
}

export async function saveSettings(partial: Partial<UserSettings>): Promise<UserSettings> {
  if (!_userId || !_db) throw new Error('settingsStore not initialized')
  const current = await loadSettings()
  const updated: UserSettings = {
    language: partial.language ?? current.language,
    robotSize: partial.robotSize ?? current.robotSize,
    defaultApps: partial.defaultApps ?? current.defaultApps,
    skillToggles: partial.skillToggles ?? current.skillToggles,
  }
  await _db.execute({
    sql: `INSERT INTO settings (user_id, language, robot_size, default_apps, skill_toggles, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            language=excluded.language,
            robot_size=excluded.robot_size,
            default_apps=excluded.default_apps,
            skill_toggles=excluded.skill_toggles,
            updated_at=excluded.updated_at`,
    args: [
      _userId,
      updated.language,
      updated.robotSize,
      JSON.stringify(updated.defaultApps),
      JSON.stringify(updated.skillToggles),
      new Date().toISOString(),
    ],
  })
  _cached = updated
  return { ...updated }
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}
