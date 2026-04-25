import { useState, useEffect } from 'react'

interface Props {
  onClose: () => void
  onSaved: () => void
}

type Tab = 'general' | 'anthropic' | 'ollama' | 'about'

const CLAUDE_MODELS = ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']

export default function SettingsModal({ onClose, onSaved }: Props) {
  const [tab, setTab]                     = useState<Tab>('general')
  const [defaultProvider, setDefaultProvider] = useState('ollama')
  const [anthropicKey, setAnthropicKey]   = useState('')
  const [anthropicModel, setAnthropicModel] = useState('claude-sonnet-4-6')
  const [showKey, setShowKey]             = useState(false)
  const [ollamaUrl, setOllamaUrl]         = useState('http://localhost:11434/v1')
  const [ollamaModel, setOllamaModel]     = useState('llama3')
  const [detecting, setDetecting]         = useState(false)
  const [detectedModels, setDetectedModels] = useState<string[]>([])
  const [saving, setSaving]               = useState(false)
  const [saved, setSaved]                 = useState(false)

  useEffect(() => {
    window.mentis.getConfig().then(cfg => {
      const p = (cfg.defaultProvider as string) || 'ollama'
      setDefaultProvider(p)
      const anth = (cfg.anthropic as Record<string, string>) || {}
      setAnthropicKey(anth.apiKey || '')
      setAnthropicModel(anth.model || 'claude-sonnet-4-6')
      const oll = (cfg.ollama as Record<string, string>) || {}
      setOllamaUrl(oll.baseUrl || 'http://localhost:11434/v1')
      setOllamaModel(oll.model || 'llama3')
    })
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const detectModels = async () => {
    setDetecting(true)
    try {
      const list = await window.mentis.listModels()
      setDetectedModels(list)
      if (list.length > 0 && !ollamaModel) setOllamaModel(list[0])
    } catch { /* ignore */ }
    setDetecting(false)
  }

  const save = async () => {
    setSaving(true)
    await window.mentis.setProvider(defaultProvider)
    await window.mentis.updateProviderSettings('anthropic', { apiKey: anthropicKey, model: anthropicModel })
    await window.mentis.updateProviderSettings('ollama', { baseUrl: ollamaUrl, model: ollamaModel })
    setSaving(false)
    setSaved(true)
    onSaved()
    setTimeout(() => { setSaved(false); onClose() }, 900)
  }

  const NAV: [Tab, string][] = [
    ['general',   'General'],
    ['anthropic', 'Anthropic'],
    ['ollama',    'Ollama'],
    ['about',     'About'],
  ]

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm no-drag"
      onClick={onClose}
    >
      <div
        className="bg-panel border border-border rounded-2xl w-[620px] max-h-[80vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <GearIcon />
            <span className="text-sm font-semibold text-[#e8e8e8]">Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted hover:text-[#ccc] hover:bg-white/[0.05] transition-colors"
          >
            <XIcon />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left nav */}
          <div className="w-44 bg-[#0f0f0f] border-r border-border p-2 flex flex-col gap-0.5 shrink-0">
            {NAV.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`text-left px-3 py-2 rounded-lg text-[13px] transition-colors ${
                  tab === id
                    ? 'bg-accent/10 text-[#ddd] font-medium'
                    : 'text-muted hover:text-[#ccc] hover:bg-white/[0.03]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {tab === 'general' && (
              <Section title="General">
                <Field label="Default Provider" hint="Which AI provider to use when starting new chats">
                  <div className="flex gap-2">
                    {(['ollama', 'anthropic'] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => setDefaultProvider(p)}
                        className={`flex-1 px-4 py-2.5 rounded-xl text-[13px] border transition-colors ${
                          defaultProvider === p
                            ? 'bg-accent/10 border-accent/30 text-[#ddd]'
                            : 'bg-transparent border-border text-muted hover:border-[#333] hover:text-[#ccc]'
                        }`}
                      >
                        {p === 'ollama' ? '⬡ Ollama (Local)' : '☁ Anthropic (Cloud)'}
                      </button>
                    ))}
                  </div>
                </Field>
              </Section>
            )}

            {tab === 'anthropic' && (
              <Section title="Anthropic">
                <Field label="API Key" hint="Get your key at console.anthropic.com">
                  <div className="flex gap-2">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={anthropicKey}
                      onChange={e => setAnthropicKey(e.target.value)}
                      placeholder="sk-ant-api03-…"
                      className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-[#e8e8e8] placeholder-muted focus:outline-none focus:border-accent/40 font-mono"
                    />
                    <button
                      onClick={() => setShowKey(v => !v)}
                      className="px-3 py-2 rounded-lg border border-border text-muted hover:text-[#ccc] hover:border-[#333] text-xs transition-colors shrink-0"
                    >
                      {showKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </Field>
                <Field label="Default Model">
                  <select
                    value={anthropicModel}
                    onChange={e => setAnthropicModel(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-[#e8e8e8] focus:outline-none focus:border-accent/40"
                  >
                    {CLAUDE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
              </Section>
            )}

            {tab === 'ollama' && (
              <Section title="Ollama">
                <Field label="Base URL" hint="Ollama server endpoint — include /v1 for OpenAI-compat">
                  <input
                    type="text"
                    value={ollamaUrl}
                    onChange={e => setOllamaUrl(e.target.value)}
                    placeholder="http://localhost:11434/v1"
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-[#e8e8e8] placeholder-muted focus:outline-none focus:border-accent/40 font-mono"
                  />
                </Field>
                <Field label="Default Model" hint="Type a model name or detect installed models">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={ollamaModel}
                      onChange={e => setOllamaModel(e.target.value)}
                      placeholder="llama3"
                      list="detected-models-list"
                      className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-[#e8e8e8] placeholder-muted focus:outline-none focus:border-accent/40 font-mono"
                    />
                    <datalist id="detected-models-list">
                      {detectedModels.map(m => <option key={m} value={m} />)}
                    </datalist>
                    <button
                      onClick={detectModels}
                      disabled={detecting}
                      className="px-3 py-2 rounded-lg border border-border text-muted hover:text-[#ccc] hover:border-[#333] text-xs transition-colors disabled:opacity-40 shrink-0"
                    >
                      {detecting ? 'Detecting…' : '↺ Detect'}
                    </button>
                  </div>
                  {detectedModels.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {detectedModels.map(m => (
                        <button
                          key={m}
                          onClick={() => setOllamaModel(m)}
                          className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
                            m === ollamaModel
                              ? 'bg-accent/10 border-accent/30 text-[#ddd]'
                              : 'bg-transparent border-border text-muted hover:border-[#333] hover:text-[#ccc]'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </Field>
              </Section>
            )}

            {tab === 'about' && (
              <Section title="About Mentis">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
                    <span className="text-base font-bold text-purple-300">M</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#e8e8e8]">Mentis Desktop</div>
                    <div className="text-xs text-muted">AI-powered coding assistant</div>
                  </div>
                </div>
                <div className="space-y-2 text-xs text-muted">
                  {[
                    ['Config',   '~/.mentisrc'],
                    ['Sessions', '~/.mentis/sessions/'],
                    ['MCP',      '~/.mentis/mcp.json'],
                    ['Hooks',    '~/.mentis/settings.json'],
                    ['Context',  '~/.mentis/MENTIS.md'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="w-16 shrink-0">{k}</span>
                      <code className="font-mono text-accent/70 text-[11px]">{v}</code>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-muted hover:text-[#ccc] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || saved}
            className="px-5 py-2 rounded-lg bg-accent hover:bg-violet-600 disabled:opacity-60 text-white text-sm font-medium transition-colors"
          >
            {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-[10px] font-semibold text-muted uppercase tracking-wider pb-1 border-b border-border">
        {title}
      </h3>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[13px] font-medium text-[#bbb]">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  )
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}
