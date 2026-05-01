import { app } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'

export type DefaultApps = {
  email?: string
  browser?: string
  terminal?: string
  editor?: string
}

// Generic category aliases that should be resolved to the user's configured default.
// Specific app names (e.g. "Spark", "Arc") are NOT in this list so they pass through unchanged.
const CATEGORY_ALIASES: Record<keyof DefaultApps, string[]> = {
  email:    ['mail', 'メール', 'email', 'mail.app'],
  browser:  ['browser', 'ブラウザ'],
  terminal: ['terminal', 'ターミナル'],
  editor:   ['editor', 'エディタ'],
}

function configPath(): string {
  return path.join(app.getPath('userData'), 'conversations', 'default-apps.json')
}

export async function loadDefaultApps(): Promise<DefaultApps> {
  try {
    const raw = await fs.readFile(configPath(), 'utf8')
    return JSON.parse(raw) as DefaultApps
  } catch {
    return {}
  }
}

export async function saveDefaultApps(apps: DefaultApps): Promise<void> {
  const file = configPath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`
  await fs.writeFile(tmp, JSON.stringify(apps, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

// If appName is a generic category alias (e.g. "Mail", "メール"), return the
// configured default for that category.  Otherwise return appName unchanged.
export async function resolveAppName(appName: string): Promise<string> {
  const lower = appName.toLowerCase().trim()
  const defaults = await loadDefaultApps()
  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES) as [keyof DefaultApps, string[]][]) {
    if (aliases.includes(lower)) {
      const override = defaults[category]
      if (override?.trim()) return override.trim()
    }
  }
  return appName
}
