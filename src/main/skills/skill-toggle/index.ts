import { app } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { defaultSkillsEnabled, SKILL_REGISTRY, type SkillsEnabled } from '../../../config/skills'

function configPath(): string {
  return path.join(app.getPath('userData'), 'conversations', 'skills-enabled.json')
}

let cache: SkillsEnabled | null = null

export async function loadSkillsEnabled(): Promise<SkillsEnabled> {
  if (cache) return { ...cache }
  try {
    const raw = await fs.readFile(configPath(), 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const merged = defaultSkillsEnabled()
    for (const skill of SKILL_REGISTRY) {
      if (typeof parsed[skill.id] === 'boolean') merged[skill.id] = parsed[skill.id] as boolean
    }
    cache = merged
    return { ...merged }
  } catch {
    const fresh = defaultSkillsEnabled()
    cache = fresh
    return { ...fresh }
  }
}

export async function saveSkillsEnabled(next: SkillsEnabled): Promise<SkillsEnabled> {
  const merged = defaultSkillsEnabled()
  for (const skill of SKILL_REGISTRY) {
    if (typeof next[skill.id] === 'boolean') merged[skill.id] = next[skill.id]
  }
  const file = configPath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`
  await fs.writeFile(tmp, JSON.stringify(merged, null, 2), 'utf8')
  await fs.rename(tmp, file)
  cache = merged
  return { ...merged }
}

export async function setSkillEnabled(id: string, enabled: boolean): Promise<SkillsEnabled> {
  const current = await loadSkillsEnabled()
  current[id] = enabled
  return await saveSkillsEnabled(current)
}

// Synchronous-style accessor for the dispatcher. Returns the cached snapshot,
// falling back to defaults if the file hasn't been read yet.
export function getSkillsEnabledSync(): SkillsEnabled {
  return cache ? { ...cache } : defaultSkillsEnabled()
}
