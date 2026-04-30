import type { BrowserWindow } from 'electron'

export type ConfirmationRequest = {
  id: string
  action: string
  summary: string
  details: Record<string, string>
}

type Pending = { resolve: (confirmed: boolean) => void }
const pending = new Map<string, Pending>()
let getWindowFn: (() => BrowserWindow | null) | null = null

export function initConfirmation(getWindow: () => BrowserWindow | null) {
  getWindowFn = getWindow
}

export async function requireConfirmation(
  req: Omit<ConfirmationRequest, 'id'>
): Promise<boolean> {
  const id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  return new Promise((resolve) => {
    const win = getWindowFn?.()
    if (!win || win.isDestroyed()) { resolve(false); return }
    pending.set(id, { resolve })
    win.webContents.send('confirmation:request', { id, ...req } as ConfirmationRequest)
    // 2分でタイムアウト → キャンセル扱い
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); resolve(false) }
    }, 120_000)
  })
}

export function respondToConfirmation(id: string, confirmed: boolean) {
  const p = pending.get(id)
  if (p) { pending.delete(id); p.resolve(confirmed) }
}
