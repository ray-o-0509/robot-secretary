import { loadSettings, saveSettings } from '../../auth/settingsStore'
import { defaultSkillsEnabled, SKILL_REGISTRY, type SkillsEnabled } from '../../../config/skills'

let cache: SkillsEnabled | null = null

export async function loadSkillsEnabled(): Promise<SkillsEnabled> {
  if (cache) return { ...cache }
  try {
    const settings = await loadSettings()
    const merged = defaultSkillsEnabled()
    for (const skill of SKILL_REGISTRY) {
      if (typeof settings.skillToggles[skill.id] === 'boolean') {
        merged[skill.id] = settings.skillToggles[skill.id]
      }
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
  await saveSettings({ skillToggles: merged })
  cache = merged
  return { ...merged }
}

export async function setSkillEnabled(id: string, enabled: boolean): Promise<SkillsEnabled> {
  const current = await loadSkillsEnabled()
  current[id] = enabled
  return await saveSkillsEnabled(current)
}

// Synchronous-style accessor for the dispatcher. Returns the cached snapshot,
// falling back to defaults if the store hasn't been loaded yet.
export function getSkillsEnabledSync(): SkillsEnabled {
  return cache ? { ...cache } : defaultSkillsEnabled()
}
