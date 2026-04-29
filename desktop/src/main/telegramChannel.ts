/**
 * Telegram channel — long-polls the Telegram Bot API and bridges messages
 * to the Mentis engine. Fully bidirectional:
 *   Telegram → Desktop: onUserMessage callback adds message to desktop feed
 *   Desktop  → Telegram: engine responses forwarded to all active Telegram chats
 */

import axios from 'axios'
import { HeadlessEngine } from './engine'

const TG = 'https://api.telegram.org'

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

// Tracks chatIds that have ever sent a message — desktop replies are forwarded here
const _activeChatIds = new Set<number>()

// True while engine is processing a Telegram-originated message (avoids double-send)
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
  onUserMessage?: (text: string, fromName: string) => void
): Promise<void> {
  if (_running) { stopTelegramChannel(); await sleep(500) }
  _stop     = false
  _running  = false
  _username = ''
  _activeChatIds.clear()

  // Verify the token and get bot info
  const me = await tgCall(token, 'getMe')
  if (!me.ok) throw new Error('Invalid bot token — check Settings → Channels')
  _username = ((me.result as Record<string, unknown>)?.username as string) || ''
  _running  = true

  // ── Desktop → Telegram forwarding ─────────────────────────────────────────
  // When the desktop user sends a message, forward the agent's response to
  // all active Telegram chats (those that have previously sent a message).

  let _pendingResponse = ''

  const onChunkForward  = (d: { text: string })    => { _pendingResponse += d.text }
  const onStartForward  = ()                        => { _pendingResponse = '' }
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
        token,
        'getUpdates',
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

        // Allowlist check
        if (allowedChatIds.length > 0 && !allowedChatIds.includes(chatId)) {
          await sendMessage(token, chatId, '⛔ You are not authorised to use this bot.')
          continue
        }

        // Busy check
        if (engine.isChatting()) {
          await sendMessage(token, chatId, '⏳ Agent is busy — try again in a moment.')
          continue
        }

        // Register this chat as active so desktop replies get forwarded here
        _activeChatIds.add(chatId)

        // Notify desktop UI so the message appears in the chat feed
        const fromName = msg.from.username ? `@${msg.from.username}` : msg.from.first_name
        onUserMessage?.(msg.text, fromName)

        // Handle async so polling loop doesn't block
        handleMessage(engine, token, chatId, msg.text, autoApprove).catch(() => {})
      }
    } catch {
      if (!_stop) await sleep(5000)
    }
  }

  // Clean up engine listeners
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

  engine.on('message_chunk',    onChunk)
  engine.on('approval_needed',  onApproval)
  engine.on('error',            onError)

  try {
    await new Promise<void>((resolve) => {
      const onDone = () => { engine.off('session_update', onDone); resolve() }
      engine.on('session_update', onDone)
      engine.chat(text)
    })
  } finally {
    stopped = true
    clearInterval(typing)
    engine.off('message_chunk',   onChunk)
    engine.off('approval_needed', onApproval)
    engine.off('error',           onError)
    _processingTelegram = false
  }

  await sendMessage(token, chatId, response.trim() || '✓ Done')
}
