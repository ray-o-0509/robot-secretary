import jaPersona from './persona/ja.md?raw'
import enPersona from './persona/en.md?raw'
import zhPersona from './persona/zh.md?raw'
import koPersona from './persona/ko.md?raw'

import core from './core.md?raw'
import openApp from '../../skills/open-app/prompt.md?raw'
import webSearch from '../../skills/web-search/prompt.md?raw'
import profile from '../../skills/profile/prompt.md?raw'
import tasks from '../../skills/tasks/prompt.md?raw'
import weather from '../../skills/weather/prompt.md?raw'
import screen from '../../skills/screen/prompt.md?raw'
import shell from '../../skills/shell/prompt.md?raw'
import panel from '../../display/prompt.md?raw'

const SKILLS = [
  core,
  openApp,
  webSearch,
  profile,
  tasks,
  weather,
  screen,
  shell,
  panel,
].join('\n\n')

export function buildPrompt(languageCode: string): string {
  let persona: string
  if (languageCode.startsWith('zh')) persona = zhPersona
  else if (languageCode.startsWith('ko')) persona = koPersona
  else if (languageCode.startsWith('en')) persona = enPersona
  else persona = jaPersona

  return persona + '\n\n' + SKILLS
}
