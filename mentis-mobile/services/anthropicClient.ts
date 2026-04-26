/**
 * Standalone AI streaming — used when not connected to a Mentis Desktop.
 * Supports Anthropic (native SSE) and OpenRouter/OpenAI-compatible providers.
 */

type History = Array<{ role: 'user' | 'assistant'; content: string }>

// ── Anthropic native SSE ─────────────────────────────────────────────────────

export async function streamAnthropicChat(
  apiKey:  string,
  model:   string,
  history: History,
  message: string,
  onChunk: (text: string) => void,
  onDone:  () => void,
  onError: (err: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const messages: History = [...history, { role: 'user', content: message }]

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: 8096, stream: true, messages }),
    })

    if (!r.ok) { onError(`Anthropic error ${r.status}: ${await r.text()}`); return }
    if (!r.body) { onError('No response body'); return }

    await consumeAnthropicSSE(r.body, onChunk, onDone)
  } catch (err: unknown) {
    if ((err as Error).name !== 'AbortError') onError(String(err))
  }
}

async function consumeAnthropicSSE(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
  onDone: () => void,
) {
  const reader  = body.getReader()
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
      const raw = line.slice(6).trim()
      if (raw === '[DONE]') { onDone(); return }
      try {
        const evt = JSON.parse(raw)
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') onChunk(evt.delta.text)
        if (evt.type === 'message_stop') { onDone(); return }
      } catch { /* skip partial */ }
    }
  }
  onDone()
}

// ── OpenRouter / OpenAI-compatible SSE ───────────────────────────────────────

export async function streamOpenRouterChat(
  apiKey:  string,
  model:   string,
  history: History,
  message: string,
  onChunk: (text: string) => void,
  onDone:  () => void,
  onError: (err: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const messages = [
    { role: 'system', content: 'You are Mentis, an expert AI coding assistant. Be concise and helpful.' },
    ...history,
    { role: 'user', content: message },
  ]

  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer':  'https://mentis.app',
        'X-Title':       'Mentis Mobile',
      },
      body: JSON.stringify({ model, max_tokens: 8096, stream: true, messages }),
    })

    if (!r.ok) { onError(`OpenRouter error ${r.status}: ${await r.text()}`); return }
    if (!r.body) { onError('No response body'); return }

    await consumeOpenAISSE(r.body, onChunk, onDone)
  } catch (err: unknown) {
    if ((err as Error).name !== 'AbortError') onError(String(err))
  }
}

async function consumeOpenAISSE(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
  onDone: () => void,
) {
  const reader  = body.getReader()
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
      const raw = line.slice(6).trim()
      if (raw === '[DONE]') { onDone(); return }
      try {
        const evt = JSON.parse(raw)
        const text = evt.choices?.[0]?.delta?.content
        if (text) onChunk(text)
        if (evt.choices?.[0]?.finish_reason === 'stop') { onDone(); return }
      } catch { /* skip partial */ }
    }
  }
  onDone()
}

// ── Unified entry point ──────────────────────────────────────────────────────

export type StandaloneProvider = 'anthropic' | 'openrouter'

export async function streamStandaloneChat(
  provider: StandaloneProvider,
  apiKey:   string,
  model:    string,
  history:  History,
  message:  string,
  onChunk:  (text: string) => void,
  onDone:   () => void,
  onError:  (err: string) => void,
  signal?:  AbortSignal,
): Promise<void> {
  if (provider === 'openrouter') {
    return streamOpenRouterChat(apiKey, model, history, message, onChunk, onDone, onError, signal)
  }
  return streamAnthropicChat(apiKey, model, history, message, onChunk, onDone, onError, signal)
}
