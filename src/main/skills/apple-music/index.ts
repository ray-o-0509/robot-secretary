import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function osascript(script: string): Promise<string> {
  const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: 5000 })
  return stdout.trim()
}

export type MusicTrackInfo = {
  name: string
  artist: string
  album: string
  duration: number
  playerState: 'playing' | 'paused'
}

const BATCH_STATE_SCRIPT = `
tell application "Music"
  if player state is stopped then return "stopped|||||||"
  set t to current track
  set s to player state as string
  return s & "|||" & (name of t) & "|||" & (artist of t) & "|||" & (album of t) & "|||" & ((duration of t) as string)
end tell`.trim()

export async function getMusicState(): Promise<MusicTrackInfo | { playerState: 'stopped' }> {
  const raw = await osascript(BATCH_STATE_SCRIPT)
  const [state, name, artist, album, durationStr] = raw.split('|||')
  if (state === 'stopped') return { playerState: 'stopped' }
  return {
    name: name ?? '',
    artist: artist ?? '',
    album: album ?? '',
    duration: Math.round(Number(durationStr)),
    playerState: state === 'playing' ? 'playing' : 'paused',
  }
}

export async function playPause(): Promise<{ playerState: string }> {
  await osascript('tell application "Music" to playpause')
  const state = await osascript('tell application "Music" to get player state as string')
  return { playerState: state }
}

export async function nextTrack(): Promise<{ ok: boolean }> {
  await osascript('tell application "Music" to next track')
  return { ok: true }
}

export async function prevTrack(): Promise<{ ok: boolean }> {
  await osascript('tell application "Music" to previous track')
  return { ok: true }
}

export async function setVolume(level: number): Promise<{ volume: number }> {
  const clamped = Math.max(0, Math.min(100, Math.round(level)))
  await osascript(`tell application "Music" to set sound volume to ${clamped}`)
  return { volume: clamped }
}

export async function playTrack(query: string): Promise<{ ok: boolean; message: string }> {
  const safe = query.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const script = `
tell application "Music"
  set results to search playlist "Library" for "${safe}"
  if results is {} then return "not_found"
  play item 1 of results
  return "ok"
end tell`.trim()

  const result = await osascript(script)
  if (result === 'not_found') {
    return { ok: false, message: `"${query}" はライブラリに見つかりませんでした` }
  }
  return { ok: true, message: `"${query}" を再生します` }
}

export async function stopMusic(): Promise<{ ok: boolean }> {
  await osascript('tell application "Music" to stop')
  return { ok: true }
}
