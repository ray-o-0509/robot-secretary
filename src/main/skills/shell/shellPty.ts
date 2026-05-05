import { ptyWriteTo, ptySubscribeTo, ptyGetBufferOf } from './pty'
import { shellQuote } from './index'

const DEFAULT_TIMEOUT_MS = 30_000
const STDOUT_MAX_BYTES = 1024 * 1024
const QUEUE_MAX = 16

type ExecResult = {
  ok: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  cwd: string
}

type QueueItem = {
  command: string
  cwd: string
  timeoutMs: number
  resolve: (r: ExecResult) => void
}

const queue: QueueItem[] = []
let busy = false

function stripAnsi(s: string): string {
  // CSI / OSC / ESC sequences. Good enough for our exec output capture.
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07|\x1b[@-Z\\-_]/g, '')
}

function runOne(item: QueueItem): void {
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const startMarker = `__VEGA_BEGIN_${runId}__`
  const endMarker = `__VEGA_END_${runId}__`

  let captured = ''
  let started = false
  let finished = false

  const finalize = (exitCode: number | null, ok: boolean) => {
    if (finished) return
    finished = true
    unsub()
    clearTimeout(timer)

    let stdout = ''
    if (started) {
      const beginIdx = captured.indexOf(startMarker)
      const tail = beginIdx >= 0 ? captured.slice(beginIdx + startMarker.length) : captured
      // Drop the leading newline emitted right after `printf <begin>`.
      const afterBegin = tail.replace(/^\r?\n/, '')
      const endIdx = afterBegin.indexOf(endMarker)
      const body = endIdx >= 0 ? afterBegin.slice(0, endIdx) : afterBegin
      stdout = stripAnsi(body)
        .replace(/\r\n/g, '\n')
        // Drop the trailing exit-code line that comes between END marker and ":<code>".
        .replace(/\n+$/, '')
        .slice(-STDOUT_MAX_BYTES)
    }

    item.resolve({
      ok,
      exitCode,
      stdout,
      stderr: ok ? '' : stdout, // PTY can't separate streams; expose same buffer on failure.
      cwd: item.cwd,
    })

    busy = false
    pump()
  }

  const onData = () => {
    captured = ptyGetBufferOf('shell')
    if (!started && captured.includes(startMarker)) started = true
    if (!started) return

    const endIdx = captured.indexOf(endMarker)
    if (endIdx < 0) return
    // Look for the exit code that follows the end marker.
    const afterEnd = captured.slice(endIdx + endMarker.length)
    const m = afterEnd.match(/:(-?\d+)/)
    if (!m) return
    const exitCode = Number(m[1])
    finalize(exitCode, exitCode === 0)
  }

  const unsub = ptySubscribeTo('shell', onData)
  const timer = setTimeout(() => {
    // Send Ctrl-C so the runaway command yields the prompt.
    try { ptyWriteTo('shell', '\x03') } catch { /* ignore */ }
    finalize(null, false)
  }, item.timeoutMs)

  // Compose the command. Bracketed paste keeps zsh from running each line as it's sent.
  // The leading Ctrl-U clears any half-typed input.
  const cd = item.cwd ? `cd ${shellQuote(item.cwd)} && ` : ''
  const composed =
    `${cd}printf "\\n${startMarker}\\n" && { ${item.command} ; } ; ` +
    `__rc=$? ; printf "\\n${endMarker}:%d\\n" "$__rc"\n`
  ptyWriteTo('shell', `\x15${composed}`)

  // Safety: re-poll the buffer in case data arrived before subscribe attached.
  onData()
}

function pump(): void {
  if (busy) return
  const next = queue.shift()
  if (!next) return
  busy = true
  runOne(next)
}

export function isShellBusy(): boolean { return busy }

export async function execInShellPty(
  command: string,
  cwd: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    if (queue.length >= QUEUE_MAX) {
      resolve({ ok: false, exitCode: null, stdout: '', stderr: 'shell queue full', cwd })
      return
    }
    queue.push({ command, cwd, timeoutMs, resolve })
    pump()
  })
}
