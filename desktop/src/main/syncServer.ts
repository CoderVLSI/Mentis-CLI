/**
 * Mentis Sync Server — HTTP API that lets the mobile app control the desktop engine.
 * Runs on port 3747 (configurable). Uses SSE for streaming chat responses.
 *
 * Endpoints:
 *   GET  /health
 *   GET  /config
 *   GET  /sessions
 *   POST /sessions
 *   GET  /sessions/:id
 *   DELETE /sessions/:id
 *   PUT  /sessions/:id/title
 *   POST /chat           — SSE stream
 *   POST /approve/:id    — approve/deny a tool call
 *   POST /mode           — set PLAN | BUILD mode
 */

import http from 'http'
import { URL } from 'url'
import { HeadlessEngine, loadConfig } from './engine'

const DEFAULT_PORT = 3747

// Generate a random 6-char alphanumeric pairing token once per server start
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
let _syncToken = Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')
export function getSyncToken() { return _syncToken }

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(data))
}

function cors(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function authorized(req: http.IncomingMessage): boolean {
  const header = req.headers['authorization'] ?? ''
  return header === `Bearer ${_syncToken}`
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = ''
    req.on('data', chunk => { buf += chunk.toString() })
    req.on('end',  () => resolve(buf))
    req.on('error', reject)
  })
}

export function startSyncServer(engine: HeadlessEngine, port = DEFAULT_PORT): http.Server {
  const server = http.createServer(async (req, res) => {
    cors(res)

    if (req.method === 'OPTIONS') {
      res.writeHead(204); res.end(); return
    }

    const url      = new URL(req.url || '/', `http://localhost:${port}`)
    const pathname = url.pathname
    const method   = req.method || 'GET'

    try {
      // ── Health (public — no auth required) ─────────────────────────────────
      if (pathname === '/health' && method === 'GET') {
        json(res, { ok: true, version: '1.0', app: 'Mentis Desktop' })
        return
      }

      // ── Auth gate — all other endpoints require the pairing token ───────────
      if (!authorized(req)) {
        json(res, { error: 'Unauthorized — wrong or missing pairing token' }, 401)
        return
      }

      // ── Config (no sensitive keys) ──────────────────────────────────────────
      if (pathname === '/config' && method === 'GET') {
        const cfg      = loadConfig()
        const provider = (cfg.defaultProvider as string) || 'ollama'
        const p        = (cfg[provider] as Record<string, string>) || {}
        json(res, { provider, model: p.model || 'llama3', mode: engine.getMode() })
        return
      }

      // ── Mode ────────────────────────────────────────────────────────────────
      if (pathname === '/mode' && method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { mode: 'PLAN' | 'BUILD' }
        if (body.mode === 'PLAN' || body.mode === 'BUILD') engine.setMode(body.mode)
        json(res, { ok: true, mode: engine.getMode() })
        return
      }

      // ── Sessions list ───────────────────────────────────────────────────────
      if (pathname === '/sessions' && method === 'GET') {
        json(res, engine.listSessions())
        return
      }

      // ── New session ─────────────────────────────────────────────────────────
      if (pathname === '/sessions' && method === 'POST') {
        const id = engine.createSession()
        json(res, { id })
        return
      }

      // ── Session history / delete ────────────────────────────────────────────
      const sessMatch = pathname.match(/^\/sessions\/([^/]+)$/)
      if (sessMatch) {
        const id = sessMatch[1]

        if (method === 'GET') {
          engine.loadSession(id)
          json(res, engine.getHistory())
          return
        }

        if (method === 'DELETE') {
          engine.deleteSession(id)
          json(res, { ok: true })
          return
        }
      }

      // ── Rename session ──────────────────────────────────────────────────────
      const renameMatch = pathname.match(/^\/sessions\/([^/]+)\/title$/)
      if (renameMatch && method === 'PUT') {
        const id   = renameMatch[1]
        const body = JSON.parse(await readBody(req)) as { title: string }
        engine.renameSession(id, body.title)
        json(res, { ok: true })
        return
      }

      // ── Approve / deny a pending tool call ──────────────────────────────────
      const approveMatch = pathname.match(/^\/approve\/([^/]+)$/)
      if (approveMatch && method === 'POST') {
        const id   = approveMatch[1]
        const body = JSON.parse(await readBody(req)) as { approved: boolean }
        engine.resolveApproval(id, body.approved)
        json(res, { ok: true })
        return
      }

      // ── Chat (SSE streaming) ────────────────────────────────────────────────
      if (pathname === '/chat' && method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { message: string; sessionId: string | null }
        const { message, sessionId } = body

        if (sessionId) engine.loadSession(sessionId)

        // SSE headers
        res.writeHead(200, {
          'Content-Type':                'text/event-stream',
          'Cache-Control':               'no-cache',
          'Connection':                  'keep-alive',
          'Access-Control-Allow-Origin': '*',
        })

        const send = (data: unknown) => {
          try { res.write(`data: ${JSON.stringify(data)}\n\n`) } catch {}
        }

        // ── All engine events forwarded to mobile via SSE ──────────────────
        const listeners: Array<{ event: string; fn: (d: unknown) => void }> = []

        const addListener = (event: string, fn: (d: unknown) => void) => {
          engine.on(event as Parameters<typeof engine.on>[0], fn as Parameters<typeof engine.on>[1])
          listeners.push({ event, fn })
        }

        const cleanup = () => {
          for (const { event, fn } of listeners) {
            engine.off(event as Parameters<typeof engine.off>[0], fn as Parameters<typeof engine.off>[1])
          }
        }

        addListener('thinking',        () => send({ type: 'thinking' }))
        addListener('message_chunk',   (d) => { const { text } = d as { text: string }; send({ type: 'chunk', text }) })
        addListener('tool_summary',    (d) => { const { names, count } = d as { names: string[]; count: number }; send({ type: 'tool_summary', names, count }) })
        addListener('tool_start',      (d) => { const { id, name, args } = d as { id: string; name: string; args: Record<string, unknown> }; send({ type: 'tool_start', id, name, args }) })
        addListener('tool_result',     (d) => { const { id, name, result } = d as { id: string; name: string; result: string }; send({ type: 'tool_result', id, name, result }) })
        addListener('approval_needed', (d) => { const { id, name, args } = d as { id: string; name: string; args: Record<string, unknown> }; send({ type: 'approval_needed', id, name, args }) })
        addListener('approval_done',   (d) => { const { id, approved } = d as { id: string; approved: boolean }; send({ type: 'approval_done', id, approved }) })
        addListener('error',           (d) => { const { message: msg } = d as { message: string }; send({ type: 'error', message: msg }); res.end(); cleanup() })
        addListener('message_end',     () => { send({ type: 'done' }); res.end(); cleanup() })

        engine.chat(message)

        req.on('close', () => {
          engine.cancel()
          cleanup()
        })

        return
      }

      json(res, { error: 'Not found' }, 404)
    } catch (err) {
      json(res, { error: String(err) }, 500)
    }
  })

  server.listen(port, '0.0.0.0', () => {
    console.log(`[Mentis Sync] Listening on port ${port}`)
  })

  return server
}
