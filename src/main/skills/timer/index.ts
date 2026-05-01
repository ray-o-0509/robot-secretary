import { Notification } from 'electron'

export type TimerEntry = {
  id: string
  name: string
  kind: 'timer' | 'stopwatch'
  durationMs: number
  startedAt: number
  accumulatedMs: number
  state: 'running' | 'paused' | 'done' | 'stopped'
}

const entries = new Map<string, TimerEntry>()
let timerCounter = 0
let swCounter = 0
let onExpire: ((entry: TimerEntry) => void) | null = null
let intervalHandle: ReturnType<typeof setInterval> | null = null

function startTick() {
  if (intervalHandle) return
  intervalHandle = setInterval(() => {
    const now = Date.now()
    for (const entry of entries.values()) {
      if (entry.kind !== 'timer' || entry.state !== 'running') continue
      const elapsed = entry.accumulatedMs + (now - entry.startedAt)
      if (elapsed >= entry.durationMs) {
        const done: TimerEntry = { ...entry, state: 'done', accumulatedMs: entry.durationMs }
        entries.set(entry.id, done)
        new Notification({
          title: done.name || 'タイマー終了',
          body: `${Math.round(done.durationMs / 1000)}秒のタイマーが終了しました`,
        }).show()
        onExpire?.(done)
      }
    }
  }, 1000)
}

export function setOnExpire(cb: (entry: TimerEntry) => void) {
  onExpire = cb
}

export function startTimer(name: string, durationSec: number): TimerEntry {
  timerCounter += 1
  const entry: TimerEntry = {
    id: `timer-${timerCounter}`,
    name: name || `タイマー${timerCounter}`,
    kind: 'timer',
    durationMs: durationSec * 1000,
    startedAt: Date.now(),
    accumulatedMs: 0,
    state: 'running',
  }
  entries.set(entry.id, entry)
  startTick()
  return entry
}

export function pauseTimer(id: string): TimerEntry | null {
  const entry = entries.get(id)
  if (!entry || entry.kind !== 'timer' || entry.state !== 'running') return null
  const paused: TimerEntry = {
    ...entry,
    state: 'paused',
    accumulatedMs: entry.accumulatedMs + (Date.now() - entry.startedAt),
  }
  entries.set(id, paused)
  return paused
}

export function resumeTimer(id: string): TimerEntry | null {
  const entry = entries.get(id)
  if (!entry || entry.kind !== 'timer' || entry.state !== 'paused') return null
  const resumed: TimerEntry = { ...entry, state: 'running', startedAt: Date.now() }
  entries.set(id, resumed)
  return resumed
}

export function cancelTimer(id: string): TimerEntry | null {
  const entry = entries.get(id)
  if (!entry || entry.kind !== 'timer') return null
  entries.delete(id)
  return entry
}

export function startStopwatch(name: string): TimerEntry {
  swCounter += 1
  const entry: TimerEntry = {
    id: `sw-${swCounter}`,
    name: name || `ストップウォッチ${swCounter}`,
    kind: 'stopwatch',
    durationMs: 0,
    startedAt: Date.now(),
    accumulatedMs: 0,
    state: 'running',
  }
  entries.set(entry.id, entry)
  startTick()
  return entry
}

export function pauseStopwatch(id: string): TimerEntry | null {
  const entry = entries.get(id)
  if (!entry || entry.kind !== 'stopwatch' || entry.state !== 'running') return null
  const paused: TimerEntry = {
    ...entry,
    state: 'paused',
    accumulatedMs: entry.accumulatedMs + (Date.now() - entry.startedAt),
  }
  entries.set(id, paused)
  return paused
}

export function resumeStopwatch(id: string): TimerEntry | null {
  const entry = entries.get(id)
  if (!entry || entry.kind !== 'stopwatch' || entry.state !== 'paused') return null
  const resumed: TimerEntry = { ...entry, state: 'running', startedAt: Date.now() }
  entries.set(id, resumed)
  return resumed
}

export function stopStopwatch(id: string): TimerEntry | null {
  const entry = entries.get(id)
  if (!entry || entry.kind !== 'stopwatch') return null
  const stopped: TimerEntry = {
    ...entry,
    state: 'stopped',
    accumulatedMs: entry.state === 'running'
      ? entry.accumulatedMs + (Date.now() - entry.startedAt)
      : entry.accumulatedMs,
  }
  entries.set(id, stopped)
  return stopped
}

export function getTimerSnapshot(): TimerEntry[] {
  return Array.from(entries.values())
}
