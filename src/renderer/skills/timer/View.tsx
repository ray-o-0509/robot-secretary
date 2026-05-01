import { useEffect, useState } from 'react'
import { LuTimer, LuCircleStop, LuPause, LuPlay, LuCircleCheck } from 'react-icons/lu'
import { CYAN, MAGENTA, FONT_MONO } from '../../display/styles'
import { Card } from '../../display/components/Card'
import { EmptyState } from '../../display/components/EmptyState'
import type { PanelPayload, TimerEntry } from '../../display/types'

interface Props {
  payload: PanelPayload
}

export function TimerView({ payload }: Props) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 100)
    return () => clearInterval(id)
  }, [])

  const entries = (payload.data as TimerEntry[] | null) ?? []
  if (entries.length === 0) {
    return <EmptyState message="タイマーなし" />
  }

  const timers = entries.filter((e) => e.kind === 'timer')
  const stopwatches = entries.filter((e) => e.kind === 'stopwatch')

  return (
    <>
      {timers.map((e) => <TimerCard key={e.id} entry={e} />)}
      {stopwatches.map((e) => <StopwatchCard key={e.id} entry={e} />)}
    </>
  )
}

function getElapsed(entry: TimerEntry): number {
  if (entry.state === 'running') {
    return entry.accumulatedMs + (Date.now() - entry.startedAt)
  }
  return entry.accumulatedMs
}

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 100))
  const tenths = total % 10
  const secs = Math.floor(total / 10) % 60
  const mins = Math.floor(total / 600) % 60
  const hrs = Math.floor(total / 36000)
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`
}

function TimerCard({ entry }: { entry: TimerEntry }) {
  const elapsed = getElapsed(entry)
  const remaining = Math.max(0, entry.durationMs - elapsed)
  const done = entry.state === 'done' || remaining === 0
  const pct = entry.durationMs > 0 ? Math.min(1, elapsed / entry.durationMs) : 0
  const color = done ? MAGENTA : CYAN

  return (
    <Card accent={done ? 'magenta' : 'cyan'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <LuTimer size={13} color={color} style={{ flexShrink: 0 }} />
        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: 'rgba(232,246,255,0.6)', letterSpacing: 1, flex: 1 }}>
          {entry.name}
        </span>
        <StateChip state={entry.state} done={done} />
      </div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 28, fontWeight: 700, color, textShadow: `0 0 12px ${color}80`, letterSpacing: 2, textAlign: 'center', marginBottom: 8 }}>
        {done ? 'DONE' : formatMs(remaining)}
      </div>
      <ProgressBar pct={pct} color={color} />
      <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: 'rgba(232,246,255,0.35)', letterSpacing: 1, marginTop: 4 }}>
        ID: {entry.id} / {formatMs(entry.durationMs)} total
      </div>
    </Card>
  )
}

function StopwatchCard({ entry }: { entry: TimerEntry }) {
  const elapsed = getElapsed(entry)
  const stopped = entry.state === 'stopped'
  const color = stopped ? MAGENTA : CYAN

  return (
    <Card accent={stopped ? 'magenta' : 'cyan'}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <LuCircleStop size={13} color={color} style={{ flexShrink: 0 }} />
        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: 'rgba(232,246,255,0.6)', letterSpacing: 1, flex: 1 }}>
          {entry.name}
        </span>
        <StateChip state={entry.state} done={false} />
      </div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 28, fontWeight: 700, color, textShadow: `0 0 12px ${color}80`, letterSpacing: 2, textAlign: 'center', marginBottom: 4 }}>
        {formatMs(elapsed)}
      </div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: 'rgba(232,246,255,0.35)', letterSpacing: 1, marginTop: 4 }}>
        ID: {entry.id}
      </div>
    </Card>
  )
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct * 100}%`, background: color, boxShadow: `0 0 6px ${color}` }} />
    </div>
  )
}

const STATE_ICONS = {
  running: LuPlay,
  paused: LuPause,
  done: LuCircleCheck,
  stopped: LuCircleStop,
}
const STATE_LABELS: Record<string, string> = {
  running: 'RUN',
  paused: 'PAUSE',
  done: 'DONE',
  stopped: 'STOP',
}

function StateChip({ state, done }: { state: string; done: boolean }) {
  const color = (done || state === 'stopped') ? MAGENTA : state === 'paused' ? '#ffc83c' : CYAN
  const Icon = STATE_ICONS[state as keyof typeof STATE_ICONS] ?? LuPlay
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: FONT_MONO, fontSize: 9, letterSpacing: 1, color, background: `${color}18`, border: `1px solid ${color}50`, padding: '1px 5px' }}>
      <Icon size={9} />
      {STATE_LABELS[state] ?? state.toUpperCase()}
    </span>
  )
}
