import { spawn } from 'child_process'

type Result = { ok: true } | { ok: false; error: string }

function runOsascript(script: string): Promise<Result> {
  return new Promise((resolve) => {
    const child = spawn('osascript', ['-'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', (err) => {
      resolve({ ok: false, error: err.message })
    })
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true })
      else resolve({ ok: false, error: stderr.trim() || `osascript exited ${code}` })
    })
    child.stdin.write(script)
    child.stdin.end()
  })
}

function escapeForAppleScript(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

const RETURN_KEY_CODE = 36

export async function typeText(text: string): Promise<Result> {
  if (typeof text !== 'string' || text.length === 0) {
    return { ok: false, error: 'text is required' }
  }

  // Always paste via clipboard so IME (kana mode etc.) doesn't intercept keystrokes.
  // Split on '\n' so newlines become real Return keypresses (submits in chat apps).
  // Saves & restores plain-text clipboard; rich content on clipboard will be lost.
  const lines = text.split('\n')
  const stmts: string[] = ['set savedClip to ""', 'try', '\tset savedClip to (the clipboard as text)', 'end try']

  lines.forEach((line, i) => {
    if (line.length > 0) {
      stmts.push(`set the clipboard to "${escapeForAppleScript(line)}"`)
      stmts.push('delay 0.05')
      stmts.push('tell application "System Events" to keystroke "v" using command down')
      stmts.push('delay 0.15')
    }
    if (i < lines.length - 1) {
      stmts.push(`tell application "System Events" to key code ${RETURN_KEY_CODE}`)
      stmts.push('delay 0.05')
    }
  })

  stmts.push('set the clipboard to savedClip')
  return runOsascript(stmts.join('\n') + '\n')
}

const SPECIAL_KEY_CODES: Record<string, number> = {
  return: RETURN_KEY_CODE,
  enter: RETURN_KEY_CODE,
  tab: 48,
  space: 49,
  delete: 51,
  backspace: 51,
  forwarddelete: 117,
  escape: 53,
  esc: 53,
  up: 126,
  down: 125,
  left: 123,
  right: 124,
  home: 115,
  end: 119,
  pageup: 116,
  pagedown: 121,
}

const MODIFIER_MAP: Record<string, string> = {
  cmd: 'command',
  command: 'command',
  meta: 'command',
  win: 'command',
  shift: 'shift',
  alt: 'option',
  option: 'option',
  opt: 'option',
  ctrl: 'control',
  control: 'control',
}

export async function pressKeys(combo: string): Promise<Result> {
  if (typeof combo !== 'string' || combo.trim().length === 0) {
    return { ok: false, error: 'combo is required' }
  }

  const parts = combo
    .toLowerCase()
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean)

  if (parts.length === 0) return { ok: false, error: 'empty combo' }

  const key = parts[parts.length - 1]
  const modifierTokens = parts.slice(0, -1)

  const modifiers: string[] = []
  for (const token of modifierTokens) {
    const m = MODIFIER_MAP[token]
    if (!m) return { ok: false, error: `unknown modifier: ${token}` }
    modifiers.push(m)
  }

  const usingClause =
    modifiers.length > 0
      ? ` using {${modifiers.map((m) => `${m} down`).join(', ')}}`
      : ''

  let action: string
  if (key in SPECIAL_KEY_CODES) {
    action = `key code ${SPECIAL_KEY_CODES[key]}`
  } else if (key.length === 1) {
    action = `keystroke "${escapeForAppleScript(key)}"`
  } else {
    return { ok: false, error: `unknown key: ${key}` }
  }

  return runOsascript(`tell application "System Events" to ${action}${usingClause}\n`)
}

export async function wait(seconds: number): Promise<Result> {
  if (typeof seconds !== 'number' || !isFinite(seconds) || seconds < 0) {
    return { ok: false, error: 'seconds must be a non-negative number' }
  }
  const clamped = Math.min(seconds, 5)
  await new Promise((r) => setTimeout(r, Math.round(clamped * 1000)))
  return { ok: true }
}
