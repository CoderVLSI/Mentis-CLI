import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { HeadlessEngine } from './engine'

let mainWindow: BrowserWindow | null = null
const engine = new HeadlessEngine()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d0d0d',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow!.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Forward engine events to renderer
function forwardEngineEvents(): void {
  const forward = (name: string) => (data: unknown) => {
    mainWindow?.webContents.send(`engine:${name}`, data)
  }
  engine.on('thinking',        forward('thinking'))
  engine.on('message_start',   forward('message_start'))
  engine.on('message_chunk',   forward('message_chunk'))
  engine.on('message_end',     forward('message_end'))
  engine.on('tool_start',      forward('tool_start'))
  engine.on('tool_result',     forward('tool_result'))
  engine.on('approval_needed', forward('approval_needed'))
  engine.on('approval_done',   forward('approval_done'))
  engine.on('error',           forward('error'))
  engine.on('session_update',  forward('session_update'))
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.mentis.desktop')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  createWindow()
  forwardEngineEvents()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('chat:send', async (_e, message: string) => {
  engine.chat(message)  // fire and forget — events stream back
  return { ok: true }
})

ipcMain.handle('chat:cancel', () => {
  engine.cancel()
  return { ok: true }
})

ipcMain.handle('chat:history', () => engine.getHistory())
ipcMain.handle('chat:clear',   () => { engine.clearHistory(); return { ok: true } })

ipcMain.handle('approval:respond', (_e, id: string, approved: boolean) => {
  engine.resolveApproval(id, approved)
  return { ok: true }
})

ipcMain.handle('session:get', () => ({
  mode: engine.getMode(),
  cwd:  engine.getCwd(),
  messageCount: engine.getHistory().length
}))

ipcMain.handle('session:set-mode', (_e, mode: 'PLAN' | 'BUILD') => {
  engine.setMode(mode)
  return { ok: true }
})

ipcMain.handle('session:set-cwd', (_e, cwd: string) => {
  engine.setCwd(cwd)
  return { ok: true }
})

ipcMain.handle('window:pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
  return result.filePaths[0] || null
})

ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('window:close', () => mainWindow?.close())
