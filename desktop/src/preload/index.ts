import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('mentis', {
  // Chat
  sendMessage:  (msg: string)        => ipcRenderer.invoke('chat:send', msg),
  cancelChat:   ()                   => ipcRenderer.invoke('chat:cancel'),
  getHistory:   ()                   => ipcRenderer.invoke('chat:history'),
  clearHistory: ()                   => ipcRenderer.invoke('chat:clear'),

  // Approval
  respondApproval: (id: string, approved: boolean) =>
    ipcRenderer.invoke('approval:respond', id, approved),

  // Session
  getSession:  ()                          => ipcRenderer.invoke('session:get'),
  setMode:     (mode: 'PLAN' | 'BUILD')    => ipcRenderer.invoke('session:set-mode', mode),
  setCwd:      (cwd: string)               => ipcRenderer.invoke('session:set-cwd', cwd),

  // Window
  pickFolder:  () => ipcRenderer.invoke('window:pick-folder'),
  minimize:    () => ipcRenderer.invoke('window:minimize'),
  maximize:    () => ipcRenderer.invoke('window:maximize'),
  close:       () => ipcRenderer.invoke('window:close'),

  // Engine event subscriptions
  on: (channel: string, fn: (...args: unknown[]) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => fn(...args)
    ipcRenderer.on(`engine:${channel}`, listener)
    return () => ipcRenderer.removeListener(`engine:${channel}`, listener)
  }
})
