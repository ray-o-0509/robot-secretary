import { ptyWriteTo, ptyGetBufferOf, ptySubscribeTo, ptyOnExit } from './pty'
import { shellQuote } from './index'

const CC_READY_TIMEOUT_MS = 30_000
const RELAUNCH_DELAY_MS = 500

let ccLaunched = false
let readyPromise: Promise<void> | null = null

function looksLikeCcPrompt(buffer: string): boolean {
  const tail = buffer.slice(-8000)
  return (
    tail.includes('Claude Code') &&
    (tail.includes('bypass permissions on') || tail.includes('Try "') || tail.includes('bypass permissions'))
  )
}

function sanitizeForBracketedPaste(s: string): string {
  // Strip the paste-end terminator if a malicious / weird prompt happens to contain it.
  return s.replaceAll('\x1b[201~', '')
}

function startCc(cwd?: string): void {
  // \x15 = Ctrl-U (clear current line) so any half-typed text doesn't break the cd.
  const cd = cwd ? `cd ${shellQuote(cwd)}\n` : ''
  ptyWriteTo('claude', `\x15${cd}cc\n`)
}

function waitForReady(): Promise<void> {
  if (looksLikeCcPrompt(ptyGetBufferOf('claude'))) return Promise.resolve()
  if (readyPromise) return readyPromise

  readyPromise = new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (ok: boolean, err?: Error) => {
      if (settled) return
      settled = true
      unsub()
      clearTimeout(timer)
      readyPromise = null
      if (ok) resolve()
      else reject(err ?? new Error('cc readiness timeout'))
    }
    const unsub = ptySubscribeTo('claude', () => {
      if (looksLikeCcPrompt(ptyGetBufferOf('claude'))) finish(true)
    })
    const timer = setTimeout(() => finish(false), CC_READY_TIMEOUT_MS)
    // Re-check immediately (subscribe forces ensure() but we may already have content).
    if (looksLikeCcPrompt(ptyGetBufferOf('claude'))) finish(true)
  })
  return readyPromise
}

export function launchClaudePty(initialCwd?: string): void {
  if (ccLaunched) return
  ccLaunched = true

  // Auto-relaunch cc if it exits (user typed /exit, crash, etc.).
  ptyOnExit('claude', () => {
    ccLaunched = false
    setTimeout(() => launchClaudePty(initialCwd), RELAUNCH_DELAY_MS)
  })

  startCc(initialCwd)
}

export async function waitForCcReady(): Promise<void> {
  if (!ccLaunched) launchClaudePty()
  await waitForReady()
}

export async function pasteToClaudePty(prompt: string): Promise<void> {
  await waitForCcReady()
  const safe = sanitizeForBracketedPaste(prompt)
  ptyWriteTo('claude', `\x1b[200~${safe}\x1b[201~\r`)
}

