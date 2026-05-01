import { contextBridge, ipcRenderer } from 'electron'

function on<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, ...args: T) => cb(...args)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('electronAPI', {
  callTool: (toolName: string, args: Record<string, unknown>) =>
    ipcRenderer.invoke('call-tool', toolName, args),
  onPTTStart: (cb: () => void) => on('ptt-start', cb),
  onPTTStop: (cb: () => void) => on('ptt-stop', cb),
  onMuteChanged: (cb: (muted: boolean) => void) => on('mute-changed', cb),
  onOpenSettings: (cb: () => void) => on('open-settings', cb),
  sendRobotState: (state: string, processor?: string) => ipcRenderer.send('robot-state', state, processor),
  sendChatMessages: (messages: unknown) => ipcRenderer.send('chat-messages', messages),
  onChatMessages: (cb: (messages: unknown) => void) => on('chat-messages', cb),
  onRobotState: (cb: (state: string, processor?: string) => void) => on('robot-state', cb),
  setClickThrough: (enabled: boolean) => ipcRenderer.send('set-clickthrough', enabled),
  setChatInteractive: (enabled: boolean) => ipcRenderer.send('chat-set-interactive', enabled),
  setLanguage: (lang: string) => ipcRenderer.send('set-language', lang),
  onLanguageChange: (cb: (lang: string) => void) => on('language-change', cb),
  memoryGetInjection: (): Promise<string> => ipcRenderer.invoke('memory:get-injection'),
  memoryRecordTranscript: (role: 'user' | 'assistant', text: string) =>
    ipcRenderer.send('memory:transcript', { role, text }),
  onDisplayData: (cb: (payload: unknown) => void) => on('display:data', cb),
  displayClose: () => ipcRenderer.send('display:close'),
  displayRefresh: (type: string) => ipcRenderer.invoke('display:refresh', type),
  openEmailDetail: (account: string, id: string) => ipcRenderer.send('email:open-detail', { account, id }),
  closeEmailDetail: () => ipcRenderer.send('email:close-detail'),
  onEmailDetailArgs: (cb: (args: { account: string; id: string }) => void) => on('email:detail-args', cb),
  onSearchData: (cb: (data: unknown) => void) => on('search:data', cb),
  searchClose: () => ipcRenderer.send('search:close'),
  openUrl: (url: string) => ipcRenderer.invoke('shell:open-url', url),
  openWebView: (url: string) => ipcRenderer.send('open-web-view', url),
  onConfirmationRequest: (cb: (req: unknown) => void) => on('confirmation:request', cb),
  respondToConfirmation: (id: string, confirmed: boolean) =>
    ipcRenderer.send('confirmation:respond', id, confirmed),
  onWeatherData: (cb: (data: unknown) => void) => on('weather:data', cb),
  weatherClose: () => ipcRenderer.send('weather:close'),
  sendConnectionError: (err: unknown) => ipcRenderer.send('connection-error', err),
  onConnectionError: (cb: (err: unknown) => void) => on('connection-error', cb),
  sendGeminiRetry: () => ipcRenderer.send('gemini:retry'),
  onGeminiRetry: (cb: () => void) => on('gemini:retry', cb),
  setupGetStatus: () => ipcRenderer.invoke('setup:get-status'),
  setupOpenSettings: (type: string) => ipcRenderer.send('setup:open-settings', type),
  setupLaunch: () => ipcRenderer.invoke('setup:launch'),

  // Notification watch
  startNotificationWatch: () => ipcRenderer.invoke('notification:start-watch'),
  notificationSessionReady: () => ipcRenderer.invoke('notification:session-ready'),
  onNotification: (cb: (notifs: unknown[]) => void) => on('notification:incoming', cb),

  // Settings window
  chatClose: () => ipcRenderer.send('chat:close'),
  settingsClose: () => ipcRenderer.send('settings:close'),
  settingsGetProfile: () => ipcRenderer.invoke('settings:get-profile'),
  settingsUpsertProfile: (key: string, value: string) => ipcRenderer.invoke('settings:upsert-profile', key, value),
  settingsDeleteProfile: (key: string) => ipcRenderer.invoke('settings:delete-profile', key),
  settingsGetDefaultApps: () => ipcRenderer.invoke('settings:get-default-apps'),
  settingsSaveDefaultApps: (apps: unknown) => ipcRenderer.invoke('settings:save-default-apps', apps),
})
