import * as os from 'node:os'
import { spawn, type IPty } from 'node-pty'

const SHELL = process.env.SHELL || '/bin/zsh'
const SCROLLBACK_MAX_BYTES = 200 * 1024
const SCROLLBACK_TRIM_TRIGGER = SCROLLBACK_MAX_BYTES + SCROLLBACK_MAX_BYTES / 2

type DataListener = (data: string) => void

let pty: IPty | null = null
const listeners = new Set<DataListener>()
let scrollback = ''

function appendScrollback(text: string) {
  scrollback += text
  // Trim only after exceeding 1.5× cap to avoid memcpy on every chunk once full.
  if (scrollback.length > SCROLLBACK_TRIM_TRIGGER) {
    scrollback = scrollback.slice(-SCROLLBACK_MAX_BYTES)
  }
}

function broadcast(data: string) {
  appendScrollback(data)
  for (const cb of listeners) cb(data)
}

function ensure(): IPty {
  if (pty) return pty
  const child = spawn(SHELL, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: os.homedir(),
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
  })
  child.onData(broadcast)
  child.onExit(() => {
    pty = null
    broadcast('\r\n\x1b[33m[pty exited]\x1b[0m\r\n')
  })
  pty = child
  return child
}

export function ptyWrite(data: string): void {
  ensure().write(data)
}

export function ptyResize(cols: number, rows: number): void {
  if (cols < 1 || rows < 1) return
  ensure().resize(cols, rows)
}

export function ptyGetBuffer(): string {
  ensure()
  return scrollback
}

export function ptySubscribe(cb: DataListener): () => void {
  ensure()
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// Push synthetic content (e.g. voice-driven command output) without going through the shell.
export function ptyInject(text: string): void {
  broadcast(text)
}

export function ptyKill(): void {
  if (!pty) return
  try {
    pty.kill()
  } catch {
    /* ignore */
  }
  pty = null
}
