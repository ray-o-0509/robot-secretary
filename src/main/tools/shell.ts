import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export async function runCommand(command: string, cwd: string) {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      shell: '/bin/zsh',
    })
    return { stdout: stdout.trim(), stderr: stderr.trim(), cwd }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return {
      stdout: (e.stdout ?? '').trim(),
      stderr: (e.stderr ?? e.message ?? String(err)).trim(),
      cwd,
    }
  }
}

export async function runClaude(prompt: string, cwd: string) {
  const escaped = prompt.replace(/'/g, "'\\''")
  const result = await runCommand(`claude -p '${escaped}' --output-format json`, cwd)
  if (!result.stderr && result.stdout) {
    try {
      const parsed = JSON.parse(result.stdout) as { result?: string }
      return { result: parsed.result ?? result.stdout, cwd }
    } catch {
      return { result: result.stdout, cwd }
    }
  }
  return { result: result.stdout || result.stderr, cwd }
}
