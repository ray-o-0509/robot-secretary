import { exec } from 'node:child_process'
import { homedir } from 'node:os'
import { promisify } from 'node:util'

const execAsync = promisify(exec)
const EXTRA_PATHS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  `${homedir()}/.local/bin`,
  `${homedir()}/Library/pnpm`,
  `${homedir()}/.npm-global/bin`,
  `${homedir()}/.nix-profile/bin`,
]

function shellEnv() {
  return {
    ...process.env,
    PATH: [...EXTRA_PATHS, process.env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin'].join(':'),
  }
}

export async function runCommand(command: string, cwd: string) {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      shell: '/bin/zsh',
      env: shellEnv(),
    })
    return { ok: true, exitCode: 0, stdout: stdout.trim(), stderr: stderr.trim(), cwd }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string; code?: number | string | null }
    const exitCode = typeof e.code === 'number' ? e.code : null
    return {
      ok: false,
      exitCode,
      stdout: (e.stdout ?? '').trim(),
      stderr: (e.stderr ?? e.message ?? String(err)).trim(),
      cwd,
    }
  }
}
