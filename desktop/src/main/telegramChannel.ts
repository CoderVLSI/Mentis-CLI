/**
 * Telegram channel — long-polls the Telegram Bot API and bridges messages
 * to the Mentis engine. Fully bidirectional:
 *   Telegram → Desktop: onUserMessage callback adds message to desktop feed
 *   Desktop  → Telegram: engine responses forwarded to all active Telegram chats
 *
 * Features: /reset, /help, image support (base64), group chat (@mention/reply)
 */

import axios from 'axios'
import { HeadlessEngine } from './engine'

const TG = 'https://api.telegram.org'

const BOT_HELP = `🤖 *Mentis Bot Commands*

/help  — show this message
/reset — start a fresh conversation
/clear — same as /reset

Send a message or photo to chat with the agent.
In groups, mention @botname or reply to the bot.`

// ── Helpers ───────────────────────────────────────────────────────────────────

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

const _activeChatIds    = new Set<number>()
let _processingTelegram = false

export function stopTelegramChannel()      { _stop = true }
export function isTelegramRunning()        { return _running }
export function getTelegramBotUsername()   { return _username }

// ── Main polling loop ─────────────────────────────────────────────────────────

export async function startTelegramChannel(
  engine:         HeadlessEngine,
  token:          string,
  allowedChatIds: number[],
  autoApprove:    boolean,
  onUserMessage?: (text: string, fromName: string, imageB64?: string) => void
): Promise<void> {
  if (_running) { stopTelegramChannel(); await sleep(500) }
  _stop     = false
  _running  = false
  _username = ''
  _activeChatIds.clear()

  const me = await tgCall(token, 'getMe')
  if (!me.ok) throw new Error('Invalid bot token — check Settings → Channels')
  _username = ((me.result as Record<string, unknown>)?.username as string) || ''
  _running  = true

  // ── Desktop → Telegram forwarding ─────────────────────────────────────────
  let _pendingResponse = ''
  const onChunkForward  = (d: { text: string }) => { _pendingResponse += d.text }
  const onStartForward  = ()                     => { _pendingResponse = '' }
  const onSessionUpdate = () => {
    if (!_processingTelegram && _pendingResponse.trim() && _activeChatIds.size > 0) {
      const text = _pendingResponse.trim()
      _pendingResponse = ''
      for (const chatId of _activeChatIds) {
        sendMessage(token, chatId, text).catch(() => {})
      }
    } else {
      _pendingResponse = ''
    }
  }
  engine.on('message_start',  onStartForward)
  engine.on('message_chunk',  onChunkForward)
  engine.on('session_update', onSessionUpdate)

  let offset = 0

  while (!_stop) {
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
        if (!m.text && !m.photo && !m.caption) continue

        const chatId  = m.chat.id
        const isGroup = m.chat.type === 'group' || m.chat.type === 'supergroup'

        // In groups: only respond when @mentioned or replied to
        if (isGroup) {
          const mentioned   = (m.text || m.caption || '').includes(`@${_username}`)
          const repliedToBot = m.reply_to_message?.from?.is_bot === true
          if (!mentioned && !repliedToBot) continue
        }

        if (allowedChatIds.length > 0 && !allowedChatIds.includes(chatId)) {
          await sendMessage(token, chatId, '⛔ You are not authorised to use this bot.')
          continue
        }

        const rawText  = (m.text || m.caption || '').replace(new RegExp(`@${_username}`, 'gi'), '').trim()
        const cmd      = rawText.split(' ')[0].toLowerCase()

        // /reset and /help handled without touching the engine
        if (cmd === '/reset' || cmd === '/clear') {
          await sendMessage(token, chatId, '🧹 Conversation reset. Start fresh!', m.message_id)
          continue
        }
        if (cmd === '/help' || cmd === '/start') {
          await sendMessage(token, chatId, BOT_HELP, m.message_id)
          continue
        }

        if (engine.isChatting()) {
          await sendMessage(token, chatId, '⏳ Agent is busy — try again in a moment.')
          continue
        }

        // Download photo if present
        let imageB64: string | null = null
        if (m.photo && m.photo.length > 0) {
          const largest = m.photo.reduce((a, b) => (b.file_size || 0) > (a.file_size || 0) ? b : a)
          imageB64 = await downloadPhoto(token, largest.file_id)
        }

        _activeChatIds.add(chatId)

        const fromName    = m.from.username ? `@${m.from.username}` : m.from.first_name
        const displayText = rawText || (imageB64 ? '[image]' : '')
        onUserMessage?.(displayText, fromName, imageB64 || undefined)

        handleMessage(engine, token, chatId, rawText, imageB64, isGroup, m.message_id, autoApprove).catch(() => {})
      }
    } catch {
      if (!_stop) await sleep(5000)
    }
  }

  engine.off('message_start',  onStartForward)
  engine.off('message_chunk',  onChunkForward)
  engine.off('session_update', onSessionUpdate)

  _running = false
}

// ── Message handler ───────────────────────────────────────────────────────────

async function handleMessage(
  engine:      HeadlessEngine,
  token:       string,
  chatId:      number,
  text:        string,
  imageB64:    string | null,
  isGroup:     boolean,
  messageId:   number,
  autoApprove: boolean
): Promise<void> {
  _processingTelegram = true

  let stopped = false
  const typing = setInterval(() => {
    if (!stopped) tgCall(token, 'sendChatAction', { chat_id: chatId, action: 'typing' })
  }, 4000)
  tgCall(token, 'sendChatAction', { chat_id: chatId, action: 'typing' })

  let response = ''
  const onChunk    = (d: { text: string })    => { response += d.text }
  const onApproval = (d: { id: string })      => { engine.resolveApproval(d.id, autoApprove) }
  const onError    = (d: { message: string }) => { response = `⚠ ${d.message}` }

  engine.on('message_chunk',   onChunk)
  engine.on('approval_needed', onApproval)
  engine.on('error',           onError)

  try {
    await new Promise<void>((resolve) => {
      const onDone = () => { engine.off('session_update', onDone); resolve() }
      engine.on('session_update', onDone)
      // Pass image as part of the prompt if present
      const prompt = imageB64
        ? `[Image attached]\n${text || 'What is in this image?'}`
        : text
      engine.chat(prompt)
    })
  } finally {
    stopped = true
    clearInterval(typing)
    engine.off('message_chunk',   onChunk)
    engine.off('approval_needed', onApproval)
    engine.off('error',           onError)
    _processingTelegram = false
  }

  await sendMessage(token, chatId, response.trim() || '✓ Done', isGroup ? messageId : undefined)
}
