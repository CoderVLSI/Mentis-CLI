/**
 * HeadlessEngine — drives the Mentis core (model client + tools) and emits
 * typed events that the Electron main process forwards to the renderer.
 */

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

export interface EngineEvent {
  thinking:        { text: string }
  message_start:   { role: 'assistant' }
  message_chunk:   { text: string }
  message_end:     { content: string }
  tool_start:      { id: string; name: string; args: Record<string, unknown> }
  tool_result:     { id: string; name: string; result: string }
  approval_needed: { id: string; name: string; args: Record<string, unknown>; preview?: string }
  approval_done:   { id: string; approved: boolean }
  error:           { message: string }
  session_update:  { messageCount: number; mode: 'PLAN' | 'BUILD'; model: string; cwd: string }
}

export type EngineEventName = keyof EngineEvent

const CONFIG_PATH = path.join(os.homedir(), '.mentis', 'config.json')
const HISTORY_PATH = path.join(os.homedir(), '.mentis', 'desktop-history.json')

function loadConfig(): Record<string, unknown> {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) } catch { return {} }
}

function loadHistory(): ChatMessage[] {
  try { return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8')) } catch { return [] }
}

function saveHistory(h: ChatMessage[]): void {
  try {
    fs.ensureDirSync(path.dirname(HISTORY_PATH))
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(h, null, 2))
  } catch {}
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file from disk.',
      parameters: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file.',
      parameters: { type: 'object', properties: { file_path: { type: 'string' }, content: { type: 'string' } }, required: ['file_path', 'content'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace a string in a file.',
      parameters: { type: 'object', properties: { file_path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['file_path', 'old_string', 'new_string'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List files in a directory.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_shell',
      description: 'Run a shell command.',
      parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] }
    }
  }
]

const NEEDS_APPROVAL = new Set(['write_file', 'edit_file', 'run_shell'])

async function executeToolLocally(name: string, args: Record<string, unknown>, cwd: string): Promise<string> {
  try {
    if (name === 'read_file') {
      const p = path.resolve(cwd, args.file_path as string)
      return fs.readFileSync(p, 'utf-8')
    }
    if (name === 'write_file') {
      const p = path.resolve(cwd, args.file_path as string)
      fs.ensureDirSync(path.dirname(p))
      fs.writeFileSync(p, args.content as string, 'utf-8')
      return `Written ${p}`
    }
    if (name === 'edit_file') {
      const p = path.resolve(cwd, args.file_path as string)
      const original = fs.readFileSync(p, 'utf-8')
      if (!original.includes(args.old_string as string)) return `Error: old_string not found in ${p}`
      fs.writeFileSync(p, original.split(args.old_string as string).join(args.new_string as string), 'utf-8')
      return `Edited ${p}`
    }
    if (name === 'list_dir') {
      const p = path.resolve(cwd, args.path as string)
      const items = fs.readdirSync(p)
      return items.join('\n')
    }
    if (name === 'run_shell') {
      const { execSync } = require('child_process')
      return execSync(args.command as string, { cwd, timeout: 30000, encoding: 'utf-8' })
    }
    return `Unknown tool: ${name}`
  } catch (e: unknown) {
    return `Error: ${(e as Error).message}`
  }
}

export class HeadlessEngine extends EventEmitter {
  private history: ChatMessage[] = []
  private mode: 'PLAN' | 'BUILD' = 'BUILD'
  private cwd = process.cwd()
  private abortController: AbortController | null = null
  private pendingApprovals = new Map<string, (approved: boolean) => void>()

  emit<K extends EngineEventName>(event: K, data: EngineEvent[K]): boolean {
    return super.emit(event, data)
  }

  on<K extends EngineEventName>(event: K, listener: (data: EngineEvent[K]) => void): this {
    return super.on(event, listener)
  }

  constructor() {
    super()
    this.history = loadHistory()
  }

  getHistory() { return this.history }
  getMode()    { return this.mode }
  getCwd()     { return this.cwd }
  setCwd(p: string) { this.cwd = p }
  setMode(m: 'PLAN' | 'BUILD') { this.mode = m }

  clearHistory() {
    this.history = []
    saveHistory([])
  }

  resolveApproval(id: string, approved: boolean) {
    const resolve = this.pendingApprovals.get(id)
    if (resolve) { resolve(approved); this.pendingApprovals.delete(id) }
    this.emit('approval_done', { id, approved })
  }

  cancel() {
    this.abortController?.abort()
  }

  private getApiConfig() {
    const cfg = loadConfig() as Record<string, unknown>
    const provider = (cfg.activeProvider as string) || 'ollama'
    const providers = (cfg.providers as Record<string, Record<string, string>>) || {}
    const p = providers[provider] || {}
    if (provider === 'anthropic') {
      return { url: 'https://api.anthropic.com/v1/messages', key: p.apiKey || '', type: 'anthropic', model: p.model || 'claude-sonnet-4-6' }
    }
    const base = (p.baseUrl || 'http://localhost:11434').replace(/\/$/, '')
    return { url: `${base}/v1/chat/completions`, key: p.apiKey || 'ollama', type: 'openai', model: p.model || 'llama3' }
  }

  async chat(userMessage: string): Promise<void> {
    this.abortController = new AbortController()
    const cfg = this.getApiConfig()

    this.history.push({ role: 'user', content: userMessage })
    this.emit('message_start', { role: 'assistant' })
    this.emit('thinking', { text: 'Thinking...' })

    const systemPrompt = `You are Mentis, an expert AI coding assistant. Mode: ${this.mode}. Working directory: ${this.cwd}. Be concise and thorough. Use tools to complete tasks.`

    try {
      let keepGoing = true
      while (keepGoing) {
        const messages = this.history.filter(m => m.role !== 'system')
        const body = {
          model: cfg.model,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          tools: TOOLS,
          tool_choice: 'auto',
          max_tokens: 4096
        }

        const resp = await axios.post(cfg.url, body, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cfg.key}`,
            ...(cfg.type === 'anthropic' ? { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' } : {})
          },
          signal: this.abortController.signal,
          timeout: 120000
        })

        const choice = resp.data.choices?.[0]
        const msg = choice?.message
        if (!msg) break

        const content = msg.content || ''
        const toolCalls: ToolCall[] = msg.tool_calls || []

        this.history.push({ role: 'assistant', content, tool_calls: toolCalls.length ? toolCalls : undefined })

        if (content) {
          this.emit('message_chunk', { text: content })
        }

        if (!toolCalls.length) {
          keepGoing = false
          break
        }

        const toolResults: ChatMessage[] = []

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

          let result = ''
          if (approved) {
            result = await executeToolLocally(name, args, this.cwd)
          } else {
            result = 'User denied this action.'
          }

          this.emit('tool_result', { id: tc.id, name, result })
          toolResults.push({ role: 'tool', tool_call_id: tc.id, name, content: result })
        }

        this.history.push(...toolResults)
      }

      const last = this.history.filter(m => m.role === 'assistant').pop()
      this.emit('message_end', { content: last?.content || '' })
      saveHistory(this.history)

      this.emit('session_update', {
        messageCount: this.history.length,
        mode: this.mode,
        model: cfg.model,
        cwd: this.cwd
      })
    } catch (e: unknown) {
      if ((e as Error).message?.includes('aborted') || (e as Error).message?.includes('canceled')) {
        this.emit('error', { message: 'Cancelled.' })
      } else {
        this.emit('error', { message: (e as Error).message || 'Unknown error' })
      }
    }
  }
}
