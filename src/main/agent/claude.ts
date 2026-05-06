import Anthropic from '@anthropic-ai/sdk'
import { getEnabledToolSchemas, executeTool } from '../skills/dispatcher'
import { captureScreen } from '../screenshot'
import { LIMITS, MODELS } from '../../config/models'
import { getSecretSync } from '../skills/secrets/index'
import SYSTEM_PROMPT from '../../prompts/claude-delegate.md?raw'

const MAX_ITERATIONS = LIMITS.claudeMaxIterations
const MODEL = MODELS.claudeDelegate

function buildDateContext(): string {
  const now = new Date()
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const city = tz.split('/').pop()?.replace(/_/g, ' ') ?? tz
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz,
  })
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: tz })
  return `[Current Context]\n- DateTime: ${dateStr}, ${timeStr}\n- Timezone: ${tz} (default location: "${city}")`
}

export async function runClaudeTask(opts: {
  task: string
  includeScreenshot?: boolean
}): Promise<string> {
  const apiKey = getSecretSync('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return 'ANTHROPIC_API_KEY is not set. Configure it in Settings → Skills.'
  }

  let client: Anthropic
  try {
    client = new Anthropic({ apiKey, maxRetries: 5 })
  } catch (err) {
    return `Failed to initialize Anthropic client: ${String(err)}`
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
      userContent.push({ type: 'text', text: `(screenshot capture failed: ${String(err)})` })
    }
  }

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userContent }]
  const tools = await getEnabledToolSchemas()

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let res: Anthropic.Message
    try {
      res = await client.messages.create({
        model: MODEL,
        max_tokens: LIMITS.claudeMaxTokens,
        thinking: { type: 'enabled', budget_tokens: 2048 },
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: buildDateContext() },
        ],
        tools,
        messages,
      })
    } catch (err) {
      return `Claude API call failed: ${String(err)}`
    }

    messages.push({ role: 'assistant', content: res.content })

    if (res.stop_reason === 'end_turn') {
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim()
      return text || 'Task completed but no content to return'
    }

    if (res.stop_reason === 'tool_use') {
      const toolUses = res.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      )
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (tu): Promise<Anthropic.ToolResultBlockParam> => {
          // Avoid recursing into a sub-runClaudeTask: take a fresh screenshot and
          // attach it to the tool result so the agent can read it itself next turn.
          if (tu.name === 'analyze_screen') {
            try {
              const shot = await captureScreen()
              return {
                type: 'tool_result',
                tool_use_id: tu.id,
                content: [
                  { type: 'text', text: 'Screenshot attached.' },
                  {
                    type: 'image',
                    source: { type: 'base64', media_type: shot.mediaType, data: shot.base64 },
                  },
                ],
              }
            } catch (err) {
              return {
                type: 'tool_result',
                tool_use_id: tu.id,
                content: `screenshot capture failed: ${String(err)}`,
                is_error: true,
              }
            }
          }
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

  return 'Max iterations reached. Task stopped mid-way'
}
