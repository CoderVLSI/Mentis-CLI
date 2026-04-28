import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('mentis', {
  // Chat
  sendMessage:  (msg: string, images?: { base64: string; mediaType: string; name: string }[]) =>
    ipcRenderer.invoke('chat:send', msg, images),
  cancelChat:   ()                   => ipcRenderer.invoke('chat:cancel'),
  getHistory:   ()                   => ipcRenderer.invoke('chat:history'),
  clearHistory: ()                   => ipcRenderer.invoke('chat:clear'),

  // Approval
  respondApproval: (id: string, approved: boolean) => ipcRenderer.invoke('approval:respond', id, approved),

  // Current session
  getSession: ()                         => ipcRenderer.invoke('session:get'),
  setMode:    (mode: 'PLAN' | 'BUILD')   => ipcRenderer.invoke('session:set-mode', mode),
  setCwd:     (cwd: string)              => ipcRenderer.invoke('session:set-cwd', cwd),

  // Multi-session
  listSessions:   ()                               => ipcRenderer.invoke('sessions:list'),
  newSession:     ()                               => ipcRenderer.invoke('sessions:new'),
  loadSession:    (id: string)                     => ipcRenderer.invoke('sessions:load', id),
  deleteSession:  (id: string)                     => ipcRenderer.invoke('sessions:delete', id),
  renameSession:  (id: string, title: string)      => ipcRenderer.invoke('sessions:rename', id, title),

  // Config
  getConfig:   ()                  => ipcRenderer.invoke('config:get'),
  setModel:    (model: string)     => ipcRenderer.invoke('config:set-model', model),
  setProvider: (provider: string)  => ipcRenderer.invoke('config:set-provider', provider),
  updateProviderSettings: (provider: string, settings: Record<string, string>) =>
    ipcRenderer.invoke('config:update-provider-settings', provider, settings),

  // Models
  listModels: () => ipcRenderer.invoke('models:list'),

  // MCP + Hooks
  listMcp:   () => ipcRenderer.invoke('mcp:list'),
  listHooks: () => ipcRenderer.invoke('hooks:list'),

  // Window
  pickFolder: () => ipcRenderer.invoke('window:pick-folder'),
  minimize:   () => ipcRenderer.invoke('window:minimize'),
  maximize:   () => ipcRenderer.invoke('window:maximize'),
  close:      () => ipcRenderer.invoke('window:close'),

  // Platform
  platform: process.platform,

  // Terminal
  terminalCreate: (cols: number, rows: number) => ipcRenderer.invoke('terminal:create', cols, rows),
  terminalWrite:  (id: string, data: string)   => ipcRenderer.invoke('terminal:write', id, data),
  terminalResize: (id: string, cols: number, rows: number) => ipcRenderer.invoke('terminal:resize', id, cols, rows),
  terminalKill:   (id: string)                 => ipcRenderer.invoke('terminal:kill', id),

  // File manager
  readDir: (dirPath: string) => ipcRenderer.invoke('fs:readdir', dirPath),

  // Sync info (mobile pairing)
  getSyncInfo: () => ipcRenderer.invoke('sync:info'),

  // Engine event subscriptions
  on: (channel: string, fn: (...args: unknown[]) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => fn(...args)
    ipcRenderer.on(`engine:${channel}`, listener)
    return () => ipcRenderer.removeListener(`engine:${channel}`, listener)
  }
})
