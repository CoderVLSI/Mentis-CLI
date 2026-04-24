import EventEmitter from 'events'
import path from 'path'
import fs from 'fs-extra'
import os from 'os'
import axios from 'axios'

export type MsgRole = 'user' | 'assistant' | 'tool' | 'system'

export interface ChatMessage {
  role: MsgRole
  content?: string
  tool_call_id?: string
  name?: string
  tool_calls?: ToolCall[]
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface SessionMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

export interface EngineEvent {
  thinking:         { text: string }
  message_start:    { role: 'assistant' }
  message_chunk:    { text: string }
  message_end:      { content: string }
  tool_start:       { id: string; name: string; args: Record<string, unknown> }
  tool_result:      { id: string; name: string; result: string }
  tool_summary:     { names: string[]; count: number }
  approval_needed:  { id: string; name: string; args: Record<string, unknown>; preview?: string }
  approval_done:    { id: string; approved: boolean }
  error:            { message: string }
  session_update:   { messageCount: number; mode: 'PLAN' | 'BUILD'; model: string; cwd: string; sessionId: string }
  sessions_changed: { sessions: SessionMeta[] }
}

export type EngineEventName = keyof EngineEvent

// ── Paths ─────────────────────────────────────────────────────────────────────

const CONFIG_PATH      = path.join(os.homedir(), '.mentis', 'config.json')
const LEGACY_HIST      = path.join(os.homedir(), '.mentis', 'desktop-history.json')
const SESSIONS_INDEX   = path.join(os.homedir(), '.mentis', 'sessions.json')
const SESSIONS_DIR     = path.join(os.homedir(), '.mentis', 'sessions')

// ── Config ────────────────────────────────────────────────────────────────────

export function loadConfig(): Record<string, unknown> {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) } catch { return {} }
}

export function saveConfig(cfg: Record<string, unknown>): void {
  fs.ensureDirSync(path.dirname(CONFIG_PATH))
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
}

// ── Session storage ───────────────────────────────────────────────────────────

function loadIndex(): SessionMeta[] {
  try { return JSON.parse(fs.readFileSync(SESSIONS_INDEX, 'utf-8')) } catch { return [] }
}

function saveIndex(index: SessionMeta[]): void {
  fs.ensureDirSync(path.dirname(SESSIONS_INDEX))
  fs.writeFileSync(SESSIONS_INDEX, JSON.stringify(index, null, 2))
}

function loadMessages(id: string): ChatMessage[] {
  try { return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, `${id}.json`), 'utf-8')) } catch { return [] }
}

function saveMessages(id: string, msgs: ChatMessage[]): void {
  fs.ensureDirSync(SESSIONS_DIR)
  fs.writeFileSync(path.join(SESSIONS_DIR, `${id}.json`), JSON.stringify(msgs, null, 2))
}

function genId(): string {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// ── Tools ─────────────────────────────────────────────────────────────────────

const TOOLS = [
  { type: 'function', function: { name: 'read_file',  description: 'Read a file.',          parameters: { type: 'object', properties: { file_path: { type: 'string' } },                                                                                     required: ['file_path'] } } },
  { type: 'function', function: { name: 'write_file', description: 'Write to a file.',       parameters: { type: 'object', properties: { file_path: { type: 'string' }, content: { type: 'string' } },                                                        required: ['file_path', 'content'] } } },
  { type: 'function', function: { name: 'edit_file',  description: 'Replace text in file.',  parameters: { type: 'object', properties: { file_path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } },                     required: ['file_path', 'old_string', 'new_string'] } } },
  { type: 'function', function: { name: 'list_dir',   description: 'List a directory.',      parameters: { type: 'object', properties: { path: { type: 'string' } },                                                                                          required: ['path'] } } },
  { type: 'function', function: { name: 'run_shell',  description: 'Run a shell command.',   parameters: { type: 'object', properties: { command: { type: 'string' } },                                                                                       required: ['command'] } } }
]

const NEEDS_APPROVAL = new Set(['write_file', 'edit_file', 'run_shell'])

async function executeTool(name: string, args: Record<string, unknown>, cwd: string): Promise<string> {
  try {
    if (name === 'read_file')  return fs.readFileSync(path.resolve(cwd, args.file_path as string), 'utf-8')
    if (name === 'write_file') {
      const p = path.resolve(cwd, args.file_path as string)
      fs.ensureDirSync(path.dirname(p)); fs.writeFileSync(p, args.content as string, 'utf-8')
      return `Written ${p}`
    }
    if (name === 'edit_file') {
      const p = path.resolve(cwd, args.file_path as string)
      const src = fs.readFileSync(p, 'utf-8')
      if (!src.includes(args.old_string as string)) return `Error: old_string not found in ${p}`
      fs.writeFileSync(p, src.split(args.old_string as string).join(args.new_string as string), 'utf-8')
      return `Edited ${p}`
    }
    if (name === 'list_dir')  return fs.readdirSync(path.resolve(cwd, args.path as string)).join('\n')
    if (name === 'run_shell') {
      const { execSync } = require('child_process')
      return execSync(args.command as string, { cwd, timeout: 30000, encoding: 'utf-8' })
    }
    return `Unknown tool: ${name}`
  } catch (e: unknown) { return `Error: ${(e as Error).message}` }
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class HeadlessEngine extends EventEmitter {
  private history: ChatMessage[] = []
  private mode: 'PLAN' | 'BUILD' = 'BUILD'
  private cwd = process.cwd()
  private abortController: AbortController | null = null
  private pendingApprovals = new Map<string, (approved: boolean) => void>()
  private currentSessionId = ''

  emit<K extends EngineEventName>(event: K, data: EngineEvent[K]): boolean { return super.emit(event, data) }
  on<K extends EngineEventName>(event: K, listener: (data: EngineEvent[K]) => void): this { return super.on(event, listener) }

  constructor() {
    super()
    this.migrateLegacy()
    const index = loadIndex()
    if (index.length > 0) {
      this.currentSessionId = index[0].id
      this.history = loadMessages(this.currentSessionId)
    } else {
      this.currentSessionId = this.createSession()
    }
  }

  private migrateLegacy() {
    if (fs.existsSync(LEGACY_HIST) && loadIndex().length === 0) {
      try {
        const old: ChatMessage[] = JSON.parse(fs.readFileSync(LEGACY_HIST, 'utf-8'))
        if (old.length > 0) {
          const id = genId()
          const first = old.find(m => m.role === 'user')
          saveMessages(id, old)
          saveIndex([{ id, title: (first?.content || 'Previous session').slice(0, 60), createdAt: Date.now(), updatedAt: Date.now(), messageCount: old.length }])
        }
      } catch {}
    }
  }

  // ── Session CRUD ──────────────────────────────────────────────────────────

  createSession(): string {
    const id = genId()
    saveIndex([{ id, title: 'New chat', createdAt: Date.now(), updatedAt: Date.now(), messageCount: 0 }, ...loadIndex()])
    this.currentSessionId = id
    this.history = []
    this.emit('sessions_changed', { sessions: loadIndex() })
    return id
  }

  loadSession(id: string): boolean {
    if (!loadIndex().find(s => s.id === id)) return false
    this.currentSessionId = id
    this.history = loadMessages(id)
    return true
  }

  listSessions(): SessionMeta[]  { return loadIndex() }
  getCurrentSessionId(): string  { return this.currentSessionId }

  deleteSession(id: string): void {
    const index = loadIndex().filter(s => s.id !== id)
    saveIndex(index)
    try { fs.unlinkSync(path.join(SESSIONS_DIR, `${id}.json`)) } catch {}
    if (this.currentSessionId === id) {
      if (index.length > 0) { this.currentSessionId = index[0].id; this.history = loadMessages(index[0].id) }
      else this.currentSessionId = this.createSession()
    }
    this.emit('sessions_changed', { sessions: loadIndex() })
  }

  renameSession(id: string, title: string): void {
    const index = loadIndex()
    const meta = index.find(s => s.id === id)
    if (meta) { meta.title = title; saveIndex(index) }
    this.emit('sessions_changed', { sessions: loadIndex() })
  }

  // ── Getters / setters ─────────────────────────────────────────────────────

  getHistory()  { return this.history }
  getMode()     { return this.mode }
  getCwd()      { return this.cwd }
  setCwd(p: string)              { this.cwd = p }
  setMode(m: 'PLAN' | 'BUILD')  { this.mode = m }
  getActiveProvider()            { return (loadConfig().activeProvider as string) || 'ollama' }

  clearHistory() {
    this.history = []
    saveMessages(this.currentSessionId, [])
    const index = loadIndex()
    const meta = index.find(s => s.id === this.currentSessionId)
    if (meta) { meta.messageCount = 0; meta.title = 'New chat'; saveIndex(index) }
    this.emit('sessions_changed', { sessions: loadIndex() })
  }

  resolveApproval(id: string, approved: boolean) {
    const resolve = this.pendingApprovals.get(id)
    if (resolve) { resolve(approved); this.pendingApprovals.delete(id) }
    this.emit('approval_done', { id, approved })
  }

  cancel() { this.abortController?.abort() }

  private getApiConfig() {
    const cfg = loadConfig()
    const provider = (cfg.activeProvider as string) || 'ollama'
    const providers = (cfg.providers as Record<string, Record<string, string>>) || {}
    const p = providers[provider] || {}
    if (provider === 'anthropic') {
      return { url: 'https://api.anthropic.com/v1/messages', key: p.apiKey || '', type: 'anthropic', model: p.model || 'claude-sonnet-4-6', provider }
    }
    const base = (p.baseUrl || 'http://localhost:11434').replace(/\/$/, '')
    return { url: `${base}/v1/chat/completions`, key: p.apiKey || 'ollama', type: 'openai', model: p.model || 'llama3', provider }
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  async chat(userMessage: string): Promise<void> {
    this.abortController = new AbortController()
    const cfg = this.getApiConfig()

    // Auto-title session from first user message
    const index = loadIndex()
    const meta = index.find(s => s.id === this.currentSessionId)
    if (meta && (meta.title === 'New chat' || !meta.title)) {
      meta.title = userMessage.slice(0, 60)
      meta.updatedAt = Date.now()
      saveIndex(index)
      this.emit('sessions_changed', { sessions: loadIndex() })
    }

    this.history.push({ role: 'user', content: userMessage })
    this.emit('message_start', { role: 'assistant' })
    this.emit('thinking', { text: 'Thinking...' })

    const systemPrompt = `You are Mentis, an expert AI coding assistant. Mode: ${this.mode}. Working directory: ${this.cwd}. Be concise and thorough. Use tools to complete tasks.`

    try {
      let keepGoing = true
      while (keepGoing) {
        const messages = this.history.filter(m => m.role !== 'system')
        const resp = await axios.post(cfg.url, {
          model: cfg.model,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          tools: TOOLS, tool_choice: 'auto', max_tokens: 4096
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cfg.key}`,
            ...(cfg.type === 'anthropic' ? { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' } : {})
          },
          signal: this.abortController.signal,
          timeout: 120000
        })

        const msg        = resp.data.choices?.[0]?.message
        if (!msg) break
        const content    = msg.content || ''
        const toolCalls: ToolCall[] = msg.tool_calls || []

        this.history.push({ role: 'assistant', content, tool_calls: toolCalls.length ? toolCalls : undefined })
        if (content) this.emit('message_chunk', { text: content })

        if (!toolCalls.length) { keepGoing = false; break }

        this.emit('tool_summary', { names: toolCalls.map(tc => tc.function.name), count: toolCalls.length })

        const results: ChatMessage[] = []
        for (const tc of toolCalls) {
          const name = tc.function.name
          let args: Record<string, unknown> = {}
          try { args = JSON.parse(tc.function.arguments) } catch {}

          this.emit('tool_start', { id: tc.id, name, args })

          let approved = true
          if (NEEDS_APPROVAL.has(name)) {
            approved = await new Promise<boolean>((resolve) => {
              this.pendingApprovals.set(tc.id, resolve)
              this.emit('approval_needed', { id: tc.id, name, args })
            })
          }

          const result = approved ? await executeTool(name, args, this.cwd) : 'User denied this action.'
          this.emit('tool_result', { id: tc.id, name, result })
          results.push({ role: 'tool', tool_call_id: tc.id, name, content: result })
        }
        this.history.push(...results)
      }

      const last = this.history.filter(m => m.role === 'assistant').pop()
      this.emit('message_end', { content: last?.content || '' })

      saveMessages(this.currentSessionId, this.history)
      const idx2 = loadIndex()
      const m2   = idx2.find(s => s.id === this.currentSessionId)
      if (m2) { m2.updatedAt = Date.now(); m2.messageCount = this.history.length; saveIndex(idx2) }

      this.emit('session_update',   { messageCount: this.history.length, mode: this.mode, model: cfg.model, cwd: this.cwd, sessionId: this.currentSessionId })
      this.emit('sessions_changed', { sessions: loadIndex() })

    } catch (e: unknown) {
      const msg = (e as Error).message || ''
      this.emit('error', { message: (msg.includes('aborted') || msg.includes('canceled')) ? 'Cancelled.' : (msg || 'Unknown error') })
    }
  }
}
