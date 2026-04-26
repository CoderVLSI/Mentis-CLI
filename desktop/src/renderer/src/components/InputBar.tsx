import { useState, useRef, useEffect, KeyboardEvent } from 'react'

interface Props {
  disabled:         boolean
  streaming:        boolean
  model:            string
  provider:         string
  onSend:           (text: string) => void
  onCancel:         () => void
  onModelChange:    (model: string) => void
  onProviderChange: (provider: string) => void
}

const SLASH_COMMANDS = [
  { cmd: '/plan',   desc: 'Plan before building' },
  { cmd: '/build',  desc: 'Execute the agreed plan' },
  { cmd: '/status', desc: 'Show session info' },
  { cmd: '/clear',  desc: 'Clear chat history' },
  { cmd: '/mode',   desc: 'Toggle PLAN / BUILD mode' },
  { cmd: '/help',   desc: 'List commands' },
]

const PROVIDER_MODELS: Record<string, string[]> = {
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  openai:    ['gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-4o', 'o3'],
  gemini:    ['gemini-3.1-pro', 'gemini-3.1-flash', 'gemini-3-flash', 'gemini-2.5-pro'],
  grok:      ['grok-4.20', 'grok-4.20-reasoning', 'grok-code-fast-1', 'grok-4.1-fast'],
  kimi:      ['kimi-k2.6', 'kimi-k2.5', 'moonshot-v1-128k', 'moonshot-v1-32k'],
  glm:       ['glm-5.1', 'glm-5', 'glm-5-turbo', 'glm-4.7', 'glm-4.7-flash'],
  ollama:    ['llama3', 'llama3.1', 'codellama', 'deepseek-coder', 'mistral', 'phi3', 'gemma2'],
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Claude models', openai: 'OpenAI models', gemini: 'Gemini models',
  grok: 'Grok models', kimi: 'Kimi models', glm: 'GLM models', ollama: 'Ollama models',
}

const PROVIDER_ORDER = ['anthropic', 'openai', 'gemini', 'grok', 'kimi', 'glm', 'ollama']

const OLLAMA_FALLBACK = PROVIDER_MODELS.ollama

export default function InputBar({ disabled, streaming, model, provider, onSend, onCancel, onModelChange, onProviderChange }: Props) {
  const [text, setText]               = useState('')
  const [ddOpen, setDdOpen]           = useState(false)
  const [ddIdx, setDdIdx]             = useState(0)
  const [ddItems, setDdItems]         = useState(SLASH_COMMANDS)
  const [modelOpen, setModelOpen]     = useState(false)
  const [modelList, setModelList]     = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const textareaRef                   = useRef<HTMLTextAreaElement>(null)
  const modelBtnRef                   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = textareaRef.current; if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 180) + 'px'
  }, [text])

  useEffect(() => { textareaRef.current?.focus() }, [])

  // Auto-detect models when provider changes
  useEffect(() => {
    const staticList = PROVIDER_MODELS[provider]
    if (staticList) { setModelList(staticList); setModelsLoading(false); return }

    let cancelled = false
    setModelsLoading(true)
    setModelList([])
    window.mentis.listModels().then(list => {
      if (!cancelled) { setModelList(list.length ? list : OLLAMA_FALLBACK); setModelsLoading(false) }
    }).catch(() => {
      if (!cancelled) { setModelList(OLLAMA_FALLBACK); setModelsLoading(false) }
    })
    return () => { cancelled = true }
  }, [provider])

  // Close model dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelBtnRef.current && !modelBtnRef.current.contains(e.target as Node)) setModelOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleChange = (val: string) => {
    setText(val)
    if (val.startsWith('/')) {
      const q = val.toLowerCase()
      const filtered = SLASH_COMMANDS.filter(c => c.cmd.startsWith(q))
      setDdItems(filtered); setDdIdx(0); setDdOpen(filtered.length > 0)
    } else { setDdOpen(false) }
  }

  const acceptCmd = (cmd: string) => { setText(cmd + ' '); setDdOpen(false); textareaRef.current?.focus() }

  const submit = () => {
    const t = text.trim(); if (!t) return
    onSend(t); setText(''); setDdOpen(false)
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (ddOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setDdIdx(i => Math.min(i + 1, ddItems.length - 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setDdIdx(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && ddItems.length)) { e.preventDefault(); acceptCmd(ddItems[ddIdx]?.cmd || text); return }
      if (e.key === 'Escape') { setDdOpen(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!streaming) submit() }
  }

  return (
    <div className="relative px-4 pb-4 pt-2 border-t border-border bg-surface shrink-0">
      {/* Slash command dropdown */}
      {ddOpen && ddItems.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-1 bg-panel border border-border rounded-xl overflow-hidden shadow-2xl z-50">
          {ddItems.map((item, i) => (
            <button key={item.cmd} onClick={() => acceptCmd(item.cmd)}
              className={`flex items-center gap-3 w-full px-4 py-2.5 text-left text-xs transition-colors ${i === ddIdx ? 'bg-accent/10 text-[#ddd]' : 'text-muted hover:bg-white/[0.03]'}`}>
              <span className="font-mono text-purple-400 w-20 shrink-0">{item.cmd}</span>
              <span className="text-[#888]">{item.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main input box */}
      <div className={`flex items-end gap-2 px-3 py-2 rounded-xl border transition-colors ${disabled ? 'border-border' : 'border-[#333] focus-within:border-accent/40'} bg-panel`}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask anything… (/ for commands)"
          disabled={streaming}
          rows={1}
          className="flex-1 bg-transparent text-sm text-[#e8e8e8] placeholder-muted resize-none outline-none leading-relaxed py-0.5 font-[inherit] disabled:opacity-50"
          style={{ minHeight: '22px', maxHeight: '180px' }}
        />

        <div className="flex items-center gap-1.5 shrink-0 pb-0.5">
          {/* Mic button */}
          <button className="p-1.5 rounded-lg text-muted hover:text-[#ccc] hover:bg-white/[0.05] transition-colors" title="Voice input (coming soon)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>

          {streaming ? (
            <button onClick={onCancel} className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 text-[11px] font-medium transition-colors flex items-center gap-1.5">
              <StopIcon /> Stop
            </button>
          ) : (
            <button onClick={submit} disabled={!text.trim()} className="px-3 py-1.5 rounded-lg bg-accent hover:bg-violet-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[11px] font-medium transition-colors flex items-center gap-1.5">
              <SendIcon /> Send
            </button>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between mt-1.5 px-1">
        <div className="flex items-center gap-2">
          {/* Provider toggle */}
          <button
            onClick={() => {
              const idx = PROVIDER_ORDER.indexOf(provider)
              onProviderChange(PROVIDER_ORDER[(idx + 1) % PROVIDER_ORDER.length])
            }}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors ${
              provider === 'ollama'
                ? 'bg-[#111] text-muted border-border hover:border-[#333]'
                : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
            }`}
            title="Cycle provider"
          >
            {provider === 'ollama' ? '⬡ Local' : `☁ ${provider.charAt(0).toUpperCase() + provider.slice(1)}`}
          </button>

          {/* Model selector */}
          <div className="relative" ref={modelBtnRef}>
            <button
              onClick={() => setModelOpen(o => !o)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-[#111] border border-border hover:border-[#333] text-muted hover:text-[#ccc] transition-colors"
            >
              {modelsLoading
                ? <span className="opacity-50">detecting…</span>
                : <span className="font-mono max-w-[140px] truncate">{model}</span>
              }
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>

            {modelOpen && (
              <div className="absolute bottom-full mb-1 left-0 bg-panel border border-border rounded-xl overflow-hidden shadow-2xl z-50 min-w-[200px] max-h-64 overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-border sticky top-0 bg-panel">
                  <span className="text-[10px] text-muted uppercase tracking-wider">
                    {PROVIDER_LABELS[provider] || 'Models'}
                  </span>
                  {provider === 'ollama' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setModelsLoading(true)
                        window.mentis.listModels().then(list => {
                          setModelList(list.length ? list : OLLAMA_FALLBACK)
                          setModelsLoading(false)
                        }).catch(() => { setModelList(OLLAMA_FALLBACK); setModelsLoading(false) })
                      }}
                      className="text-[9px] text-muted hover:text-accent transition-colors"
                      title="Refresh model list"
                    >
                      ↺ refresh
                    </button>
                  )}
                </div>

                {modelsLoading ? (
                  <div className="px-3 py-3 text-[11px] text-muted text-center">Detecting models…</div>
                ) : modelList.length === 0 ? (
                  <div className="px-3 py-3 text-[11px] text-muted text-center">
                    No models found.<br/>
                    <span className="text-[10px] opacity-60">Is Ollama running?</span>
                  </div>
                ) : modelList.map(m => (
                  <button key={m} onClick={() => { onModelChange(m); setModelOpen(false) }}
                    className={`flex items-center gap-2 w-full px-3 py-2 text-left text-[11px] transition-colors ${m === model ? 'bg-accent/10 text-[#ddd]' : 'text-muted hover:bg-white/[0.04] hover:text-[#ccc]'}`}>
                    {m === model
                      ? <span className="text-accent shrink-0">✓</span>
                      : <span className="w-3 shrink-0" />
                    }
                    <span className="font-mono truncate">{m}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <span className="text-[10px] text-muted">
          {streaming ? 'Generating…' : 'Enter · Shift+Enter for newline · / for commands'}
        </span>
      </div>
    </div>
  )
}

function SendIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
}

function StopIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
}
