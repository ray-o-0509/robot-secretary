import { spawn } from 'node:child_process'
import { homedir } from 'node:os'

const CLI_TIMEOUT_MS = 120_000

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

export async function runClaudeTaskCli(opts: { task: string }): Promise<string> {
  const prompt = `${buildDateContext()}\n\n${opts.task}`

  return new Promise((resolve) => {
    const args = ['-p', prompt, '--output-format', 'text']

    let proc: ReturnType<typeof spawn>
    try {
      proc = spawn('claude', args, {
        cwd: homedir(),
        env: { ...process.env, HOME: homedir() },
      })
    } catch (err) {
      resolve(`Failed to spawn claude CLI: ${String(err)}`)
      return
    }

    const stdout: string[] = []
    const stderr: string[] = []

    proc.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk.toString()))
    proc.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString()))

    const timer = setTimeout(() => {
      proc.kill()
      resolve('claude -p timed out after 120 seconds')
    }, CLI_TIMEOUT_MS)

    proc.on('error', (err) => {
      clearTimeout(timer)
      resolve(`claude -p error: ${String(err)}`)
    })

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        const errText = stderr.join('').trim()
        resolve(`claude -p failed (exit ${code ?? '?'}): ${errText || '(no output)'}`)
      } else {
        resolve(stdout.join('').trim() || 'Task completed but no content to return')
      }
    })
  })
}
