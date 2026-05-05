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
  onRobotVelocity: (cb: (v: { vx: number; vy: number; speed: number }) => void) =>
    on('robot-velocity', cb),
  chatClose: () => ipcRenderer.send('chat:close'),
  settingsClose: () => ipcRenderer.send('settings:close'),
  settingsGetProfile: () => ipcRenderer.invoke('settings:get-profile'),
  settingsUpsertProfile: (key: string, value: string) => ipcRenderer.invoke('settings:upsert-profile', key, value),
  settingsDeleteProfile: (key: string) => ipcRenderer.invoke('settings:delete-profile', key),
  settingsGetDefaultApps: () => ipcRenderer.invoke('settings:get-default-apps'),
  settingsSaveDefaultApps: (apps: unknown) => ipcRenderer.invoke('settings:save-default-apps', apps),
  settingsListInstalledApps: () => ipcRenderer.invoke('settings:list-installed-apps'),
  settingsGetAppIcon: (appPath: string): Promise<string | null> =>
    ipcRenderer.invoke('settings:get-app-icon', appPath),
  settingsGetMemory: () => ipcRenderer.invoke('settings:get-memory'),
  settingsSaveMemory: (memory: unknown) => ipcRenderer.invoke('settings:save-memory', memory),
  settingsResetMemory: () => ipcRenderer.invoke('settings:reset-memory'),
  settingsUpsertProcedure: (oldName: string | null, name: string, description: string) =>
    ipcRenderer.invoke('settings:upsert-procedure', oldName, name, description),
  settingsDeleteProcedure: (name: string) =>
    ipcRenderer.invoke('settings:delete-procedure', name),
  settingsUpsertMemoryItem: (
    kind: 'facts' | 'preferences' | 'ongoing_topics',
    oldText: string | null,
    text: string,
  ) => ipcRenderer.invoke('settings:upsert-memory-item', kind, oldText, text),
  settingsDeleteMemoryItem: (
    kind: 'facts' | 'preferences' | 'ongoing_topics',
    text: string,
  ) => ipcRenderer.invoke('settings:delete-memory-item', kind, text),
  settingsGetLanguage: (): Promise<string> => ipcRenderer.invoke('settings:get-language'),
  settingsListSkills: (): Promise<Array<{ id: string; label: string; description: string; tools: string[]; enabled: boolean; secrets: Array<{ key: string; label: string; hint?: string }> }>> =>
    ipcRenderer.invoke('settings:list-skills'),
  settingsListCoreSecrets: (): Promise<Array<{ key: string; label: string; hint?: string }>> =>
    ipcRenderer.invoke('settings:list-core-secrets'),
  settingsSetSkillEnabled: (id: string, enabled: boolean): Promise<Record<string, boolean>> =>
    ipcRenderer.invoke('settings:set-skill-enabled', id, enabled),
  settingsGetSecrets: (): Promise<Record<string, { set: boolean; preview: string }>> =>
    ipcRenderer.invoke('settings:get-secrets'),
  settingsSetSecret: (key: string, value: string): Promise<Record<string, { set: boolean; preview: string }>> =>
    ipcRenderer.invoke('settings:set-secret', key, value),
  settingsGetSecretValue: (key: string): Promise<string | undefined> =>
    ipcRenderer.invoke('settings:get-secret-value', key),

  // Appearance (robot/window size)
  appearanceGetRobotSize: (): Promise<{ size: number; min: number; max: number; default: number }> =>
    ipcRenderer.invoke('appearance:get-robot-size'),
  appearanceSetRobotSize: (size: number): Promise<{ size: number }> =>
    ipcRenderer.invoke('appearance:set-robot-size', size),

  // Google アカウント連携
  googleAccountsCheckSetup: () => ipcRenderer.invoke('google-accounts:check-setup'),
  googleAccountsList: () => ipcRenderer.invoke('google-accounts:list'),
  googleAccountsAdd: (loginHint?: string, scopes?: string[]) =>
    ipcRenderer.invoke('google-accounts:add', (loginHint || scopes) ? { loginHint, scopes } : undefined),
  googleAccountsRemove: (email: string) => ipcRenderer.invoke('google-accounts:remove', email),
  googleAccountsAbort: () => ipcRenderer.invoke('google-accounts:abort'),

  // Interactive PTY (xterm.js front-end ↔ node-pty back-end). Two channels: 'claude' / 'shell'.
  ptyOnData: (cb: (id: 'claude' | 'shell', data: string) => void) =>
    on<['claude' | 'shell', string]>('pty:data', cb),
  ptyWrite: (id: 'claude' | 'shell', data: string) => ipcRenderer.send('pty:write', id, data),
  ptyResize: (id: 'claude' | 'shell', cols: number, rows: number) =>
    ipcRenderer.send('pty:resize', id, cols, rows),
  ptyGetBuffer: (id: 'claude' | 'shell'): Promise<string> => ipcRenderer.invoke('pty:get-buffer', id),

  onRegionImage: (cb: (payload: { base64: string; mediaType: string }) => void) =>
    on<[{ base64: string; mediaType: string }]>('region-image', cb),
})

contextBridge.exposeInMainWorld('overlayAPI', {
  reportRect: (rect: { x: number; y: number; w: number; h: number; displayId: number }) =>
    ipcRenderer.send('region-overlay:report-rect', rect),
  onClear: (cb: () => void) => on('region-overlay:clear', cb),
  onCaptured: (cb: () => void) => on('region-overlay:captured', cb),
  getDisplayId: (): Promise<number> => ipcRenderer.invoke('region-overlay:get-display-id'),
})
