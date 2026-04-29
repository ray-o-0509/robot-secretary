import { ipcMain, type BrowserWindow } from 'electron'

type Deps = {
  getDisplayWindow: () => BrowserWindow | null
  isDisplayReady: () => boolean
  getMainWindow: () => BrowserWindow | null
  getChatWindow: () => BrowserWindow | null
  getOrCreateDisplayWindow: () => Promise<{ win: BrowserWindow; ready: boolean }>
  setWanderingByState: (state: string) => void
  onClickthroughChanged: (enabled: boolean) => void
}

export function registerCoreIpc(deps: Deps): void {
  ipcMain.handle('call-tool', async (_event, toolName: string, args: Record<string, unknown>) => {
    try {
      if (toolName === 'delegate_task') {
        const { runClaudeTask } = await import('../agent/claude')
        const result = await runClaudeTask({
          task: args.task as string,
          includeScreenshot: args.includeScreenshot as boolean | undefined,
        })
        return { result }
      }
      if (
        toolName === 'get_tasks' ||
        toolName === 'create_task' ||
        toolName === 'complete_task' ||
        toolName === 'complete_subtask' ||
        toolName === 'get_email_detail'
      ) {
        const { executeTool } = await import('../tools/dispatcher')
        const result = await executeTool(toolName, args)
        return { result }
      }
      if (toolName === 'show_panel') {
        const { showPanel, isPanelType } = await import('../display/show-panel')
        const t = args.type
        if (!isPanelType(t)) return { error: `invalid type: ${String(t)}` }
        return await showPanel(t, { getOrCreateWindow: deps.getOrCreateDisplayWindow })
      }
      return { error: `Unknown tool: ${toolName}` }
    } catch (err) {
      return { error: String(err) }
    }
  })

  ipcMain.on('display:close', () => {
    const w = deps.getDisplayWindow()
    if (w && !w.isDestroyed()) w.hide()
  })

  ipcMain.handle('display:refresh', async (_event, type: unknown) => {
    const { fetchPanelData, isPanelType, pushPayload } = await import('../display/show-panel')
    if (!isPanelType(type)) return { error: `invalid type: ${String(type)}` }
    const payload = await fetchPanelData(type)
    const w = deps.getDisplayWindow()
    if (w && !w.isDestroyed()) {
      pushPayload(w, payload, deps.isDisplayReady())
    }
    return { ok: !payload.error }
  })

  ipcMain.on('chat-messages', (_event, messages: unknown) => {
    deps.getChatWindow()?.webContents.send('chat-messages', messages)
  })

  ipcMain.on('set-clickthrough', (_event, enabled: boolean) => deps.onClickthroughChanged(enabled))

  ipcMain.on('robot-state', (_event, state: string, processor?: string) => {
    deps.setWanderingByState(state)
    deps.getChatWindow()?.webContents.send('robot-state', state, processor)
  })

  ipcMain.on('chat-set-interactive', (_event, enabled: boolean) => {
    const chat = deps.getChatWindow()
    if (!chat) return
    if (enabled) chat.setIgnoreMouseEvents(false)
    else chat.setIgnoreMouseEvents(true, { forward: true })
  })

  ipcMain.on('set-language', (_event, lang: string) => {
    deps.getMainWindow()?.webContents.send('language-change', lang)
    deps.getChatWindow()?.webContents.send('language-change', lang)
  })
}
