/**
 * WebhookServer — lightweight HTTP server that accepts POST /run requests
 * to trigger agent prompts programmatically.
 *
 * Request body (JSON):
 *   { "prompt": "string", "token": "optional-secret" }
 *
 * Responses:
 *   202 Accepted  — prompt queued
 *   400 Bad Request — missing prompt
 *   401 Unauthorized — invalid token
 *   405 Method Not Allowed
 *
 * Config: ~/.mentis/webhook.json
 *   { "port": 3748, "token": "secret", "enabled": true }
 */

import * as http from 'http'
import * as fs   from 'fs'
import * as path from 'path'
import * as os   from 'os'

const CONFIG_PATH = path.join(os.homedir(), '.mentis', 'webhook.json')

export interface WebhookConfig {
  port:    number
  token:   string   // empty = no auth required
  enabled: boolean
}

const DEFAULTS: WebhookConfig = { port: 3748, token: '', enabled: false }

export function loadWebhookConfig(): WebhookConfig {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) } }
  catch { return { ...DEFAULTS } }
}

export function saveWebhookConfig(cfg: WebhookConfig): void {
  const dir = path.dirname(CONFIG_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
}

export class WebhookServer {
  private server: http.Server | null = null
  private onPrompt: (prompt: string, source: string) => Promise<void>

  constructor(onPrompt: (prompt: string, source: string) => Promise<void>) {
    this.onPrompt = onPrompt
  }

  start(cfg: WebhookConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) { resolve(); return }

      this.server = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end(JSON.stringify({ error: 'Method Not Allowed' }))
          return
        }

        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', async () => {
          let parsed: Record<string, unknown>
          try { parsed = JSON.parse(body) } catch {
            res.writeHead(400)
            res.end(JSON.stringify({ error: 'Invalid JSON' }))
            return
          }

          if (cfg.token && parsed.token !== cfg.token) {
            res.writeHead(401)
            res.end(JSON.stringify({ error: 'Unauthorized' }))
            return
          }

          const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : ''
          if (!prompt) {
            res.writeHead(400)
            res.end(JSON.stringify({ error: 'Missing prompt' }))
            return
          }

          res.writeHead(202)
          res.end(JSON.stringify({ status: 'queued' }))

          const source = typeof parsed.source === 'string' ? parsed.source : 'webhook'
          try { await this.onPrompt(prompt, source) } catch {}
        })
      })

      this.server.once('error', reject)
      this.server.listen(cfg.port, '127.0.0.1', () => resolve())
    })
  }

  stop(): void {
    if (this.server) { this.server.close(); this.server = null }
  }

  isRunning(): boolean { return !!this.server }

  port(): number | null {
    const addr = this.server?.address()
    return addr && typeof addr === 'object' ? addr.port : null
  }
}
