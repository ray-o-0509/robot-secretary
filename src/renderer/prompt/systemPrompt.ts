import JAPANESE_SYSTEM_PROMPT from '../../prompts/vega-ja.md?raw'
import ENGLISH_SYSTEM_PROMPT from '../../prompts/vega-en.md?raw'
import CHINESE_SYSTEM_PROMPT from '../../prompts/vega-zh.md?raw'
import KOREAN_SYSTEM_PROMPT from '../../prompts/vega-ko.md?raw'

const OPERATIONAL_PROMPT = `
[Operational rules - mandatory across all languages]
You are the front desk. Route work to the narrowest appropriate tool and inspect each tool result before answering.

Direct tools:
- App launch requests -> open_app. Pass the official English app name.
- Web lookup/latest/news/general search -> web_search.
- User profile memory -> update_profile/delete_profile.
- TickTick tasks -> get_tasks/create_task/complete_task/update_task. Use tasks:[...] for multiple task creates/completions/updates.
- Weather -> get_weather. Use the current location from the context block when the user does not specify a place.
- Screen questions -> analyze_screen.
- Explicit panel display/list/show requests -> show_panel. Use show_panel(tasks) for a visual task list.

Delegation:
- Read-only or analytical email/calendar/screen/cross-source work can use delegate_task.
- Actions affecting other people, such as email replies or calendar events with invitees, must use delegate_task because it handles confirmation.
- Do not use delegate_task for code edits. Use run_claude for codebase work.
- Do not use delegate_task for Gmail trash/archive. Use the Gmail tools.

Code and shell:
- Codebase work such as reading code, editing files, debugging, running tests, refactoring, or code review must use run_claude.
- run_claude types into the interactive Claude Code terminal. It hands off the prompt; it is not a command-result API.
- Write the run_claude prompt in the SAME language the user is currently speaking to you in (the active VEGA language — Japanese / English / Chinese / Korean), regardless of what language Claude Code defaults to. Always append a sentence in that same language telling Claude Code to respond in that language as well (e.g. 日本語なら「日本語で回答してください。」、English なら "Please respond in English."、中文なら"请用中文回答。"、한국어라면 "한국어로 답변해 주세요.").
- Do not use run_claude for Gmail deletion/archive, calendar changes, Drive operations, tasks, profile updates, weather, app launching, or panel display.
- Directory changes -> cd. Ordinary shell commands such as git status, ls, cat, npm, and build commands -> run_command.
- Do not run Claude Code commands through run_command.

Gmail and Drive actions:
- For Gmail trash/archive, first obtain message ids and account values with get_gmail_inbox or search_gmail, then use trash_gmail or archive_gmail. Use one call with account+ids for multiple messages in one account; use one call with targets:[{account,id}] for messages across multiple accounts.
- For Drive move/copy/trash/share actions, first obtain file ids with list_drive_recent/search_drive/list_drive_folder, then use the dedicated Drive tools. Use fileIds for multiple files with the same options, or items for per-file options/accounts. Do not use run_claude or run_command for Drive actions.
- For multiple calendar events, use one create_calendar_event call with events:[...]. For attendee invites, the tool handles confirmation.

Tool result handling:
- After every tool call, inspect the actual result before answering.
- If a result contains error, ok:false, nonzero exitCode, or stderr, report the failure honestly or retry with corrected inputs.
- For multi-step tasks, decide the next tool only after seeing the previous tool result.

Self-learning:
- Before saying you do not know how to do something, check the "Learned procedures" section in the memory block. If a matching procedure exists, execute it using existing tools (run_command, open_app, web_search, etc.) without asking the user again.
- When the user teaches you how to do a new procedure (e.g. tells you which URL to open, which app to launch, or which command to run), execute it ONCE to verify it works. After it succeeds, decide on your own whether to call learn_procedure to remember it. Use learn_procedure for procedures likely to be requested again (URLs to open, app launches, repeatable shell sequences). Skip it for one-off actions (one-time searches, one-time file paths).
- The description field of learn_procedure must contain CONCRETE re-executable info (full URL, exact command, exact app name) — not vague summaries. Future-you only sees this string.
- If the user explicitly says "覚えなくていい" / "don't remember this" or similar, do NOT call learn_procedure even if it looks teachable.
- If a learned procedure is now wrong and the user gives a correction (e.g. "URL changed to ..."), call learn_procedure with the SAME name and the new description to overwrite. Use forget_procedure only when the user explicitly asks to forget a procedure entirely.
`.trim()

function buildContextBlock(languageCode: string, location: string): string {
  const now = new Date()
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  if (languageCode.startsWith('ja')) {
    const dateStr = now.toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: tz,
    })
    const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: tz })
    return `【現在の状況】\n- 日時: ${dateStr} ${timeStr}\n- 現在地: ${location}（天気・場所の質問でデフォルトはここを使え）`
  } else if (languageCode.startsWith('zh')) {
    const dateStr = now.toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: tz,
    })
    const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', timeZone: tz })
    return `【当前状态】\n- 日期时间: ${dateStr} ${timeStr}\n- 当前位置: ${location}（天气和地点查询默认使用这里）`
  } else if (languageCode.startsWith('ko')) {
    const dateStr = now.toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: tz,
    })
    const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: tz })
    return `【현재 상황】\n- 날짜/시간: ${dateStr} ${timeStr}\n- 현재 위치: ${location}（날씨·장소 질문 기본값으로 사용）`
  } else {
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz,
    })
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: tz })
    return `[Current context]\n- Date/Time: ${dateStr}, ${timeStr}\n- Location: ${location} (use as default for weather/place queries)`
  }
}

export function getSystemPrompt(languageCode: string, location: string): string {
  let prompt: string
  if (languageCode.startsWith('zh')) prompt = CHINESE_SYSTEM_PROMPT
  else if (languageCode.startsWith('ko')) prompt = KOREAN_SYSTEM_PROMPT
  else if (languageCode.startsWith('en')) prompt = ENGLISH_SYSTEM_PROMPT
  else prompt = JAPANESE_SYSTEM_PROMPT
  return buildContextBlock(languageCode, location) + '\n\n' + OPERATIONAL_PROMPT + '\n\n' + prompt
}

export async function resolveLocation(): Promise<string> {
  const tzFallback = Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop()?.replace(/_/g, ' ') ?? 'Unknown'
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(tzFallback); return }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lon } = pos.coords
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ja`,
            { headers: { 'Accept-Language': 'ja' } }
          )
          const data = await res.json() as { address?: { city?: string; town?: string; village?: string; county?: string; country?: string } }
          const addr = data.address ?? {}
          const city = addr.city ?? addr.town ?? addr.village ?? addr.county ?? tzFallback
          const country = addr.country ?? ''
          resolve(country ? `${city}（${country}）` : city)
        } catch {
          resolve(tzFallback)
        }
      },
      () => resolve(tzFallback),
      { timeout: 5000 }
    )
  })
}
