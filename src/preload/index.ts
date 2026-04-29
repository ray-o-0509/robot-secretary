import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  callTool: (toolName: string, args: Record<string, unknown>) =>
    ipcRenderer.invoke('call-tool', toolName, args),

  onPTTStart: (cb: () => void) =>
    ipcRenderer.on('ptt-start', () => cb()),

  onPTTStop: (cb: () => void) =>
    ipcRenderer.on('ptt-stop', () => cb()),

  onMuteChanged: (cb: (muted: boolean) => void) =>
    ipcRenderer.on('mute-changed', (_e, muted) => cb(muted)),

  onOpenSettings: (cb: () => void) =>
    ipcRenderer.on('open-settings', () => cb()),

  sendRobotState: (state: string) =>
    ipcRenderer.send('robot-state', state),

  sendChatMessages: (messages: unknown) =>
    ipcRenderer.send('chat-messages', messages),

  onChatMessages: (cb: (messages: unknown) => void) =>
    ipcRenderer.on('chat-messages', (_e, messages) => cb(messages)),

  onRobotState: (cb: (state: string) => void) =>
    ipcRenderer.on('robot-state', (_e, state) => cb(state)),

  setClickThrough: (enabled: boolean) =>
    ipcRenderer.send('set-clickthrough', enabled),

  setChatInteractive: (enabled: boolean) =>
    ipcRenderer.send('chat-set-interactive', enabled),

  setLanguage: (lang: string) =>
    ipcRenderer.send('set-language', lang),

  onLanguageChange: (cb: (lang: string) => void) =>
    ipcRenderer.on('language-change', (_e, lang: string) => cb(lang)),

  memoryGetInjection: (): Promise<string> =>
    ipcRenderer.invoke('memory:get-injection'),

  memoryRecordTranscript: (role: 'user' | 'assistant', text: string) =>
    ipcRenderer.send('memory:transcript', { role, text }),

  onDisplayData: (cb: (payload: unknown) => void) =>
    ipcRenderer.on('display:data', (_e, payload) => cb(payload)),

  displayClose: () => ipcRenderer.send('display:close'),

  displayRefresh: (type: string) => ipcRenderer.invoke('display:refresh', type),
})
