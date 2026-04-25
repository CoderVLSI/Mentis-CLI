import { useState, useEffect } from 'react'

interface Props {
  onClose: () => void
  onSaved: () => void
}

type Tab = 'general' | 'providers' | 'ollama' | 'about'

type ProviderCfg = { apiKey: string; model: string }

const CLOUD_PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    badge: 'Claude',
    color: 'text-orange-400',
    placeholder: 'sk-ant-api03-…',
    models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    badge: 'GPT',
    color: 'text-green-400',
    placeholder: 'sk-…',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'o1', 'gpt-4-turbo'],
  },
  {
    id: 'gemini',
    name: 'Gemini',
    badge: 'Google',
    color: 'text-blue-400',
    placeholder: 'AIzaSy…',
    models: ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  {
    id: 'grok',
    name: 'Grok',
    badge: 'xAI',
    color: 'text-white',
    placeholder: 'xai-…',
    models: ['grok-3', 'grok-3-mini', 'grok-2', 'grok-2-mini'],
  },
  {
    id: 'kimi',
    name: 'Kimi',
    badge: 'Moonshot',
    color: 'text-cyan-400',
    placeholder: 'sk-…',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  },
  {
    id: 'glm',
    name: 'GLM',
    badge: 'Zhipu',
    color: 'text-violet-400',
    placeholder: 'your-api-key',
    models: ['glm-4', 'glm-4-flash', 'glm-4-plus', 'glm-3-turbo'],
  },
]

const ALL_PROVIDER_IDS = [...CLOUD_PROVIDERS.map(p => p.id), 'ollama']

export default function SettingsModal({ onClose, onSaved }: Props) {
  const [tab, setTab]                         = useState<Tab>('general')
  const [defaultProvider, setDefaultProvider] = useState('ollama')
  const [providers, setProviders]             = useState<Record<string, ProviderCfg>>({})
  const [showKeys, setShowKeys]               = useState<Record<string, boolean>>({})
  const [ollamaUrl, setOllamaUrl]             = useState('http://localhost:11434/v1')
  const [ollamaModel, setOllamaModel]         = useState('llama3')
  const [detecting, setDetecting]             = useState(false)
  const [detectedModels, setDetectedModels]   = useState<string[]>([])
  const [saving, setSaving]                   = useState(false)
  const [saved, setSaved]                     = useState(false)

  useEffect(() => {
    window.mentis.getConfig().then(cfg => {
      setDefaultProvider((cfg.defaultProvider as string) || 'ollama')
      const loaded: Record<string, ProviderCfg> = {}
      for (const p of CLOUD_PROVIDERS) {
        const c = (cfg[p.id] as Record<string, string>) || {}
        loaded[p.id] = { apiKey: c.apiKey || '', model: c.model || p.models[0] }
      }
      setProviders(loaded)
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

  const updateProvider = (id: string, field: 'apiKey' | 'model', value: string) =>
    setProviders(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))

  const toggleShowKey = (id: string) =>
    setShowKeys(prev => ({ ...prev, [id]: !prev[id] }))

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
    for (const p of CLOUD_PROVIDERS) {
      const cfg = providers[p.id] || { apiKey: '', model: p.models[0] }
      await window.mentis.updateProviderSettings(p.id, { apiKey: cfg.apiKey, model: cfg.model })
    }
    await window.mentis.updateProviderSettings('ollama', { baseUrl: ollamaUrl, model: ollamaModel })
    setSaving(false); setSaved(true); onSaved()
    setTimeout(() => { setSaved(false); onClose() }, 900)
  }

  const NAV: [Tab, string][] = [
    ['general',   'General'],
    ['providers', 'Providers'],
    ['ollama',    'Ollama'],
    ['about',     'About'],
  ]

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm no-drag"
      onClick={onClose}
    >
      <div
        className="bg-panel border border-border rounded-2xl w-[660px] max-h-[82vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <GearIcon />
            <span className="text-sm font-semibold text-[#e8e8e8]">Settings</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-muted hover:text-[#ccc] hover:bg-white/[0.05] transition-colors">
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
                  tab === id ? 'bg-accent/10 text-[#ddd] font-medium' : 'text-muted hover:text-[#ccc] hover:bg-white/[0.03]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {tab === 'general' && (
              <Section title="General">
                <Field label="Default Provider" hint="Which provider to use for new chats">
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_PROVIDER_IDS.map(id => {
                      const p = CLOUD_PROVIDERS.find(x => x.id === id)
                      const label = p ? `${p.name}` : 'Ollama (Local)'
                      return (
                        <button
                          key={id}
                          onClick={() => setDefaultProvider(id)}
                          className={`px-3 py-2 rounded-xl text-[12px] border transition-colors text-left ${
                            defaultProvider === id
                              ? 'bg-accent/10 border-accent/30 text-[#ddd]'
                              : 'bg-transparent border-border text-muted hover:border-[#333] hover:text-[#ccc]'
                          }`}
                        >
                          {id === 'ollama' ? '⬡ Ollama (Local)' : label}
                        </button>
                      )
                    })}
                  </div>
                </Field>
              </Section>
            )}

            {tab === 'providers' && (
              <div className="space-y-3">
                <h3 className="text-[10px] font-semibold text-muted uppercase tracking-wider pb-1 border-b border-border">
                  Cloud Providers
                </h3>
                {CLOUD_PROVIDERS.map(p => {
                  const cfg = providers[p.id] || { apiKey: '', model: p.models[0] }
                  return (
                    <div key={p.id} className="rounded-xl border border-border bg-surface p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-[13px] font-semibold ${p.color}`}>{p.name}</span>
                        <span className="text-[10px] text-muted border border-border rounded px-1.5 py-0.5">{p.badge}</span>
                      </div>
                      <div className="space-y-2.5">
                        <div>
                          <label className="text-[11px] text-muted mb-1 block">API Key</label>
                          <div className="flex gap-2">
                            <input
                              type={showKeys[p.id] ? 'text' : 'password'}
                              value={cfg.apiKey}
                              onChange={e => updateProvider(p.id, 'apiKey', e.target.value)}
                              placeholder={p.placeholder}
                              className="flex-1 bg-[#0a0a0a] border border-border rounded-lg px-3 py-1.5 text-[12px] text-[#e8e8e8] placeholder-muted focus:outline-none focus:border-accent/40 font-mono"
                            />
                            <button
                              onClick={() => toggleShowKey(p.id)}
                              className="px-3 py-1.5 rounded-lg border border-border text-muted hover:text-[#ccc] text-[11px] transition-colors shrink-0"
                            >
                              {showKeys[p.id] ? 'Hide' : 'Show'}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] text-muted mb-1 block">Model</label>
                          <select
                            value={cfg.model}
                            onChange={e => updateProvider(p.id, 'model', e.target.value)}
                            className="w-full bg-[#0a0a0a] border border-border rounded-lg px-3 py-1.5 text-[12px] text-[#e8e8e8] focus:outline-none focus:border-accent/40"
                          >
                            {p.models.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
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
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted hover:text-[#ccc] transition-colors">
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
      <h3 className="text-[10px] font-semibold text-muted uppercase tracking-wider pb-1 border-b border-border">{title}</h3>
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
