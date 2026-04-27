/**
 * Standalone engine — runs a tool-use loop on the phone.
 * GitHub tools are backed by the GitHub REST API (no desktop required).
 * Supports Anthropic native format + all OpenAI-compatible providers.
 */

import {
  listFiles, readFile, writeFile, getFileSha, searchCode,
} from './githubClient'
import { streamOpenRouterChat } from './anthropicClient'

// ── Types ────────────────────────────────────────────────────────────────────

export type EngineEvent =
  | { type: 'thinking' }
  | { type: 'chunk';            text: string }
  | { type: 'tool_start';       id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result';      id: string; name: string; result: string }
  | { type: 'approval_needed';  id: string; name: string; args: Record<string, unknown> }
  | { type: 'approval_done';    id: string; approved: boolean }
  | { type: 'done' }
  | { type: 'error';            message: string }

export interface StandaloneConfig {
  provider:      string
  // All API keys — engine picks the right one
  anthropicKey:  string
  openaiKey:     string
  geminiKey:     string
  grokKey:       string
  kimiKey:       string
  glmKey:        string
  openrouterKey: string
  ollamaUrl:     string
  model:         string
  githubToken:   string
  githubRepo:    string
  githubBranch:  string
}

export interface ImageAttachment {
  base64:    string
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  name:      string
}

type ContentBlock =
  | { type: 'text';  text: string }
  | { type: 'image'; mediaType: string; data: string }

type SimpleMsg = { role: 'user' | 'assistant'; content: string | ContentBlock[] }

// Anthropic-format internal types (used only for the Anthropic provider path)
type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }
type AnthropicMsg = { role: 'user' | 'assistant'; content: string | AnthropicBlock[] }

// OpenAI-format internal types (used for all other providers)
type OAIToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }
type OAIMsg =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OAIToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string }

// ── Provider routing ──────────────────────────────────────────────────────────

function getRoute(cfg: StandaloneConfig): { url: string; headers: Record<string, string> } {
  switch (cfg.provider) {
    case 'openai':
      return {
        url:     'https://api.openai.com/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.openaiKey}` },
      }
    case 'gemini':
      return {
        url:     'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.geminiKey}` },
      }
    case 'grok':
      return {
        url:     'https://api.x.ai/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.grokKey}` },
      }
    case 'kimi':
      return {
        url:     'https://api.moonshot.cn/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.kimiKey}` },
      }
    case 'glm':
      return {
        url:     'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.glmKey}` },
      }
    case 'openrouter':
      return {
        url:     'https://openrouter.ai/api/v1/chat/completions',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${cfg.openrouterKey}`,
          'HTTP-Referer':  'https://mentis.app',
          'X-Title':       'Mentis Mobile',
        },
      }
    case 'ollama':
      return {
        url:     `${(cfg.ollamaUrl || 'http://localhost:11434/v1').replace(/\/$/, '')}/chat/completions`,
        headers: { 'Content-Type': 'application/json' },
      }
    default: // 'anthropic'
      return {
        url:     'https://api.anthropic.com/v1/messages',
        headers: {
          'Content-Type':     'application/json',
          'x-api-key':        cfg.anthropicKey,
          'anthropic-version': '2023-06-01',
        },
      }
  }
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const GITHUB_TOOLS_ANTHROPIC = [
  {
    name: 'github_list_files',
    description: 'List files and directories in the connected GitHub repo at a given path.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path, e.g. "src/components". Use "" for root.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'github_read_file',
    description: 'Read the full contents of a file from the GitHub repo.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to repo root, e.g. "src/App.tsx".' },
      },
      required: ['path'],
    },
  },
  {
    name: 'github_write_file',
    description: 'Create or update a file in the GitHub repo and commit it.',
    input_schema: {
      type: 'object',
      properties: {
        path:           { type: 'string', description: 'File path relative to repo root.' },
        content:        { type: 'string', description: 'Full file content to write.' },
        commit_message: { type: 'string', description: 'Git commit message.' },
      },
      required: ['path', 'content', 'commit_message'],
    },
  },
  {
    name: 'github_search_code',
    description: 'Search for code in the GitHub repo.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Code search query.' },
      },
      required: ['query'],
    },
  },
]

// OpenAI-format tool definitions (same functionality)
const GITHUB_TOOLS_OAI = GITHUB_TOOLS_ANTHROPIC.map(t => ({
  type: 'function' as const,
  function: {
    name:        t.name,
    description: t.description,
    parameters:  t.input_schema,
  },
}))

const NEEDS_APPROVAL = new Set(['github_write_file'])

// ── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  cfg:  StandaloneConfig,
): Promise<string> {
  try {
    if (!cfg.githubToken) return 'Error: No GitHub token configured. Add it in Settings → GitHub Connector.'
    if (!cfg.githubRepo)  return 'Error: No GitHub repo configured. Select one in Settings → GitHub Connector.'

    const branch = cfg.githubBranch || 'main'

    if (name === 'github_list_files') {
      const path  = (args.path as string) || ''
      const files = await listFiles(cfg.githubToken, cfg.githubRepo, path, branch)
      if (!files.length) return 'Directory is empty or does not exist.'
      return files.map(f => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}${f.size !== undefined ? ` (${f.size}B)` : ''}`).join('\n')
    }

    if (name === 'github_read_file') {
      return await readFile(cfg.githubToken, cfg.githubRepo, args.path as string, branch)
    }

    if (name === 'github_write_file') {
      const path = args.path as string
      const sha  = await getFileSha(cfg.githubToken, cfg.githubRepo, path, branch)
      const { html_url } = await writeFile(
        cfg.githubToken, cfg.githubRepo, path,
        args.content as string,
        args.commit_message as string,
        branch, sha ?? undefined,
      )
      return `✓ Committed: ${html_url}`
    }

    if (name === 'github_search_code') {
      const results = await searchCode(cfg.githubToken, cfg.githubRepo, args.query as string)
      if (!results.length) return 'No results found.'
      return results.map(r => `${r.path}\n  ${r.url}`).join('\n\n')
    }

    return `Unknown tool: ${name}`
  } catch (e: unknown) {
    return `Error: ${(e as Error).message}`
  }
}

// ── Anthropic-format engine loop ──────────────────────────────────────────────

async function runAnthropicLoop(
  cfg:          StandaloneConfig,
  systemPrompt: string,
  history:      SimpleMsg[],
  userContent:  SimpleMsg['content'],
  onEvent:      (evt: EngineEvent) => void,
  approvalGate: (id: string, name: string, args: Record<string, unknown>) => Promise<boolean>,
  signal?:      AbortSignal,
) {
  const { url, headers } = getRoute(cfg)
  const tools = cfg.githubRepo ? GITHUB_TOOLS_ANTHROPIC : []

  // Convert ContentBlock[] to Anthropic format
  const toAnthropicContent = (c: SimpleMsg['content']): string | unknown[] => {
    if (typeof c === 'string') return c
    return c.map(b => {
      if (b.type === 'image') return { type: 'image', source: { type: 'base64', media_type: b.mediaType, data: b.data } }
      return { type: 'text', text: b.text }
    })
  }

  const msgs: AnthropicMsg[] = [
    ...history.map(m => ({ role: m.role, content: toAnthropicContent(m.content) as string })),
    { role: 'user', content: toAnthropicContent(userContent) as string },
  ]

  let keepGoing = true
  while (keepGoing) {
    if (signal?.aborted) break

    const body: Record<string, unknown> = {
      model:      cfg.model,
      max_tokens: 8096,
      system:     systemPrompt,
      messages:   msgs,
    }
    if (tools.length) { body.tools = tools; body.tool_choice = { type: 'auto' } }

    let resp: Response
    try {
      resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError') return
      onEvent({ type: 'error', message: String(e) }); return
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      if (resp.status === 401 || resp.status === 403) onEvent({ type: 'error', message: 'API key rejected. Check your key in Settings.' })
      else if (resp.status === 404) onEvent({ type: 'error', message: `Model not found: ${cfg.model}` })
      else onEvent({ type: 'error', message: `HTTP ${resp.status}: ${errText.slice(0, 200)}` })
      return
    }

    const data = await resp.json()
    const blocks: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }> = data.content || []

    let text = ''
    const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = []
    for (const b of blocks) {
      if (b.type === 'text')     text = b.text || ''
      if (b.type === 'tool_use') toolCalls.push({ id: b.id!, name: b.name!, args: b.input || {} })
    }
    keepGoing = data.stop_reason === 'tool_use'

    const assistantContent: AnthropicBlock[] = []
    if (text) assistantContent.push({ type: 'text', text })
    for (const tc of toolCalls) assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args })
    msgs.push({ role: 'assistant', content: assistantContent.length ? assistantContent : text })

    if (text) onEvent({ type: 'chunk', text })
    if (!toolCalls.length) break

    const toolResults: AnthropicBlock[] = []
    for (const tc of toolCalls) {
      onEvent({ type: 'tool_start', id: tc.id, name: tc.name, args: tc.args })
      let approved = true
      if (NEEDS_APPROVAL.has(tc.name)) {
        onEvent({ type: 'approval_needed', id: tc.id, name: tc.name, args: tc.args })
        approved = await approvalGate(tc.id, tc.name, tc.args)
        onEvent({ type: 'approval_done', id: tc.id, approved })
      }
      const result = approved ? await executeTool(tc.name, tc.args, cfg) : 'User denied this action.'
      onEvent({ type: 'tool_result', id: tc.id, name: tc.name, result })
      toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: result })
    }
    msgs.push({ role: 'user', content: toolResults })
  }
}

// ── OpenAI-compatible engine loop ─────────────────────────────────────────────

async function runOpenAILoop(
  cfg:          StandaloneConfig,
  systemPrompt: string,
  history:      SimpleMsg[],
  userContent:  SimpleMsg['content'],
  onEvent:      (evt: EngineEvent) => void,
  approvalGate: (id: string, name: string, args: Record<string, unknown>) => Promise<boolean>,
  signal?:      AbortSignal,
) {
  const { url, headers } = getRoute(cfg)
  const tools = cfg.githubRepo ? GITHUB_TOOLS_OAI : []

  // Convert ContentBlock[] to OpenAI image_url format
  const toOAIContent = (c: SimpleMsg['content']): string | unknown[] => {
    if (typeof c === 'string') return c
    return c.map(b => {
      if (b.type === 'image') return { type: 'image_url', image_url: { url: `data:${b.mediaType};base64,${b.data}` } }
      return { type: 'text', text: b.text }
    })
  }

  const msgs: OAIMsg[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: toOAIContent(m.content) as string })),
    { role: 'user', content: toOAIContent(userContent) as string },
  ]

  let keepGoing = true
  while (keepGoing) {
    if (signal?.aborted) break

    const body: Record<string, unknown> = {
      model:      cfg.model,
      max_tokens: 8096,
      messages:   msgs,
    }
    if (tools.length) { body.tools = tools; body.tool_choice = 'auto' }

    let resp: Response
    try {
      resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError') return
      onEvent({ type: 'error', message: String(e) }); return
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      if (resp.status === 401 || resp.status === 403) onEvent({ type: 'error', message: 'API key rejected. Check your key in Settings.' })
      else if (resp.status === 404) onEvent({ type: 'error', message: `Model not found: ${cfg.model}` })
      else onEvent({ type: 'error', message: `HTTP ${resp.status}: ${errText.slice(0, 200)}` })
      return
    }

    const data = await resp.json()
    const choice = data.choices?.[0]
    const msg    = choice?.message

    const text: string        = msg?.content || ''
    const rawCalls: OAIToolCall[] = msg?.tool_calls || []
    keepGoing = choice?.finish_reason === 'tool_calls' && rawCalls.length > 0

    // Add assistant turn to OAI history
    msgs.push({ role: 'assistant', content: text || null, tool_calls: rawCalls.length ? rawCalls : undefined })

    if (text) onEvent({ type: 'chunk', text })
    if (!rawCalls.length) break

    for (const tc of rawCalls) {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(tc.function.arguments || '{}') } catch { /* ignore */ }
      const name = tc.function.name

      onEvent({ type: 'tool_start', id: tc.id, name, args })
      let approved = true
      if (NEEDS_APPROVAL.has(name)) {
        onEvent({ type: 'approval_needed', id: tc.id, name, args })
        approved = await approvalGate(tc.id, name, args)
        onEvent({ type: 'approval_done', id: tc.id, approved })
      }
      const result = approved ? await executeTool(name, args, cfg) : 'User denied this action.'
      onEvent({ type: 'tool_result', id: tc.id, name, result })
      msgs.push({ role: 'tool', content: result, tool_call_id: tc.id })
    }
  }
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function runStandaloneChat(
  cfg:          StandaloneConfig,
  history:      SimpleMsg[],
  message:      string,
  onEvent:      (evt: EngineEvent) => void,
  approvalGate: (id: string, name: string, args: Record<string, unknown>) => Promise<boolean>,
  signal?:      AbortSignal,
  images?:      ImageAttachment[],
): Promise<void> {
  const repoInfo = cfg.githubRepo
    ? `Connected GitHub repo: ${cfg.githubRepo} (branch: ${cfg.githubBranch || 'main'})`
    : 'No GitHub repo connected — file tools unavailable.'

  const systemPrompt = cfg.githubRepo
    ? `You are Mentis, an expert AI coding assistant. ${repoInfo}

Use the github_* tools to read and modify the codebase. Always read files before editing them. Write complete file content when creating or updating files. Be concise and thorough.`
    : 'You are Mentis, an expert AI coding assistant. Provide coding advice and generate code snippets. No repository is connected.'

  // Build user content with optional images
  const userContent: SimpleMsg['content'] = images && images.length
    ? [
        ...images.map(img => ({ type: 'image' as const, mediaType: img.mediaType, data: img.base64 })),
        { type: 'text' as const, text: message },
      ]
    : message

  onEvent({ type: 'thinking' })

  try {
    if (cfg.provider === 'anthropic') {
      await runAnthropicLoop(cfg, systemPrompt, history, userContent, onEvent, approvalGate, signal)
    } else {
      await runOpenAILoop(cfg, systemPrompt, history, userContent, onEvent, approvalGate, signal)
    }
  } catch (e: unknown) {
    if ((e as Error).name !== 'AbortError') {
      onEvent({ type: 'error', message: String(e) })
    }
  }

  onEvent({ type: 'done' })
}

// Re-export for legacy callers
export { streamOpenRouterChat }
