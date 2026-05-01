import { spawn, type ChildProcess } from 'child_process'

export type NotifEvent = {
  bundleId: string
  appName: string
  title?: string
  body?: string
  ts: string
}

// セッション未接続中に来た通知（Gemini 接続成功後に flush）
let preSessionBuffer: NotifEvent[] = []
// 会話中（非 idle）に来た通知（idle 復帰時に flush）
let activeBuffer: NotifEvent[] = []

let sessionConnected = false
let watchProc: ChildProcess | null = null

// ---- アプリ名解決（bundle ID → 表示名） ----
function resolveAppName(bundleId: string): Promise<string> {
  return new Promise((resolve) => {
    const p = spawn('osascript', ['-e', `name of application id "${bundleId}"`])
    let out = ''
    p.stdout.on('data', (d: Buffer) => { out += d.toString() })
    p.on('close', () => resolve(out.trim() || bundleId))
    p.on('error', () => resolve(bundleId))
    // タイムアウト（3秒）
    setTimeout(() => { p.kill(); resolve(bundleId) }, 3000)
  })
}

// ---- Accessibility API でバナーの title/body を取得 ----
function readBanner(): Promise<{ title?: string; body?: string }> {
  const script = `
tell application "System Events"
  if exists process "NotificationCenter" then
    tell process "NotificationCenter"
      set wins to every window
      if (count of wins) > 0 then
        set texts to {}
        try
          set elems to entire contents of item 1 of wins
          repeat with e in elems
            try
              if role of e is "AXStaticText" then
                set v to value of e
                if v is not "" and v is not missing value then
                  set end of texts to v
                end if
              end if
            end try
          end repeat
        end try
        return texts
      end if
    end tell
  end if
  return {}
end tell
`
  return new Promise((resolve) => {
    const p = spawn('osascript', ['-e', script])
    let out = ''
    p.stdout.on('data', (d: Buffer) => { out += d.toString() })
    p.on('close', () => {
      const parts = out.trim().split(', ').map((s) => s.trim()).filter(Boolean)
      resolve({ title: parts[0], body: parts[1] })
    })
    p.on('error', () => resolve({}))
    // バナー読み取りは2秒以内
    setTimeout(() => { p.kill(); resolve({}) }, 2000)
  })
}

// ---- log stream 監視開始（アプリ起動直後から常駐） ----
export function startNotificationWatch(
  onNotif: (n: NotifEvent) => void,
  getState: () => string,
): void {
  if (watchProc) return // 二重起動防止

  watchProc = spawn('/usr/bin/log', [
    'stream',
    '--predicate',
    'process == "usernoted" AND category == "NotificationsPipeline"',
  ])

  let lineBuffer = ''

  watchProc.stdout?.on('data', (chunk: Buffer) => {
    lineBuffer += chunk.toString()
    const lines = lineBuffer.split('\n')
    lineBuffer = lines.pop() ?? '' // 未完行を保持

    for (const line of lines) {
      // [create, ...] + Request: Starting の行だけ処理
      if (!line.includes('[create,') || !line.includes('Request: Starting')) continue
      const match = line.match(/bundle=([^,\]]+)/)
      if (!match) continue
      const bundleId = match[1].trim()

      // 非同期でアプリ名解決 + バナー読み取り
      void (async () => {
        const [appName, banner] = await Promise.all([
          resolveAppName(bundleId),
          readBanner(),
        ])
        const notif: NotifEvent = {
          bundleId,
          appName,
          title: banner.title,
          body: banner.body,
          ts: new Date().toISOString(),
        }

        if (!sessionConnected) {
          preSessionBuffer.push(notif)
          // バッファは最大50件
          if (preSessionBuffer.length > 50) preSessionBuffer.shift()
        } else if (getState() === 'idle') {
          onNotif(notif)
        } else {
          activeBuffer.push(notif)
          if (activeBuffer.length > 50) activeBuffer.shift()
        }
      })()
    }
  })

  watchProc.on('error', (err) => {
    console.error('[notifications] log stream error:', err)
  })
  watchProc.on('close', (code) => {
    console.warn('[notifications] log stream closed, code:', code)
    watchProc = null
  })
}

// ---- Gemini セッション接続完了時に呼ぶ ----
// preSessionBuffer を返して空にする
export function notificationSessionReady(): NotifEvent[] {
  sessionConnected = true
  const buf = [...preSessionBuffer]
  preSessionBuffer = []
  return buf
}

// ---- idle 復帰時に呼ぶ ----
// activeBuffer を返して空にする
export function flushActiveNotifications(): NotifEvent[] {
  const buf = [...activeBuffer]
  activeBuffer = []
  return buf
}

// ---- 終了時クリーンアップ ----
export function stopNotificationWatch(): void {
  watchProc?.kill()
  watchProc = null
}
