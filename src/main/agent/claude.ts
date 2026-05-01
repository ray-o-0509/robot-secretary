import Anthropic from '@anthropic-ai/sdk'
import { toolSchemas, executeTool } from '../skills/dispatcher'
import { captureScreen } from '../screenshot'
import { LIMITS, MODELS } from '../../config/models'
import SYSTEM_PROMPT from '../../prompts/claude-delegate.md?raw'

const MAX_ITERATIONS = LIMITS.claudeMaxIterations
const MODEL = MODELS.claudeDelegate

function buildDateContext(): string {
  const now = new Date()
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const city = tz.split('/').pop()?.replace(/_/g, ' ') ?? tz
  const dateStr = now.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: tz,
  })
  const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: tz })
  return `【現在の状況】\n- 日時: ${dateStr} ${timeStr}\n- タイムゾーン: ${tz}（デフォルト地名: "${city}"）`
}

export async function runClaudeTask(opts: {
  task: string
  includeScreenshot?: boolean
}): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return 'ANTHROPIC_API_KEY が設定されてねえ。.env.local に書いとけ'
  }

  let client: Anthropic
  try {
    client = new Anthropic()
  } catch (err) {
    return `Anthropic クライアント初期化失敗: ${String(err)}`
  }

  const userContent: Anthropic.ContentBlockParam[] = [{ type: 'text', text: opts.task }]
  if (opts.includeScreenshot) {
    try {
      const shot = await captureScreen()
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: shot.mediaType, data: shot.base64 },
      })
    } catch (err) {
      userContent.push({ type: 'text', text: `（スクショ取得失敗: ${String(err)}）` })
    }
  }

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userContent }]

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let res: Anthropic.Message
    try {
      res = await client.messages.create({
        model: MODEL,
        max_tokens: LIMITS.claudeMaxTokens,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: buildDateContext() },
        ],
        tools: toolSchemas,
        messages,
      })
    } catch (err) {
      return `Claude 呼び出し失敗: ${String(err)}`
    }

    messages.push({ role: 'assistant', content: res.content })

    if (res.stop_reason === 'end_turn') {
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim()
      return text || '作業は終わったが返す内容がねえ'
    }

    if (res.stop_reason === 'tool_use') {
      const toolUses = res.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      )
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (tu): Promise<Anthropic.ToolResultBlockParam> => {
          try {
            const result = await executeTool(tu.name, tu.input as Record<string, unknown>)
            return {
              type: 'tool_result',
              tool_use_id: tu.id,
              content: JSON.stringify(result),
            }
          } catch (err) {
            return {
              type: 'tool_result',
              tool_use_id: tu.id,
              content: String(err),
              is_error: true,
            }
          }
        })
      )
      messages.push({ role: 'user', content: toolResults })
      continue
    }

    break
  }

  return 'ループ上限に達した。作業途中で止めた'
}
