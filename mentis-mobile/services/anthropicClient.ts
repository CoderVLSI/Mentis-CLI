/**
 * Direct Anthropic API streaming — used in standalone mode.
 * Uses fetch-based SSE that works in React Native (Hermes engine).
 */

export async function streamAnthropicChat(
  apiKey:  string,
  model:   string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  message: string,
  onChunk: (text: string) => void,
  onDone:  () => void,
  onError: (err: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: message },
  ]

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type':         'application/json',
        'x-api-key':            apiKey,
        'anthropic-version':    '2023-06-01',
        'anthropic-beta':       'messages-2023-12-15',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8096,
        stream:     true,
        messages,
      }),
    })

    if (!r.ok) {
      const body = await r.text()
      onError(`Anthropic error ${r.status}: ${body}`)
      return
    }

    if (!r.body) { onError('No response body'); return }

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
        const raw = line.slice(6).trim()
        if (raw === '[DONE]') { onDone(); return }
        try {
          const evt = JSON.parse(raw)
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            onChunk(evt.delta.text)
          }
          if (evt.type === 'message_stop') { onDone(); return }
        } catch { /* skip partial */ }
      }
    }
    onDone()
  } catch (err: unknown) {
    if ((err as Error).name !== 'AbortError') onError(String(err))
  }
}
