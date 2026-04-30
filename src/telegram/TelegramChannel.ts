/**
 * Telegram channel for Mentis CLI.
 *
 * Features:
 *   - /clear or /reset  — wipe chat history
 *   - /help             — show available bot commands
 *   - Image support     — photos are downloaded and passed as base64 to the model
 *   - Group chat        — mentions of @botUsername are stripped; bot responds when
 *                         mentioned or replied to in groups
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
import { loadTasks, saveTasks, parseInterval, parseNaturalInterval, ScheduledTask } from '../scheduler/Scheduler'

const TG = 'https://api.telegram.org'
const SYSTEM_PROMPT = `You are Mentis, an expert AI coding agent. Working directory: ${process.cwd()}.
You have file and shell tools available. Be concise — your responses will be read in Telegram.`

const BOT_HELP = `🤖 *Mentis Bot Commands*

/help  — show this message
/reset — start a fresh conversation
/clear — same as /reset

*Scheduled tasks (cron):*
/schedule — list all tasks
/schedule add 1h your prompt here — add task
/schedule del <id> — delete task
/schedule on <id>  — enable task
/schedule off <id> — disable task

Just send a message to chat with the agent.
Send a photo to include an image in your message.`

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

async function sendMessage(token: string, chatId: number, text: string, replyToId?: number): Promise<void> {
  const MAX = 4000
  for (let i = 0; i < text.length; i += MAX) {
    const payload: Record<string, unknown> = {
      chat_id:    chatId,
      text:       text.slice(i, i + MAX),
      parse_mode: 'Markdown',
    }
    if (i === 0 && replyToId) payload.reply_to_message_id = replyToId
    await tgCall(token, 'sendMessage', payload)
  }
}

/** Download a Telegram file and return base64 data URL */
async function downloadPhoto(token: string, fileId: string): Promise<string | null> {
  try {
    const fileInfo = await tgCall(token, 'getFile', { file_id: fileId })
    const filePath = ((fileInfo.result as Record<string, unknown>)?.file_path as string) || ''
    if (!filePath) return null
    const url  = `${TG}/file/bot${token}/${filePath}`
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 })
    const b64  = Buffer.from(resp.data as ArrayBuffer).toString('base64')
    const mime = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
    return `data:${mime};base64,${b64}`
  } catch { return null }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── Channel state ─────────────────────────────────────────────────────────────

let _running  = false
let _stop     = false
let _username = ''
let _token    = ''

export function stopCliTelegramChannel()    { _stop = true }
export function isCliTelegramRunning()      { return _running }
export function getCliBotUsername()         { return _username }

// Persisted chat IDs so scheduled results reach users across restarts
const CHATS_PATH = path.join(os.homedir(), '.mentis', 'telegram_chats.json')

function loadChatIds(): Set<number> {
  try { return new Set(JSON.parse(fs.readFileSync(CHATS_PATH, 'utf-8'))) }
  catch { return new Set() }
}

function saveChatId(id: number): void {
  const ids = loadChatIds()
  if (ids.has(id)) return
  ids.add(id)
  try {
    if (!fs.existsSync(path.dirname(CHATS_PATH))) fs.mkdirSync(path.dirname(CHATS_PATH), { recursive: true })
    fs.writeFileSync(CHATS_PATH, JSON.stringify([...ids]))
  } catch {}
}

const _activeChatIds = new Set<number>()

/** Send a message to every chat that has ever talked to the bot */
export async function broadcastToActiveTelegramChats(text: string): Promise<void> {
  if (!_token) return
  const ids = _activeChatIds.size > 0 ? _activeChatIds : loadChatIds()
  for (const chatId of ids) {
    await sendMessage(_token, chatId, text).catch(() => {})
  }
}

// Per-chat conversation histories
const chatHistories = new Map<number, ChatMessage[]>()

// ── Build model client from CLI config ────────────────────────────────────────

function buildClient(): ModelClient {
  const config   = new ConfigManager().getConfig()
  const provider = config.defaultProvider || 'ollama'

  if (provider === 'anthropic') {
    const apiKey = config.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY || ''
    const model  = config.anthropic?.model  || 'claude-sonnet-4-6'
    return new AnthropicClient(apiKey, model)
  }

  let baseUrl: string
  let apiKey:  string
  let model:   string

  if (provider === 'gemini') {
    baseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/'
    apiKey  = config.gemini?.apiKey || ''
    model   = config.gemini?.model  || 'gemini-2.5-flash'
  } else if (provider === 'openai') {
    baseUrl = config.openai?.baseUrl || 'https://api.openai.com/v1'
    apiKey  = config.openai?.apiKey  || ''
    model   = config.openai?.model   || 'gpt-4o'
  } else if (provider === 'glm') {
    baseUrl = config.glm?.baseUrl || 'https://api.z.ai/api/coding/paas/v4/'
    apiKey  = config.glm?.apiKey  || ''
    model   = config.glm?.model   || 'glm-4.6'
  } else {
    // ollama / default
    const rawBase = config.ollama?.baseUrl || 'http://localhost:11434/v1'
    baseUrl = rawBase.replace(/\/$/, '').endsWith('/v1') ? rawBase.replace(/\/$/, '') : `${rawBase.replace(/\/$/, '')}/v1`
    apiKey  = 'ollama'
    model   = config.ollama?.model || 'llama3'
  }

  return new OpenAIClient(baseUrl, apiKey, model)
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
  client:   ModelClient,
  tools:    Tool[],
  history:  ChatMessage[],
  userMsg:  string,
  imageB64: string | null = null
): Promise<string> {
  // Build content — include image if provided
  let content: ChatMessage['content']
  if (imageB64) {
    content = [
      { type: 'image_url', image_url: { url: imageB64 } },
      { type: 'text',      text: userMsg || 'What is in this image?' },
    ] as unknown as ChatMessage['content']
  } else {
    content = userMsg
  }
  history.push({ role: 'user', content })

  const toolDefs: ToolDefinition[] = tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))

  const systemMessages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]
  let response = await client.chat([...systemMessages, ...history], toolDefs)

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

  const finalText = typeof response.content === 'string' ? response.content : '✓ Done'
  history.push({ role: 'assistant', content: finalText })
  return finalText
}

// ── Per-message handler ───────────────────────────────────────────────────────

const _busy = new Set<number>()

interface IncomingMsg {
  text:      string
  imageB64:  string | null
  messageId: number
  isGroup:   boolean
}

async function handleMessage(
  token:         string,
  chatId:        number,
  msg:           IncomingMsg,
  client:        ModelClient,
  tools:         Tool[],
  onAgentReply?: (reply: string, fromName: string) => void,
  fromName?:     string
): Promise<void> {
  if (_busy.has(chatId)) {
    await sendMessage(token, chatId, '⏳ Still working on previous message…')
    return
  }
  _busy.add(chatId)

  let stopped = false
  const typing = setInterval(() => {
    if (!stopped) tgCall(token, 'sendChatAction', { chat_id: chatId, action: 'typing' })
  }, 4000)
  tgCall(token, 'sendChatAction', { chat_id: chatId, action: 'typing' })

  if (!chatHistories.has(chatId)) chatHistories.set(chatId, [])
  const history = chatHistories.get(chatId)!

  const parts = msg.text.trim().split(/\s+/)
  const cmd   = parts[0].replace(`@${_username}`, '').toLowerCase()

  // ── Natural language scheduling ───────────────────────────────────────────────
  // Patterns: "remind me in 2 mins to X", "remind me in X to Y", "set a reminder in X to Y"
  // Also: "every 1h X", "every hour X" for recurring tasks
  const reminderMatch = msg.text.match(
    /^(?:remind\s+me|set\s+a?\s*reminder)\s+in\s+(.+?)\s+to\s+(.+)$/i
  )
  const recurringMatch = msg.text.match(
    /^every\s+(.+?)\s+(?:to\s+|:?\s*)(.+)$/i
  )

  if (reminderMatch || recurringMatch) {
    stopped = true; clearInterval(typing); _busy.delete(chatId)
    const isReminder = !!reminderMatch
    const rawInterval = isReminder ? reminderMatch![1] : recurringMatch![1]
    const prompt      = isReminder ? reminderMatch![2].trim() : recurringMatch![2].trim()
    const interval    = parseNaturalInterval(rawInterval)

    if (!interval) {
      await sendMessage(token, chatId, `⚠ Couldn't parse time from: _"${rawInterval}"_\nTry: "2 minutes", "1 hour", "30 seconds"`)
      return
    }

    const ms  = parseInterval(interval)!
    const now = Date.now()
    const task: ScheduledTask = {
      id:         now.toString(36),
      prompt,
      interval,
      intervalMs: ms,
      lastRun:    0,
      nextRun:    now + ms,
      enabled:    true,
      createdAt:  now,
      oneShot:    isReminder,
    }
    const all = loadTasks()
    all.push(task)
    saveTasks(all)

    const when = new Date(task.nextRun).toLocaleTimeString()
    if (isReminder) {
      await sendMessage(token, chatId, `⏰ Reminder set for *${when}* (in ${interval})\n_${prompt}_`, msg.messageId)
    } else {
      await sendMessage(token, chatId, `🔁 Recurring task every *${interval}*, starting ${when}\n_${prompt}_\nID: \`${task.id}\``, msg.messageId)
    }
    return
  }

  // ── /schedule command ────────────────────────────────────────────────────────
  if (cmd === '/schedule') {
    stopped = true; clearInterval(typing); _busy.delete(chatId)
    const sub = parts[1]?.toLowerCase()

    if (!sub || sub === 'list') {
      const tasks = loadTasks()
      if (tasks.length === 0) {
        await sendMessage(token, chatId, '📋 No scheduled tasks. Add one with:\n`/schedule add 1h your prompt`')
      } else {
        const lines = tasks.map(t => {
          const st  = t.enabled ? '✅' : '⏸'
          const nxt = t.enabled ? `next: ${new Date(t.nextRun).toLocaleString()}` : 'disabled'
          return `${st} \`${t.id}\` every *${t.interval}* — ${nxt}\n   _${t.prompt.slice(0, 60)}${t.prompt.length > 60 ? '…' : ''}_`
        })
        await sendMessage(token, chatId, `📋 *Scheduled Tasks*\n\n${lines.join('\n\n')}`)
      }
      return
    }

    if (sub === 'add') {
      // /schedule add <interval> <prompt…>
      const interval = parts[2]
      const prompt   = parts.slice(3).join(' ').trim()
      if (!interval || !prompt) {
        await sendMessage(token, chatId, '⚠ Usage: `/schedule add 1h your prompt here`')
        return
      }
      const ms = parseInterval(interval)
      if (!ms) {
        await sendMessage(token, chatId, '⚠ Invalid interval. Use: `30s`, `5m`, `2h`, `1d`')
        return
      }
      const now  = Date.now()
      const task: ScheduledTask = {
        id:         Date.now().toString(36),
        prompt,
        interval,
        intervalMs: ms,
        lastRun:    0,
        nextRun:    now + ms,
        enabled:    true,
        createdAt:  now,
      }
      const all = loadTasks()
      all.push(task)
      saveTasks(all)
      await sendMessage(token, chatId, `✅ Task \`${task.id}\` added — runs every *${interval}*\nFirst run: ${new Date(task.nextRun).toLocaleString()}`)
      return
    }

    if (sub === 'del' || sub === 'delete') {
      const id  = parts[2]
      if (!id) { await sendMessage(token, chatId, '⚠ Usage: `/schedule del <id>`'); return }
      const all = loadTasks()
      if (!all.find(t => t.id === id)) { await sendMessage(token, chatId, `⚠ Task \`${id}\` not found.`); return }
      saveTasks(all.filter(t => t.id !== id))
      await sendMessage(token, chatId, `🗑 Task \`${id}\` deleted.`)
      return
    }

    if (sub === 'on' || sub === 'off') {
      const id  = parts[2]
      if (!id) { await sendMessage(token, chatId, `⚠ Usage: \`/schedule ${sub} <id>\``); return }
      const all  = loadTasks()
      const task = all.find(t => t.id === id)
      if (!task) { await sendMessage(token, chatId, `⚠ Task \`${id}\` not found.`); return }
      task.enabled = sub === 'on'
      if (task.enabled) task.nextRun = Date.now() + task.intervalMs
      saveTasks(all)
      await sendMessage(token, chatId, task.enabled ? `✅ Task \`${id}\` enabled.` : `⏸ Task \`${id}\` disabled.`)
      return
    }

    await sendMessage(token, chatId, '⚠ Unknown sub-command. Try `/schedule`, `/schedule add`, `/schedule del`, `/schedule on/off`')
    return
  }

  // Bot commands
  if (cmd === '/clear' || cmd === '/reset') {
    chatHistories.set(chatId, [])
    stopped = true; clearInterval(typing); _busy.delete(chatId)
    await sendMessage(token, chatId, '🧹 Conversation reset. Start fresh!', msg.messageId)
    return
  }
  if (cmd === '/help' || cmd === '/start') {
    stopped = true; clearInterval(typing); _busy.delete(chatId)
    await sendMessage(token, chatId, BOT_HELP, msg.messageId)
    return
  }

  try {
    const reply = await runAgent(client, tools, history, msg.text, msg.imageB64)
    stopped = true; clearInterval(typing)
    await sendMessage(token, chatId, reply, msg.isGroup ? msg.messageId : undefined)
    onAgentReply?.(reply, fromName || 'Bot')
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
  onUserMessage?: (text: string, fromName: string) => void,
  onAgentReply?:  (reply: string, fromName: string) => void
): Promise<void> {
  if (_running) { stopCliTelegramChannel(); await sleep(500) }

  const cfg   = new ConfigManager().getConfig()
  const tg    = cfg.telegram || {}
  const token = (tg.botToken || '').trim()
  if (!token) return

  _stop     = false
  _running  = false
  _username = ''
  _token    = token
  _activeChatIds.clear()
  // Seed from disk so reminders fire even if no message arrived this session
  for (const id of loadChatIds()) _activeChatIds.add(id)
  // Also seed from allowedChatIds config (known authorized users)
  for (const id of allowedChatIds) _activeChatIds.add(id)

  const me = await tgCall(token, 'getMe')
  if (!me.ok) { console.error('[telegram] Invalid bot token'); return }
  _username = ((me.result as Record<string, unknown>)?.username as string) || ''
  _running  = true
  console.log(`[telegram] Bot @${_username} connected`)

  const client = buildClient()
  let currentAutoApprove = autoApprove
  let tools = buildTools(currentAutoApprove)
  let offset = 0

  while (!_stop) {
    // Re-read autoApprove from config each poll cycle so changes take effect without restart
    const freshAutoApprove = Boolean(new ConfigManager().getConfig().telegram?.autoApprove)
    if (freshAutoApprove !== currentAutoApprove) {
      currentAutoApprove = freshAutoApprove
      tools = buildTools(currentAutoApprove)
    }

    try {
      const result = await tgCall(
        token, 'getUpdates',
        { timeout: 25, offset, allowed_updates: ['message'] },
        30_000
      )

      if (!result?.ok) { await sleep(3000); continue }

      type TgPhoto = { file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }
      type TgUpdate = {
        update_id: number
        message?: {
          message_id: number
          chat: { id: number; type: string }
          from: { id: number; first_name: string; username?: string }
          text?: string
          caption?: string
          photo?: TgPhoto[]
          reply_to_message?: { from?: { is_bot?: boolean } }
        }
      }

      for (const update of (result.result ?? []) as TgUpdate[]) {
        offset = update.update_id + 1
        const m = update.message
        if (!m) continue

        // Must have text or photo
        if (!m.text && !m.photo && !m.caption) continue

        const chatId  = m.chat.id
        const isGroup = m.chat.type === 'group' || m.chat.type === 'supergroup'
        _activeChatIds.add(chatId)
        saveChatId(chatId)

        // In groups, only respond when mentioned or replied to
        if (isGroup) {
          const mentionedByName = (m.text || m.caption || '').includes(`@${_username}`)
          const repliedToBot    = m.reply_to_message?.from?.is_bot === true
          if (!mentionedByName && !repliedToBot) continue
        }

        if (allowedChatIds.length > 0 && !allowedChatIds.includes(chatId)) {
          await sendMessage(token, chatId, '⛔ Not authorised.')
          continue
        }

        // Strip @mention from text for groups
        const rawText = (m.text || m.caption || '').replace(new RegExp(`@${_username}`, 'gi'), '').trim()

        // Download photo if present (use largest size)
        let imageB64: string | null = null
        if (m.photo && m.photo.length > 0) {
          const largest = m.photo.reduce((a, b) => (b.file_size || 0) > (a.file_size || 0) ? b : a)
          imageB64 = await downloadPhoto(token, largest.file_id)
        }

        const fromName = m.from.username ? `@${m.from.username}` : m.from.first_name
        const displayText = rawText || (imageB64 ? '[image]' : '')
        onUserMessage?.(displayText, fromName)

        handleMessage(
          token, chatId,
          { text: rawText, imageB64, messageId: m.message_id, isGroup },
          client, tools, onAgentReply, fromName
        ).catch(() => {})
      }
    } catch {
      if (!_stop) await sleep(5000)
    }
  }

  _running = false
  console.log('[telegram] Bot disconnected')
}
