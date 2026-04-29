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
})
