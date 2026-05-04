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

  const isAscii = /^[\x00-\x7F]*$/.test(text)

  if (isAscii) {
    // Split on newlines so '\n' becomes a real Return keypress.
    const lines = text.split('\n')
    const stmts: string[] = []
    lines.forEach((line, i) => {
      if (line.length > 0) {
        stmts.push(`keystroke "${escapeForAppleScript(line)}"`)
      }
      if (i < lines.length - 1) {
        stmts.push(`key code ${RETURN_KEY_CODE}`)
      }
    })
    if (stmts.length === 0) return { ok: true }
    const body = stmts.map((s) => `\t${s}`).join('\n')
    return runOsascript(`tell application "System Events"\n${body}\nend tell\n`)
  }

  // Non-ASCII: paste via clipboard. Saves & restores plain-text clipboard.
  // Rich content (images / styled text) on the clipboard will be lost.
  const escaped = escapeForAppleScript(text)
  const script = `set savedClip to ""
try
\tset savedClip to (the clipboard as text)
end try
set the clipboard to "${escaped}"
delay 0.05
tell application "System Events" to keystroke "v" using command down
delay 0.15
set the clipboard to savedClip
`
  return runOsascript(script)
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
