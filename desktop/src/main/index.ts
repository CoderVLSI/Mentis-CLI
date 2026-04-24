import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { HeadlessEngine, loadConfig, saveConfig } from './engine'
import os from 'os'
import fs from 'fs-extra'
import path from 'path'

const MCP_PATH      = path.join(os.homedir(), '.mentis', 'mcp.json')
const SETTINGS_PATH = path.join(os.homedir(), '.mentis', 'settings.json')

let mainWindow: BrowserWindow | null = null
const engine = new HeadlessEngine()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    show: false, frame: false, titleBarStyle: 'hidden',
    backgroundColor: '#0d0d0d',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true }
  })
  mainWindow.on('ready-to-show', () => mainWindow!.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function forwardEngineEvents(): void {
  const fwd = (name: string) => (data: unknown) => mainWindow?.webContents.send(`engine:${name}`, data)
  engine.on('thinking',         fwd('thinking'))
  engine.on('message_start',    fwd('message_start'))
  engine.on('message_chunk',    fwd('message_chunk'))
  engine.on('message_end',      fwd('message_end'))
  engine.on('tool_start',       fwd('tool_start'))
  engine.on('tool_result',      fwd('tool_result'))
  engine.on('tool_summary',     fwd('tool_summary'))
  engine.on('approval_needed',  fwd('approval_needed'))
  engine.on('approval_done',    fwd('approval_done'))
  engine.on('error',            fwd('error'))
  engine.on('session_update',   fwd('session_update'))
  engine.on('sessions_changed', fwd('sessions_changed'))
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.mentis.desktop')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))
  createWindow()
  forwardEngineEvents()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ── Chat ──────────────────────────────────────────────────────────────────────
ipcMain.handle('chat:send',    async (_e, msg: string) => { engine.chat(msg); return { ok: true } })
ipcMain.handle('chat:cancel',  ()                       => { engine.cancel(); return { ok: true } })
ipcMain.handle('chat:history', ()                       => engine.getHistory())
ipcMain.handle('chat:clear',   ()                       => { engine.clearHistory(); return { ok: true } })

// ── Approval ──────────────────────────────────────────────────────────────────
ipcMain.handle('approval:respond', (_e, id: string, approved: boolean) => { engine.resolveApproval(id, approved); return { ok: true } })

// ── Session ───────────────────────────────────────────────────────────────────
ipcMain.handle('session:get',      ()                              => ({ mode: engine.getMode(), cwd: engine.getCwd(), messageCount: engine.getHistory().length, sessionId: engine.getCurrentSessionId() }))
ipcMain.handle('session:set-mode', (_e, mode: 'PLAN' | 'BUILD')   => { engine.setMode(mode); return { ok: true } })
ipcMain.handle('session:set-cwd',  (_e, cwd: string)              => { engine.setCwd(cwd);   return { ok: true } })

// ── Sessions (multi) ──────────────────────────────────────────────────────────
ipcMain.handle('sessions:list',   ()                               => engine.listSessions())
ipcMain.handle('sessions:new',    ()                               => { const id = engine.createSession(); return { ok: true, id } })
ipcMain.handle('sessions:load',   (_e, id: string)                => { const ok = engine.loadSession(id); return { ok, history: engine.getHistory() } })
ipcMain.handle('sessions:delete', (_e, id: string)                => { engine.deleteSession(id); return { ok: true } })
ipcMain.handle('sessions:rename', (_e, id: string, title: string) => { engine.renameSession(id, title); return { ok: true } })

// ── Config ────────────────────────────────────────────────────────────────────
ipcMain.handle('config:get', () => loadConfig())

ipcMain.handle('config:set-model', (_e, model: string) => {
  const cfg      = loadConfig()
  // Write to ~/.mentisrc CLI format: cfg[provider].model
  const provider = (cfg.defaultProvider as string) || 'ollama'
  const p        = (cfg[provider] as Record<string, string>) || {}
  p.model        = model
  cfg[provider]  = p
  saveConfig(cfg)
  return { ok: true }
})

ipcMain.handle('config:set-provider', (_e, provider: string) => {
  const cfg = loadConfig(); cfg.defaultProvider = provider; saveConfig(cfg)
  return { ok: true }
})

// ── MCP + Hooks ───────────────────────────────────────────────────────────────
ipcMain.handle('mcp:list', () => {
  try { return JSON.parse(fs.readFileSync(MCP_PATH, 'utf-8')) } catch { return [] }
})

ipcMain.handle('hooks:list', () => {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'))
    return s.hooks || {}
  } catch { return {} }
})

// ── Window ────────────────────────────────────────────────────────────────────
ipcMain.handle('window:pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
  return result.filePaths[0] || null
})
ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => { if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize() })
ipcMain.handle('window:close',    () => mainWindow?.close())
