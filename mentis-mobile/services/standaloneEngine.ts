/**
 * Standalone engine — runs an Anthropic tool-use loop on the phone.
 * Tools are backed by the GitHub REST API (no desktop required).
 *
 * Emits typed events that mirror the desktop sync server's SSE events
 * so the chat screen doesn't need to know which backend it's using.
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
  provider:      'anthropic' | 'openrouter'
  apiKey:        string
  model:         string
  githubToken:   string
  githubRepo:    string   // e.g. "owner/repo"
  githubBranch:  string   // e.g. "main"
}

type AnthropicMsg = {
  role: 'user' | 'assistant'
  content: string | AnthropicBlock[]
}
type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

// ── Tool definitions ─────────────────────────────────────────────────────────

const GITHUB_TOOLS = [
  {
    name: 'github_list_files',
    description: 'List files and directories in the connected GitHub repo at a given path.',
    input_schema: {
      type: 'object',
      properties: {
        path:   { type: 'string', description: 'Directory path, e.g. "src/components". Use "" for root.' },
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

const NEEDS_APPROVAL = new Set(['github_write_file'])

// ── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  cfg:  StandaloneConfig,
): Promise<string> {
  try {
    if (!cfg.githubToken) return 'Error: No GitHub token configured. Add it in Settings → GitHub.'
    if (!cfg.githubRepo)  return 'Error: No GitHub repo configured. Add it in Settings → GitHub.'

    const branch = cfg.githubBranch || 'main'

    if (name === 'github_list_files') {
      const path = (args.path as string) || ''
      const files = await listFiles(cfg.githubToken, cfg.githubRepo, path, branch)
      if (!files.length) return 'Directory is empty or does not exist.'
      return files.map(f => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}${f.size !== undefined ? ` (${f.size}B)` : ''}`).join('\n')
    }

    if (name === 'github_read_file') {
      const content = await readFile(cfg.githubToken, cfg.githubRepo, args.path as string, branch)
      return content
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

// ── Main engine loop ─────────────────────────────────────────────────────────

export async function runStandaloneChat(
  cfg:     StandaloneConfig,
  history: AnthropicMsg[],
  message: string,
  onEvent: (evt: EngineEvent) => void,
  approvalGate: (id: string, name: string, args: Record<string, unknown>) => Promise<boolean>,
  signal?: AbortSignal,
): Promise<AnthropicMsg[]> {
  const repoInfo = cfg.githubRepo
    ? `Connected GitHub repo: ${cfg.githubRepo} (branch: ${cfg.githubBranch || 'main'})`
    : 'No GitHub repo connected — file tools unavailable.'

  const systemPrompt = cfg.githubRepo
    ? `You are Mentis, an expert AI coding assistant. ${repoInfo}

Use the github_* tools to read and modify the codebase. Always read files before editing them. When writing files, write the complete file content. Be concise and thorough.`
    : 'You are Mentis, an expert AI coding assistant. No repository is connected — provide coding advice and generate code snippets without file access.'

  const tools = cfg.githubRepo ? GITHUB_TOOLS : []

  const msgs: AnthropicMsg[] = [...history, { role: 'user', content: message }]
  const updatedHistory = [...msgs]

  onEvent({ type: 'thinking' })

  let keepGoing = true
  while (keepGoing) {
    if (signal?.aborted) break

    const body: Record<string, unknown> = {
      model:      cfg.model,
      max_tokens: 4096,
      system:     systemPrompt,
      messages:   msgs,
    }
    if (tools.length) {
      body.tools = tools
      body.tool_choice = { type: 'auto' }
    }

    const isAnthropic = cfg.provider === 'anthropic'
    const url = isAnthropic
      ? 'https://api.anthropic.com/v1/messages'
      : 'https://openrouter.ai/api/v1/chat/completions'

    const reqHeaders: Record<string, string> = isAnthropic
      ? { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' }
      : { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}`, 'HTTP-Referer': 'https://mentis.app', 'X-Title': 'Mentis Mobile' }

    let resp: Response
    try {
      resp = await fetch(url, { method: 'POST', headers: reqHeaders, body: JSON.stringify(body), signal })
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError') return updatedHistory
      onEvent({ type: 'error', message: String(e) }); return updatedHistory
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      if (resp.status === 401 || resp.status === 403) {
        onEvent({ type: 'error', message: 'API key rejected. Check your key in Settings.' })
      } else if (resp.status === 404) {
        onEvent({ type: 'error', message: `Model not found: ${cfg.model}` })
      } else {
        onEvent({ type: 'error', message: `HTTP ${resp.status}: ${errText.slice(0, 200)}` })
      }
      return updatedHistory
    }

    const data = await resp.json()

    // Parse response (Anthropic format — OpenRouter mirrors it with tools)
    let text = ''
    const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = []

    if (isAnthropic || tools.length) {
      // Anthropic native tool_use format
      const blocks: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }> =
        data.content || []
      for (const b of blocks) {
        if (b.type === 'text')     text = b.text || ''
        if (b.type === 'tool_use') toolCalls.push({ id: b.id!, name: b.name!, args: b.input || {} })
      }
      keepGoing = data.stop_reason === 'tool_use'
    } else {
      // OpenRouter without tools — plain text
      text = data.choices?.[0]?.message?.content || ''
      keepGoing = false
    }

    // Add assistant turn to history
    const assistantContent: AnthropicBlock[] = []
    if (text) assistantContent.push({ type: 'text', text })
    for (const tc of toolCalls) assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args })
    msgs.push({ role: 'assistant', content: assistantContent.length ? assistantContent : text })
    updatedHistory.push({ role: 'assistant', content: assistantContent.length ? assistantContent : text })

    if (text) onEvent({ type: 'chunk', text })

    if (!toolCalls.length) { keepGoing = false; break }

    // Execute tools
    const toolResults: AnthropicBlock[] = []
    for (const tc of toolCalls) {
      onEvent({ type: 'tool_start', id: tc.id, name: tc.name, args: tc.args })

      let approved = true
      if (NEEDS_APPROVAL.has(tc.name)) {
        onEvent({ type: 'approval_needed', id: tc.id, name: tc.name, args: tc.args })
        approved = await approvalGate(tc.id, tc.name, tc.args)
        onEvent({ type: 'approval_done', id: tc.id, approved })
      }

      const result = approved
        ? await executeTool(tc.name, tc.args, cfg)
        : 'User denied this action.'

      onEvent({ type: 'tool_result', id: tc.id, name: tc.name, result })
      toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: result })
    }

    msgs.push({ role: 'user', content: toolResults })
    updatedHistory.push({ role: 'user', content: toolResults })
  }

  onEvent({ type: 'done' })
  return updatedHistory
}

// ── OpenRouter standalone (no tools) ─────────────────────────────────────────
// Re-exported for callers that don't need GitHub tools
export { streamOpenRouterChat }
