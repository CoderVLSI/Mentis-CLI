/**
 * Telegram channel for Mentis CLI.
 *
 * Long-polls the Telegram Bot API and processes incoming messages through a
 * headless agent that uses the same provider/model config as the CLI.
 * Each Telegram conversation maintains its own history (separate from the
 * interactive REPL session).
 *
 * Config keys in ~/.mentisrc:
 *   telegram.botToken        — bot token from @BotFather
 *   telegram.allowedChatIds  — comma-separated chat IDs (empty = anyone)
 *   telegram.autoApprove     — allow write/shell tools without confirmation
 */

import axios from 'axios'
import os from 'os'
import * as fs from 'fs-extra'
import * as path from 'path'
import { ConfigManager } from '../config/ConfigManager'
import { OpenAIClient } from '../llm/OpenAIClient'
import { AnthropicClient } from '../llm/AnthropicClient'
import { ModelClient, ChatMessage, ToolDefinition } from '../llm/ModelInterface'
import { WriteFileTool, ReadFileTool, ListDirTool, EditFileTool } from '../tools/FileTools'
import { SearchFileTool } from '../tools/SearchTools'
import { WebSearchTool } from '../tools/WebSearchTool'
import { PersistentShell } from '../repl/PersistentShell'
import { PersistentShellTool } from '../tools/PersistentShellTool'
import { GitStatusTool, GitDiffTool } from '../tools/GitTools'
import { Tool } from '../tools/Tool'

const TG = 'https://api.telegram.org'
const SYSTEM_PROMPT = `You are Mentis, an expert AI coding agent. Working directory: ${process.cwd()}.
You have file and shell tools available. Be concise — your responses will be read in Telegram.`

// ── Telegram helpers ──────────────────────────────────────────────────────────

async function tgCall(
  token: string,
  method: string,
  data: Record<string, unknown> = {},
  timeout = 6000
): Promise<Record<string, unknown>> {
  try {
    const res = await axios.post(`${TG}/bot${token}/${method}`, data, { timeout })
    return res.data as Record<string, unknown>
  } catch {
    return { ok: false }
  }
}

async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
  const MAX = 4000
  for (let i = 0; i < text.length; i += MAX) {
    await tgCall(token, 'sendMessage', { chat_id: chatId, text: text.slice(i, i + MAX) })
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── Channel state ─────────────────────────────────────────────────────────────

let _running  = false
let _stop     = false
let _username = ''

export function stopCliTelegramChannel()    { _stop = true }
export function isCliTelegramRunning()      { return _running }
export function getCliBotUsername()         { return _username }

// Per-chat conversation histories
const chatHistories = new Map<number, ChatMessage[]>()

// ── Build model client from CLI config ────────────────────────────────────────

function buildClient(): ModelClient {
  const config  = new ConfigManager().getConfig()
  const provider = config.defaultProvider || 'ollama'

  if (provider === 'anthropic') {
    const apiKey = config.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY || ''
    const model  = config.anthropic?.model  || 'claude-sonnet-4-6'
    return new AnthropicClient(apiKey, model)
  }

  // Ollama / OpenAI-compatible
  const rawBase = config.ollama?.baseUrl || 'http://localhost:11434/v1'
  const base    = rawBase.replace(/\/$/, '').endsWith('/v1') ? rawBase.replace(/\/$/, '') : `${rawBase.replace(/\/$/, '')}/v1`
  const apiKey  = config.openai?.apiKey  || 'ollama'
  const model   = config.openai?.model   || config.ollama?.model || 'llama3'
  return new OpenAIClient(base, apiKey, model)
}

// ── Build tool set ────────────────────────────────────────────────────────────

function buildTools(autoApprove: boolean): Tool[] {
  const tools: Tool[] = [
    new ReadFileTool(),
    new ListDirTool(),
    new SearchFileTool(),
    new WebSearchTool(),
    new GitStatusTool(),
    new GitDiffTool(),
  ]
  if (autoApprove) {
    const shell = new PersistentShell()
    tools.push(
      new WriteFileTool(),
      new EditFileTool(),
      new PersistentShellTool(shell),
    )
  }
  return tools
}

// ── Headless chat ─────────────────────────────────────────────────────────────

async function runAgent(
  client:  ModelClient,
  tools:   Tool[],
  history: ChatMessage[],
  userMsg: string
): Promise<string> {
  history.push({ role: 'user', content: userMsg })

  const toolDefs: ToolDefinition[] = tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))

  const systemMessages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]

  let response = await client.chat([...systemMessages, ...history], toolDefs)

  // Tool loop
  while (response.tool_calls && response.tool_calls.length > 0) {
    history.push({ role: 'assistant', content: response.content, tool_calls: response.tool_calls })

    for (const tc of response.tool_calls) {
      const tool = tools.find(t => t.name === tc.function.name)
      let result = ''
      try {
        const args = JSON.parse(tc.function.arguments || '{}')
        result = tool ? await tool.execute(args) : `Error: tool '${tc.function.name}' not available`
      } catch (e: unknown) {
        result = `Error: ${(e as Error).message}`
      }
      history.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: result })
    }

    response = await client.chat([...systemMessages, ...history], toolDefs)
  }

  const finalText = response.content || '✓ Done'
  history.push({ role: 'assistant', content: finalText })
  return finalText
}

// ── Per-message handler ───────────────────────────────────────────────────────

const _busy = new Set<number>()

async function handleMessage(
  token:       string,
  chatId:      number,
  text:        string,
  client:      ModelClient,
  tools:       Tool[]
): Promise<void> {
  if (_busy.has(chatId)) {
    await sendMessage(token, chatId, '⏳ Still working on previous message…')
    return
  }
  _busy.add(chatId)

  // Typing indicator
  let stopped = false
  const typing = setInterval(() => {
    if (!stopped) tgCall(token, 'sendChatAction', { chat_id: chatId, action: 'typing' })
  }, 4000)
  tgCall(token, 'sendChatAction', { chat_id: chatId, action: 'typing' })

  if (!chatHistories.has(chatId)) chatHistories.set(chatId, [])
  const history = chatHistories.get(chatId)!

  // /clear command
  if (text.trim() === '/clear') {
    chatHistories.set(chatId, [])
    stopped = true; clearInterval(typing)
    _busy.delete(chatId)
    await sendMessage(token, chatId, '🧹 History cleared.')
    return
  }

  try {
    const reply = await runAgent(client, tools, history, text)
    stopped = true; clearInterval(typing)
    await sendMessage(token, chatId, reply)
  } catch (e: unknown) {
    stopped = true; clearInterval(typing)
    await sendMessage(token, chatId, `⚠ ${(e as Error).message}`)
  } finally {
    _busy.delete(chatId)
  }
}

// ── Main polling loop ─────────────────────────────────────────────────────────

export async function startCliTelegramChannel(
  allowedChatIds: number[],
  autoApprove:    boolean,
  onUserMessage?: (text: string, fromName: string) => void
): Promise<void> {
  if (_running) { stopCliTelegramChannel(); await sleep(500) }

  const cfg   = new ConfigManager().getConfig()
  const tg    = cfg.telegram || {}
  const token = (tg.botToken || '').trim()
  if (!token) return

  _stop    = false
  _running = false
  _username = ''

  const me = await tgCall(token, 'getMe')
  if (!me.ok) { console.error('[telegram] Invalid bot token'); return }
  _username = ((me.result as Record<string, unknown>)?.username as string) || ''
  _running = true
  console.log(`[telegram] Bot @${_username} connected`)

  const client = buildClient()
  const tools  = buildTools(autoApprove)
  let offset   = 0

  while (!_stop) {
    try {
      const result = await tgCall(
        token, 'getUpdates',
        { timeout: 25, offset, allowed_updates: ['message'] },
        30_000
      )

      if (!result?.ok) { await sleep(3000); continue }

      type TgUpdate = {
        update_id: number
        message?: {
          chat: { id: number }
          from: { id: number; first_name: string; username?: string }
          text?: string
        }
      }

      for (const update of (result.result ?? []) as TgUpdate[]) {
        offset = update.update_id + 1
        const msg = update.message
        if (!msg?.text) continue

        const chatId = msg.chat.id
        if (allowedChatIds.length > 0 && !allowedChatIds.includes(chatId)) {
          await sendMessage(token, chatId, '⛔ Not authorised.')
          continue
        }

        const fromName = msg.from.username ? `@${msg.from.username}` : msg.from.first_name
        onUserMessage?.(msg.text, fromName)

        handleMessage(token, chatId, msg.text, client, tools).catch(() => {})
      }
    } catch {
      if (!_stop) await sleep(5000)
    }
  }

  _running = false
  console.log('[telegram] Bot disconnected')
}
