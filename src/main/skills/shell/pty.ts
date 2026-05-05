import * as os from 'node:os'
import { spawn, type IPty } from 'node-pty'

export type PtyId = 'claude' | 'shell'

const SHELL = process.env.SHELL || '/bin/zsh'
const SCROLLBACK_MAX_BYTES = 200 * 1024
const SCROLLBACK_TRIM_TRIGGER = SCROLLBACK_MAX_BYTES + SCROLLBACK_MAX_BYTES / 2
const EXTRA_PATHS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  `${os.homedir()}/.local/bin`,
  `${os.homedir()}/Library/pnpm`,
  `${os.homedir()}/.npm-global/bin`,
  `${os.homedir()}/.nix-profile/bin`,
]

type DataListener = (data: string) => void

type Slot = {
  pty: IPty | null
  listeners: Set<DataListener>
  scrollback: string
  exitListeners: Set<() => void>
}

const slots: Map<PtyId, Slot> = new Map()

function getSlot(id: PtyId): Slot {
  let slot = slots.get(id)
  if (!slot) {
    slot = { pty: null, listeners: new Set(), scrollback: '', exitListeners: new Set() }
    slots.set(id, slot)
  }
  return slot
}

function appendScrollback(slot: Slot, text: string) {
  slot.scrollback += text
  if (slot.scrollback.length > SCROLLBACK_TRIM_TRIGGER) {
    slot.scrollback = slot.scrollback.slice(-SCROLLBACK_MAX_BYTES)
  }
}

function broadcast(slot: Slot, data: string) {
  appendScrollback(slot, data)
  for (const cb of slot.listeners) cb(data)
}

function ensure(id: PtyId): IPty {
  const slot = getSlot(id)
  if (slot.pty) return slot.pty
  const child = spawn(SHELL, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: os.homedir(),
    env: {
      ...process.env,
      PATH: [...EXTRA_PATHS, process.env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin'].join(':'),
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
  })
  child.onData((d) => broadcast(slot, d))
  child.onExit(() => {
    slot.pty = null
    broadcast(slot, `\r\n\x1b[33m[pty:${id} exited]\x1b[0m\r\n`)
    for (const cb of slot.exitListeners) {
      try { cb() } catch { /* ignore */ }
    }
  })
  slot.pty = child
  return child
}

export function ptyWriteTo(id: PtyId, data: string): void {
  ensure(id).write(data)
}

export function ptyResizeTo(id: PtyId, cols: number, rows: number): void {
  if (cols < 1 || rows < 1) return
  ensure(id).resize(cols, rows)
}

export function ptyGetBufferOf(id: PtyId): string {
  ensure(id)
  return getSlot(id).scrollback
}

export function ptySubscribeTo(id: PtyId, cb: DataListener): () => void {
  ensure(id)
  const slot = getSlot(id)
  slot.listeners.add(cb)
  return () => slot.listeners.delete(cb)
}

export function ptyInjectTo(id: PtyId, text: string): void {
  broadcast(getSlot(id), text)
}

export function ptyKillOf(id: PtyId): void {
  const slot = getSlot(id)
  if (!slot.pty) return
  try {
    slot.pty.kill()
  } catch { /* ignore */ }
  slot.pty = null
}

export function ptyKillAll(): void {
  for (const id of slots.keys()) ptyKillOf(id)
}

export function ptyPidOf(id: PtyId): number | null {
  return getSlot(id).pty?.pid ?? null
}

export function ptyOnExit(id: PtyId, cb: () => void): () => void {
  const slot = getSlot(id)
  slot.exitListeners.add(cb)
  return () => slot.exitListeners.delete(cb)
}

// Backward-compat: legacy single-PTY API maps onto the 'shell' slot.
export function ptyWrite(data: string): void { ptyWriteTo('shell', data) }
export function ptyResize(cols: number, rows: number): void { ptyResizeTo('shell', cols, rows) }
export function ptyGetBuffer(): string { return ptyGetBufferOf('shell') }
export function ptySubscribe(cb: DataListener): () => void { return ptySubscribeTo('shell', cb) }
export function ptyInject(text: string): void { ptyInjectTo('shell', text) }
export function ptyKill(): void { ptyKillAll() }
export function ptyPid(): number | null { return ptyPidOf('shell') }
