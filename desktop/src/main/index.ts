import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { HeadlessEngine, loadConfig, saveConfig } from './engine'
import { startSyncServer } from './syncServer'
import os from 'os'
import fs from 'fs-extra'
import path from 'path'
import axios from 'axios'

// node-pty is a native module — load with graceful fallback
let pty: typeof import('node-pty') | null = null
try { pty = require('node-pty') } catch { /* terminal falls back gracefully */ }

const MCP_PATH      = path.join(os.homedir(), '.mentis', 'mcp.json')
const SETTINGS_PATH = path.join(os.homedir(), '.mentis', 'settings.json')

let mainWindow: BrowserWindow | null = null
const engine = new HeadlessEngine()

// ── PTY sessions ──────────────────────────────────────────────────────────────
const ptySessions = new Map<string, import('node-pty').IPty>()
let ptyCounter = 0

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    show: false, frame: false, titleBarStyle: 'hidden',
    backgroundColor: '#0d0d0d',
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      webviewTag: true,        // enable <webview> for in-app browser
    }
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
  startSyncServer(engine)  // mobile sync on :3747
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  ptySessions.forEach(p => { try { p.kill() } catch {} })
  if (process.platform !== 'darwin') app.quit()
})

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

ipcMain.handle('config:update-provider-settings', (_e, provider: string, settings: Record<string, string>) => {
  const cfg = loadConfig()
  cfg[provider] = { ...((cfg[provider] as Record<string, string>) || {}), ...settings }
  saveConfig(cfg)
  return { ok: true }
})

// ── Models ────────────────────────────────────────────────────────────────────
ipcMain.handle('models:list', async () => {
  const cfg      = loadConfig()
  const provider = (cfg.defaultProvider as string) || 'ollama'
  const p        = (cfg[provider] as Record<string, string>) || {}

  const STATIC_MODELS: Record<string, string[]> = {
    anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    openai:    ['gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-4o', 'o3'],
    gemini:    ['gemini-3.1-pro', 'gemini-3.1-flash', 'gemini-3-flash', 'gemini-2.5-pro'],
    grok:      ['grok-4.20', 'grok-4.20-reasoning', 'grok-code-fast-1', 'grok-4.1-fast'],
    kimi:      ['kimi-k2.6', 'kimi-k2.5', 'moonshot-v1-128k', 'moonshot-v1-32k'],
    glm:       ['glm-5.1', 'glm-5', 'glm-5-turbo', 'glm-4.7', 'glm-4.7-flash'],
  }
  if (STATIC_MODELS[provider]) return STATIC_MODELS[provider]

  const rawBase    = (p.baseUrl || 'http://localhost:11434/v1').replace(/\/$/, '')
  const ollamaBase = rawBase.replace(/\/v1$/, '')

  try {
    const res = await axios.get(`${ollamaBase}/api/tags`, { timeout: 3000 })
    const models = (res.data?.models || []) as Array<{ name: string }>
    if (models.length) return models.map(m => m.name)
  } catch {}

  try {
    const base = rawBase.endsWith('/v1') ? rawBase : `${rawBase}/v1`
    const res  = await axios.get(`${base}/models`, { timeout: 3000, headers: { Authorization: `Bearer ${p.apiKey || 'ollama'}` } })
    const data = (res.data?.data || []) as Array<{ id: string }>
    if (data.length) return data.map(m => m.id)
  } catch {}

  return []
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
ipcMain.handle('sync:info', () => {
  // Return local IPs so the desktop Settings modal can show them
  const nets = os.networkInterfaces()
  const ips: string[] = []
  for (const iface of Object.values(nets)) {
    for (const info of iface ?? []) {
      if (info.family === 'IPv4' && !info.internal) ips.push(info.address)
    }
  }
  return { port: 3747, ips }
})

ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => { if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize() })
ipcMain.handle('window:close',    () => mainWindow?.close())

// ── Terminal (node-pty) ───────────────────────────────────────────────────────
ipcMain.handle('terminal:create', (_e, cols: number, rows: number) => {
  if (!pty) return { ok: false, error: 'node-pty unavailable' }

  const id    = String(++ptyCounter)
  const shell = process.platform === 'win32'
    ? 'powershell.exe'
    : (process.env.SHELL || '/bin/bash')

  try {
    const proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols, rows,
      cwd: engine.getCwd() || os.homedir(),
      env: process.env as Record<string, string>,
    })

    proc.onData(data => {
      mainWindow?.webContents.send('engine:terminal:output', { id, data })
    })

    proc.onExit(({ exitCode }) => {
      mainWindow?.webContents.send('engine:terminal:exit', { id, code: exitCode })
      ptySessions.delete(id)
    })

    ptySessions.set(id, proc)
    return { ok: true, id }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})

ipcMain.handle('terminal:write', (_e, id: string, data: string) => {
  ptySessions.get(id)?.write(data)
  return { ok: true }
})

ipcMain.handle('terminal:resize', (_e, id: string, cols: number, rows: number) => {
  try { ptySessions.get(id)?.resize(cols, rows) } catch {}
  return { ok: true }
})

ipcMain.handle('terminal:kill', (_e, id: string) => {
  const proc = ptySessions.get(id)
  if (proc) { try { proc.kill() } catch {} ptySessions.delete(id) }
  return { ok: true }
})
