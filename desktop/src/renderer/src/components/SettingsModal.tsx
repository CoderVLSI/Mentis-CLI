import { useState, useEffect } from 'react'

interface Props {
  onClose: () => void
  onSaved: () => void
}

type Tab = 'general' | 'providers' | 'about'

const PROVIDERS = [
  {
    id: 'anthropic', name: 'Anthropic', badge: 'Claude', color: 'text-orange-400',
    placeholder: 'sk-ant-api03-…', hasApiKey: true,
    models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  },
  {
    id: 'openai', name: 'OpenAI', badge: 'GPT', color: 'text-green-400',
    placeholder: 'sk-…', hasApiKey: true,
    models: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-4.1', 'gpt-4o', 'o3'],
  },
  {
    id: 'gemini', name: 'Gemini', badge: 'Google', color: 'text-blue-400',
    placeholder: 'AIzaSy…', hasApiKey: true,
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.1-pro-preview', 'gemini-3-pro-preview'],
  },
  {
    id: 'grok', name: 'Grok', badge: 'xAI', color: 'text-neutral-200',
    placeholder: 'xai-…', hasApiKey: true,
    models: ['grok-4.20', 'grok-3', 'grok-3-mini', 'grok-2-1212'],
  },
  {
    id: 'kimi', name: 'Kimi', badge: 'Moonshot', color: 'text-cyan-400',
    placeholder: 'sk-…', hasApiKey: true,
    models: ['kimi-k2.6', 'kimi-k2.5', 'kimi-k2', 'moonshot-v1-128k'],
  },
  {
    id: 'glm', name: 'GLM', badge: 'Zhipu', color: 'text-violet-400',
    placeholder: 'your-api-key', hasApiKey: true,
    models: ['glm-5.1', 'glm-5', 'glm-4.7', 'glm-4.6', 'glm-4.5'],
  },
  {
    id: 'openrouter', name: 'OpenRouter', badge: 'Router', color: 'text-pink-400',
    placeholder: 'sk-or-v1-…', hasApiKey: true,
    models: ['openai/gpt-4o', 'openai/gpt-4.1', 'anthropic/claude-opus-4', 'anthropic/claude-sonnet-4-5', 'google/gemini-2.5-pro', 'meta-llama/llama-4-scout', 'deepseek/deepseek-r2', 'x-ai/grok-3'],
  },
  {
    id: 'ollama', name: 'Ollama', badge: 'Local', color: 'text-yellow-400',
    placeholder: 'http://localhost:11434/v1', hasApiKey: false,
    models: [],
  },
]

export default function SettingsModal({ onClose, onSaved }: Props) {
  const [tab, setTab]                         = useState<Tab>('general')
  const [defaultProvider, setDefaultProvider] = useState('ollama')
  const [apiKeys, setApiKeys]                 = useState<Record<string, string>>({})
  const [models, setModels]                   = useState<Record<string, string>>({})
  const [showKey, setShowKey]                 = useState<Record<string, boolean>>({})
  const [ollamaUrl, setOllamaUrl]             = useState('http://localhost:11434/v1')
  const [ollamaModel, setOllamaModel]         = useState('llama3')
  const [detecting, setDetecting]             = useState(false)
  const [detectedModels, setDetectedModels]   = useState<string[]>([])
  const [saving, setSaving]                   = useState(false)
  const [saved, setSaved]                     = useState(false)

  useEffect(() => {
    window.mentis.getConfig().then(cfg => {
      setDefaultProvider((cfg.defaultProvider as string) || 'ollama')
      const keys: Record<string, string> = {}
      const mods: Record<string, string> = {}
      for (const p of PROVIDERS.filter(x => x.hasApiKey)) {
        const c = (cfg[p.id] as Record<string, string>) || {}
        keys[p.id] = c.apiKey || ''
        mods[p.id] = c.model  || p.models[0] || ''
      }
      setApiKeys(keys); setModels(mods)
      const oll = (cfg.ollama as Record<string, string>) || {}
      setOllamaUrl(oll.baseUrl || 'http://localhost:11434/v1')
      setOllamaModel(oll.model || 'llama3')
    })
  }, [])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
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
    for (const p of PROVIDERS.filter(x => x.hasApiKey)) {
      await window.mentis.updateProviderSettings(p.id, { apiKey: apiKeys[p.id] || '', model: models[p.id] || p.models[0] })
    }
    await window.mentis.updateProviderSettings('ollama', { baseUrl: ollamaUrl, model: ollamaModel })
    setSaving(false); setSaved(true); onSaved()
    setTimeout(() => { setSaved(false); onClose() }, 900)
  }

  const NAV: [Tab, string][] = [['general', 'General'], ['providers', 'Providers'], ['about', 'About']]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm no-drag" onClick={onClose}>
      <div className="bg-panel border border-border rounded-2xl w-[680px] max-h-[84vh] overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2"><GearIcon /><span className="text-sm font-semibold text-[#e8e8e8]">Settings</span></div>
          <button onClick={onClose} className="p-1 rounded-lg text-muted hover:text-[#ccc] hover:bg-white/[0.05] transition-colors"><XIcon /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left nav */}
          <div className="w-40 bg-[#0f0f0f] border-r border-border p-2 flex flex-col gap-0.5 shrink-0">
            {NAV.map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`text-left px-3 py-2 rounded-lg text-[13px] transition-colors ${
                tab === id ? 'bg-accent/10 text-[#ddd] font-medium' : 'text-muted hover:text-[#ccc] hover:bg-white/[0.03]'
              }`}>{label}</button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {tab === 'general' && (
              <div className="space-y-4">
                <SectionTitle>Default Provider</SectionTitle>
                <p className="text-[11px] text-muted -mt-2">Used when starting new chats</p>
                <div className="grid grid-cols-2 gap-2">
                  {PROVIDERS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setDefaultProvider(p.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-[12px] border transition-colors text-left ${
                        defaultProvider === p.id
                          ? 'bg-accent/10 border-accent/30 text-[#ddd]'
                          : 'bg-transparent border-border text-muted hover:border-[#333] hover:text-[#ccc]'
                      }`}
                    >
                      <span className={`font-semibold ${p.color}`}>{p.name}</span>
                      <span className="text-[10px] text-muted/70">{p.badge}</span>
                      {defaultProvider === p.id && <span className="ml-auto text-accent text-[10px]">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === 'providers' && (
              <div className="space-y-3">
                <SectionTitle>Cloud Providers</SectionTitle>
                {PROVIDERS.filter(p => p.hasApiKey).map(p => (
                  <div key={p.id} className="rounded-xl border border-border bg-[#0d0d0d] p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-[13px] font-semibold ${p.color}`}>{p.name}</span>
                      <span className="text-[10px] text-muted border border-border/60 rounded px-1.5 py-0.5">{p.badge}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-muted/70 uppercase tracking-wide mb-1 block">API Key</label>
                        <div className="flex gap-1.5">
                          <input
                            type={showKey[p.id] ? 'text' : 'password'}
                            value={apiKeys[p.id] || ''}
                            onChange={e => setApiKeys(prev => ({ ...prev, [p.id]: e.target.value }))}
                            placeholder={p.placeholder}
                            className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-[#e8e8e8] placeholder-muted/50 focus:outline-none focus:border-accent/40 font-mono"
                          />
                          <button onClick={() => setShowKey(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                            className="px-2 rounded-lg border border-border text-[10px] text-muted hover:text-[#ccc] transition-colors shrink-0">
                            {showKey[p.id] ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted/70 uppercase tracking-wide mb-1 block">Model</label>
                        <select
                          value={models[p.id] || p.models[0]}
                          onChange={e => setModels(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-[#e8e8e8] focus:outline-none focus:border-accent/40"
                        >
                          {p.models.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}

                <SectionTitle>Local</SectionTitle>
                <div className="rounded-xl border border-border bg-[#0d0d0d] p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-yellow-400">Ollama</span>
                    <span className="text-[10px] text-muted border border-border/60 rounded px-1.5 py-0.5">Local</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-muted/70 uppercase tracking-wide mb-1 block">Base URL</label>
                      <input
                        type="text"
                        value={ollamaUrl}
                        onChange={e => setOllamaUrl(e.target.value)}
                        placeholder="http://localhost:11434/v1"
                        className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-[#e8e8e8] placeholder-muted/50 focus:outline-none focus:border-accent/40 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted/70 uppercase tracking-wide mb-1 block">Model</label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={ollamaModel}
                          onChange={e => setOllamaModel(e.target.value)}
                          placeholder="llama3"
                          list="ollama-models"
                          className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-[#e8e8e8] placeholder-muted/50 focus:outline-none focus:border-accent/40 font-mono"
                        />
                        <datalist id="ollama-models">{detectedModels.map(m => <option key={m} value={m} />)}</datalist>
                        <button onClick={detectModels} disabled={detecting}
                          className="px-2 rounded-lg border border-border text-[10px] text-muted hover:text-[#ccc] transition-colors disabled:opacity-40 shrink-0">
                          {detecting ? '…' : '↺'}
                        </button>
                      </div>
                      {detectedModels.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {detectedModels.map(m => (
                            <button key={m} onClick={() => setOllamaModel(m)}
                              className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${m === ollamaModel ? 'bg-accent/10 border-accent/30 text-[#ddd]' : 'border-border text-muted hover:text-[#ccc]'}`}>
                              {m}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === 'about' && (
              <div className="space-y-4">
                <SectionTitle>About Mentis</SectionTitle>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
                    <span className="text-base font-bold text-purple-300">M</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[#e8e8e8]">Mentis Desktop</div>
                    <div className="text-xs text-muted">AI-powered coding assistant</div>
                  </div>
                </div>
                <div className="space-y-2 text-xs text-muted">
                  {[['Config','~/.mentisrc'],['Sessions','~/.mentis/sessions/'],['MCP','~/.mentis/mcp.json'],['Hooks','~/.mentis/settings.json'],['Context','~/.mentis/MENTIS.md']].map(([k,v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="w-16 shrink-0">{k}</span>
                      <code className="font-mono text-accent/70 text-[11px]">{v}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted hover:text-[#ccc] transition-colors">Cancel</button>
          <button onClick={save} disabled={saving || saved} className="px-5 py-2 rounded-lg bg-accent hover:bg-violet-600 disabled:opacity-60 text-white text-sm font-medium transition-colors">
            {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[10px] font-semibold text-muted uppercase tracking-wider pb-1 border-b border-border">{children}</h3>
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
