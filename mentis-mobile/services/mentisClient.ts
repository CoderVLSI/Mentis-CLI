/**
 * mentisClient — talks to the Mentis desktop sync server (HTTP :3747).
 * All methods are no-op safe when the server is unreachable.
 */

import { Session, Message } from '../store'

export function buildBase(host: string) {
  const h = host.startsWith('http') ? host : `http://${host}`
  return h.replace(/\/$/, '')
}

function auth(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function checkHealth(host: string): Promise<boolean> {
  try {
    const r = await fetch(`${buildBase(host)}/health`, { signal: AbortSignal.timeout(3000) })
    return r.ok
  } catch { return false }
}

export async function listSessions(host: string, token?: string): Promise<Session[]> {
  const r = await fetch(`${buildBase(host)}/sessions`, { headers: auth(token) })
  if (!r.ok) throw new Error('Failed to list sessions')
  return r.json()
}

export async function getHistory(host: string, sessionId: string, token?: string): Promise<Message[]> {
  const r = await fetch(`${buildBase(host)}/sessions/${sessionId}`, { headers: auth(token) })
  if (!r.ok) throw new Error('Failed to get history')
  const raw: Array<{ role: string; content: string }> = await r.json()
  return raw
    .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content)
    .map((m, i) => ({ id: `h${i}`, role: m.role as 'user' | 'assistant', content: m.content, timestamp: Date.now() }))
}

export async function newSession(host: string, token?: string): Promise<{ id: string }> {
  const r = await fetch(`${buildBase(host)}/sessions`, { method: 'POST', headers: auth(token) })
  if (!r.ok) throw new Error('Failed to create session')
  return r.json()
}

export async function deleteSession(host: string, id: string, token?: string): Promise<void> {
  await fetch(`${buildBase(host)}/sessions/${id}`, { method: 'DELETE', headers: auth(token) })
}

export async function renameSession(host: string, id: string, title: string, token?: string): Promise<void> {
  await fetch(`${buildBase(host)}/sessions/${id}/title`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...auth(token) },
    body: JSON.stringify({ title }),
  })
}

export async function approveAction(host: string, id: string, approved: boolean, token?: string): Promise<void> {
  try {
    await fetch(`${buildBase(host)}/approve/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(token) },
      body: JSON.stringify({ approved }),
    })
  } catch { /* fire-and-forget */ }
}

export async function setDesktopMode(host: string, mode: 'PLAN' | 'BUILD', token?: string): Promise<void> {
  try {
    await fetch(`${buildBase(host)}/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(token) },
      body: JSON.stringify({ mode }),
    })
  } catch {}
}

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
  token?: string,
): Promise<void> {
  try {
    const r = await fetch(`${buildBase(host)}/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...auth(token) },
      body:    JSON.stringify({ message, sessionId }),
    })

    if (!r.ok || !r.body) {
      onEvent({ type: 'error', message: r.status === 401 ? 'Wrong pairing token — check Settings' : `Server error ${r.status}` })
      return
    }

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
        } catch { /* partial JSON */ }
      }
    }
    onEvent({ type: 'done' })
  } catch (err) {
    onEvent({ type: 'error', message: String(err) })
  }
}

export async function getDesktopConfig(host: string, token?: string): Promise<{ provider: string; model: string; mode: string } | null> {
  try {
    const r = await fetch(`${buildBase(host)}/config`, { headers: auth(token) })
    if (!r.ok) return null
    return r.json()
  } catch { return null }
}
