/**
 * mentisClient — talks to the Mentis desktop sync server (HTTP :3747).
 * All methods are no-op safe when the server is unreachable.
 */

import { Session, Message } from '../store'

export function buildBase(host: string) {
  const h = host.startsWith('http') ? host : `http://${host}`
  return h.replace(/\/$/, '')
}

export async function checkHealth(host: string): Promise<boolean> {
  try {
    const r = await fetch(`${buildBase(host)}/health`, { signal: AbortSignal.timeout(3000) })
    return r.ok
  } catch { return false }
}

export async function listSessions(host: string): Promise<Session[]> {
  const r = await fetch(`${buildBase(host)}/sessions`)
  if (!r.ok) throw new Error('Failed to list sessions')
  return r.json()
}

export async function getHistory(host: string, sessionId: string): Promise<Message[]> {
  const r = await fetch(`${buildBase(host)}/sessions/${sessionId}`)
  if (!r.ok) throw new Error('Failed to get history')
  const raw: Array<{ role: string; content: string }> = await r.json()
  return raw
    .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content)
    .map((m, i) => ({ id: `h${i}`, role: m.role as 'user' | 'assistant', content: m.content, timestamp: Date.now() }))
}

export async function newSession(host: string): Promise<{ id: string }> {
  const r = await fetch(`${buildBase(host)}/sessions`, { method: 'POST' })
  if (!r.ok) throw new Error('Failed to create session')
  return r.json()
}

export async function deleteSession(host: string, id: string): Promise<void> {
  await fetch(`${buildBase(host)}/sessions/${id}`, { method: 'DELETE' })
}

export async function renameSession(host: string, id: string, title: string): Promise<void> {
  await fetch(`${buildBase(host)}/sessions/${id}/title`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

/** Approve or deny a pending tool call on the desktop engine */
export async function approveAction(host: string, id: string, approved: boolean): Promise<void> {
  try {
    await fetch(`${buildBase(host)}/approve/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved }),
    })
  } catch { /* fire-and-forget: engine will time out if phone disconnects */ }
}

/** Sync PLAN / BUILD mode to the desktop engine */
export async function setDesktopMode(host: string, mode: 'PLAN' | 'BUILD'): Promise<void> {
  try {
    await fetch(`${buildBase(host)}/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    })
  } catch {}
}

/**
 * Stream a chat message from the desktop sync server.
 * The callback receives typed events for all engine activity, not just text chunks.
 */
export type SyncEvent =
  | { type: 'thinking' }
  | { type: 'chunk';            text: string }
  | { type: 'tool_summary';     names: string[]; count: number }
  | { type: 'tool_start';       id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result';      id: string; name: string; result: string }
  | { type: 'approval_needed';  id: string; name: string; args: Record<string, unknown> }
  | { type: 'approval_done';    id: string; approved: boolean }
  | { type: 'done' }
  | { type: 'error';            message: string }

export async function streamChat(
  host: string,
  message: string,
  sessionId: string | null,
  onEvent: (evt: SyncEvent) => void,
): Promise<void> {
  try {
    const r = await fetch(`${buildBase(host)}/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message, sessionId }),
    })

    if (!r.ok || !r.body) { onEvent({ type: 'error', message: `Server error ${r.status}` }); return }

    const reader  = r.body.getReader()
    const decoder = new TextDecoder()
    let   buf     = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const evt = JSON.parse(line.slice(6)) as SyncEvent
          onEvent(evt)
          if (evt.type === 'done' || evt.type === 'error') return
        } catch { /* partial JSON, skip */ }
      }
    }
    onEvent({ type: 'done' })
  } catch (err) {
    onEvent({ type: 'error', message: String(err) })
  }
}

/** Get current model/provider/mode config from the desktop (no keys exposed) */
export async function getDesktopConfig(host: string): Promise<{ provider: string; model: string; mode: string } | null> {
  try {
    const r = await fetch(`${buildBase(host)}/config`)
    if (!r.ok) return null
    return r.json()
  } catch { return null }
}
