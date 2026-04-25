/**
 * Mentis Sync Server — HTTP API that lets the mobile app control the desktop engine.
 * Runs on port 3747 (configurable). Uses SSE for streaming chat responses.
 */

import http from 'http'
import { URL } from 'url'
import { HeadlessEngine, loadConfig } from './engine'

const DEFAULT_PORT = 3747

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(data))
}

function cors(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
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
      // ── Health ──────────────────────────────────────────────────────────────
      if (pathname === '/health' && method === 'GET') {
        json(res, { ok: true, version: '1.0', app: 'Mentis Desktop' })
        return
      }

      // ── Config (no sensitive keys) ──────────────────────────────────────────
      if (pathname === '/config' && method === 'GET') {
        const cfg      = loadConfig()
        const provider = (cfg.defaultProvider as string) || 'ollama'
        const p        = (cfg[provider] as Record<string, string>) || {}
        json(res, { provider, model: p.model || 'llama3' })
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

      // ── Session history ─────────────────────────────────────────────────────
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

      // ── Chat (SSE streaming) ────────────────────────────────────────────────
      if (pathname === '/chat' && method === 'POST') {
        const body      = JSON.parse(await readBody(req)) as { message: string; sessionId: string | null }
        const { message, sessionId } = body

        if (sessionId) engine.loadSession(sessionId)

        // SSE headers
        res.writeHead(200, {
          'Content-Type':                'text/event-stream',
          'Cache-Control':               'no-cache',
          'Connection':                  'keep-alive',
          'Access-Control-Allow-Origin': '*',
        })

        const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`)

        const onChunk = (data: unknown) => {
          const { text } = data as { text: string }
          send({ type: 'chunk', text })
        }
        const onEnd = () => {
          send({ type: 'done' })
          res.end()
          engine.off('message_chunk', onChunk)
          engine.off('message_end',   onEnd)
          engine.off('error',         onErr)
        }
        const onErr = (data: unknown) => {
          const { message: msg } = data as { message: string }
          send({ type: 'error', message: msg })
          res.end()
          engine.off('message_chunk', onChunk)
          engine.off('message_end',   onEnd)
          engine.off('error',         onErr)
        }

        engine.on('message_chunk', onChunk)
        engine.on('message_end',   onEnd)
        engine.on('error',         onErr)
        engine.chat(message)

        req.on('close', () => {
          engine.cancel()
          engine.off('message_chunk', onChunk)
          engine.off('message_end',   onEnd)
          engine.off('error',         onErr)
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
