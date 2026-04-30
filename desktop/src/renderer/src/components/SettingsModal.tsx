import { useState, useEffect, useRef } from 'react'
import type { Persona } from '../types'

interface Props {
  onClose: () => void
  onSaved: () => void
}

type Tab = 'general' | 'providers' | 'sync' | 'channels' | 'personas' | 'marketplace' | 'about'

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
    models: ['google/gemma-3-12b-it:free', 'meta-llama/llama-4-scout:free', 'deepseek/deepseek-r1:free', 'openai/gpt-4o', 'openai/gpt-4.1', 'anthropic/claude-opus-4', 'google/gemini-2.5-pro'],
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
  const [serperKey, setSerperKey]             = useState('')
  const [showSerper, setShowSerper]           = useState(false)
  const [saving, setSaving]                   = useState(false)
  const [saved, setSaved]                     = useState(false)
  const [syncInfo, setSyncInfo]               = useState<{ port: number; ips: string[]; token: string } | null>(null)
  const [tgToken, setTgToken]                 = useState('')
  const [tgAllowed, setTgAllowed]             = useState('')
  const [tgAutoApprove, setTgAutoApprove]     = useState(false)
  const [tgShowToken, setTgShowToken]         = useState(false)
  const [tgStatus, setTgStatus]               = useState<{ running: boolean; botUsername: string } | null>(null)
  const [tgSaving, setTgSaving]               = useState(false)

  useEffect(() => {
    window.mentis.getTelegramConfig().then(c => { setTgToken(c.botToken); setTgAllowed(c.allowedChatIds); setTgAutoApprove(c.autoApprove) })
    window.mentis.getTelegramStatus().then(s => setTgStatus(s))
    window.mentis.getSyncInfo().then(info => setSyncInfo(info as { port: number; ips: string[]; token: string }))
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
      const tools = (cfg.tools as Record<string, string>) || {}
      setSerperKey(tools.serperKey || '')
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
    await window.mentis.updateProviderSettings('tools', { serperKey })
    setSaving(false); setSaved(true); onSaved()
    setTimeout(() => { setSaved(false); onClose() }, 900)
  }

  const saveTelegram = async () => {
    setTgSaving(true)
    await window.mentis.setTelegramConfig({ botToken: tgToken, allowedChatIds: tgAllowed, autoApprove: tgAutoApprove })
    await new Promise(r => setTimeout(r, 800))
    const s = await window.mentis.getTelegramStatus()
    setTgStatus(s)
    setTgSaving(false)
  }

  const NAV: [Tab, string][] = [['general', 'General'], ['providers', 'Providers'], ['sync', 'Sync'], ['channels', 'Channels'], ['personas', 'Personas'], ['marketplace', 'Marketplace'], ['about', 'About']]

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

                <SectionTitle>Web Search</SectionTitle>
                <div className="rounded-xl border border-border bg-[#0d0d0d] p-4 space-y-2">
                  <div>
                    <div className="text-[12px] font-medium text-[#ccc]">Serper API Key</div>
                    <div className="text-[10px] text-muted mt-0.5">Gives the agent real-time Google search — get a free key at serper.dev</div>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type={showSerper ? 'text' : 'password'}
                      value={serperKey}
                      onChange={e => setSerperKey(e.target.value)}
                      placeholder="your-serper-api-key"
                      className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-[#e8e8e8] placeholder-muted/50 focus:outline-none focus:border-accent/40 font-mono"
                    />
                    <button onClick={() => setShowSerper(p => !p)}
                      className="px-2 rounded-lg border border-border text-[10px] text-muted hover:text-[#ccc] transition-colors shrink-0">
                      {showSerper ? 'Hide' : 'Show'}
                    </button>
                  </div>
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

            {tab === 'sync' && (
              <div className="space-y-4">
                <SectionTitle>Mobile Sync</SectionTitle>
                <p className="text-[11px] text-muted -mt-2">Connect the Mentis mobile app to this desktop via Wi-Fi.</p>

                {syncInfo ? (
                  <>
                    {/* Pairing token */}
                    <div className="bg-[#0d0d0d] border border-border rounded-xl p-4 space-y-2">
                      <div className="text-[10px] text-muted uppercase tracking-wider">Pairing Token</div>
                      <div className="text-3xl font-mono font-bold text-purple-300 tracking-[0.3em]">{syncInfo.token}</div>
                      <div className="text-[11px] text-muted">Enter this in the mobile app under Settings → Pairing Token</div>
                    </div>

                    {/* IP addresses */}
                    <div className="space-y-1.5">
                      <div className="text-[10px] text-muted uppercase tracking-wider">Desktop IP : Port</div>
                      {syncInfo.ips.length === 0 ? (
                        <p className="text-[11px] text-muted">No network interfaces found.</p>
                      ) : syncInfo.ips.map(ip => (
                        <div key={ip} className="flex items-center gap-2 bg-[#111] border border-border rounded-lg px-3 py-2">
                          <code className="text-[13px] font-mono text-[#c8b3f5] flex-1">{ip}:{syncInfo.port}</code>
                        </div>
                      ))}
                    </div>

                    <p className="text-[11px] text-muted">Make sure your phone is on the same Wi-Fi network. The token resets each time Mentis Desktop restarts.</p>
                  </>
                ) : (
                  <div className="text-[12px] text-muted">Loading sync info…</div>
                )}
              </div>
            )}

            {tab === 'channels' && (
              <div className="space-y-4">
                <SectionTitle>Telegram Bot</SectionTitle>
                <p className="text-[11px] text-muted -mt-2">
                  Chat with your Mentis agent directly from Telegram. The agent uses your active AI provider and working directory.
                </p>

                {/* Status badge */}
                {tgStatus && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] ${
                    tgStatus.running
                      ? 'bg-green-900/20 border-green-800/40 text-green-400'
                      : 'bg-[#111] border-border text-muted'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tgStatus.running ? 'bg-green-400' : 'bg-muted/40'}`} />
                    {tgStatus.running
                      ? `Connected as @${tgStatus.botUsername}`
                      : 'Not connected — enter a bot token below'}
                  </div>
                )}

                {/* Setup steps */}
                <div className="rounded-xl border border-border bg-[#0d0d0d] p-4 space-y-2">
                  <div className="text-[11px] font-medium text-[#ccc] mb-2">Quick setup</div>
                  {[
                    ['1', 'Open Telegram and search for', '@BotFather'],
                    ['2', 'Send', '/newbot', 'and follow the prompts'],
                    ['3', 'Copy the bot token it gives you'],
                    ['4', 'To find your Chat ID, message', '@userinfobot'],
                  ].map(([n, ...parts]) => (
                    <div key={n} className="flex items-start gap-2 text-[11px] text-muted">
                      <span className="w-4 h-4 rounded-full bg-accent/20 text-accent text-[9px] flex items-center justify-center shrink-0 mt-0.5">{n}</span>
                      <span>{parts.map((p, i) => p.startsWith('@') || p.startsWith('/') ? <code key={i} className="font-mono text-accent/80 text-[10px] bg-[#111] px-1 rounded">{p}</code> : p + ' ')}</span>
                    </div>
                  ))}
                </div>

                {/* Config fields */}
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-muted/70 uppercase tracking-wide mb-1.5 block">Bot Token</label>
                    <div className="flex gap-1.5">
                      <input
                        type={tgShowToken ? 'text' : 'password'}
                        value={tgToken}
                        onChange={e => setTgToken(e.target.value)}
                        placeholder="1234567890:ABCdef..."
                        className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-[#e8e8e8] placeholder-muted/50 focus:outline-none focus:border-accent/40 font-mono"
                      />
                      <button onClick={() => setTgShowToken(p => !p)}
                        className="px-2 rounded-lg border border-border text-[10px] text-muted hover:text-[#ccc] transition-colors shrink-0">
                        {tgShowToken ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-muted/70 uppercase tracking-wide mb-1.5 block">Allowed Chat IDs <span className="normal-case text-muted/50">(comma-separated, leave empty to allow anyone)</span></label>
                    <input
                      type="text"
                      value={tgAllowed}
                      onChange={e => setTgAllowed(e.target.value)}
                      placeholder="123456789, 987654321"
                      className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-[#e8e8e8] placeholder-muted/50 focus:outline-none focus:border-accent/40 font-mono"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-[#0d0d0d]">
                    <div>
                      <div className="text-[12px] font-medium text-[#ccc]">Auto-approve tool calls</div>
                      <div className="text-[10px] text-muted mt-0.5">Allow the agent to run shell commands and write files without asking. Enable only if you trust all allowed chat IDs.</div>
                    </div>
                    <button
                      onClick={() => setTgAutoApprove(p => !p)}
                      className={`ml-4 w-9 h-5 rounded-full transition-colors shrink-0 relative ${tgAutoApprove ? 'bg-accent' : 'bg-[#333]'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${tgAutoApprove ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={saveTelegram}
                    disabled={tgSaving}
                    className="px-4 py-2 rounded-lg bg-accent hover:bg-violet-600 disabled:opacity-60 text-white text-[12px] font-medium transition-colors"
                  >
                    {tgSaving ? 'Connecting…' : tgToken ? 'Save & Connect' : 'Save'}
                  </button>
                  {tgStatus?.running && (
                    <button
                      onClick={async () => {
                        await window.mentis.stopTelegram()
                        setTgStatus({ running: false, botUsername: '' })
                      }}
                      className="px-4 py-2 rounded-lg border border-red-800/50 text-red-400/70 hover:text-red-400 text-[12px] transition-colors"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            )}

            {tab === 'personas'    && <PersonasTab />}
            {tab === 'marketplace' && <MarketplaceTab />}

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

// ── Agent Personas ────────────────────────────────────────────────────────────

const DEFAULT_PERSONAS: Persona[] = [
  { id: 'default',  name: 'Default',       prompt: '',                                                                                     createdAt: 0 },
  { id: 'concise',  name: 'Concise',       prompt: 'Be extremely concise. Prefer bullet points. No unnecessary explanation.',              createdAt: 0 },
  { id: 'teacher',  name: 'Teacher',       prompt: 'Explain every decision as if teaching a junior developer. Be thorough and educational.', createdAt: 0 },
  { id: 'security', name: 'Security',      prompt: 'Always think about security implications first. Flag any potential vulnerabilities.',   createdAt: 0 },
  { id: 'rubber',   name: 'Rubber Duck',   prompt: 'Do not write code. Only ask clarifying questions and help me think through the problem.', createdAt: 0 },
]

function PersonasTab() {
  const [personas, setPersonas]   = useState<Persona[]>([])
  const [active, setActive]       = useState('')
  const [editing, setEditing]     = useState<Persona | null>(null)
  const [newName, setNewName]     = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [saved, setSaved]         = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.mentis.listPersonas().then(list => setPersonas(list.length ? list : DEFAULT_PERSONAS))
    window.mentis.activePersona().then(setActive)
  }, [])

  const apply = async (p: Persona) => {
    await window.mentis.applyPersona(p.prompt)
    setActive(p.id)
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  const save = async (updated: Persona[]) => {
    setPersonas(updated)
    await window.mentis.savePersonas(updated)
  }

  const startCreate = () => {
    setEditing({ id: crypto.randomUUID(), name: '', prompt: '', createdAt: Date.now() })
    setNewName(''); setNewPrompt('')
    setTimeout(() => nameRef.current?.focus(), 50)
  }

  const confirmCreate = async () => {
    if (!newName.trim()) return
    const p: Persona = { id: crypto.randomUUID(), name: newName.trim(), prompt: newPrompt.trim(), createdAt: Date.now() }
    await save([...personas, p])
    setEditing(null)
  }

  const del = async (id: string) => {
    const updated = personas.filter(p => p.id !== id)
    await save(updated)
    if (active === id) { await window.mentis.applyPersona(''); setActive('') }
  }

  return (
    <div className="space-y-3">
      <SectionTitle>Agent Personas</SectionTitle>
      <p className="text-[11px] text-muted leading-relaxed">
        Personas inject a custom system prompt that shapes how the agent behaves.
        {saved && <span className="ml-2 text-green-400">✓ Applied</span>}
      </p>
      <div className="space-y-1.5">
        {personas.map(p => (
          <div key={p.id} className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-colors cursor-pointer ${
            active === p.id ? 'bg-accent/10 border-accent/40' : 'bg-surface border-border hover:border-accent/20'
          }`} onClick={() => apply(p)}>
            <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${active === p.id ? 'bg-accent' : 'bg-muted/30'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium text-[#ddd]">{p.name}</span>
                {active === p.id && <span className="text-[9px] text-accent font-mono">ACTIVE</span>}
              </div>
              {p.prompt ? (
                <p className="text-[11px] text-muted mt-0.5 truncate">{p.prompt}</p>
              ) : (
                <p className="text-[11px] text-muted/40 mt-0.5 italic">No custom prompt — standard Mentis behaviour</p>
              )}
            </div>
            {p.createdAt > 0 && (
              <button onClick={e => { e.stopPropagation(); del(p.id) }}
                className="shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/20 text-muted/40 hover:text-red-400 transition-colors text-[10px]">✕</button>
            )}
          </div>
        ))}
      </div>

      {editing ? (
        <div className="p-3 rounded-xl border border-accent/30 bg-accent/5 space-y-2">
          <input ref={nameRef} value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Persona name…"
            className="w-full bg-transparent text-[12px] text-[#ddd] placeholder-muted/40 outline-none border-b border-border pb-1" />
          <textarea value={newPrompt} onChange={e => setNewPrompt(e.target.value)}
            placeholder="System prompt (leave blank to inherit default)…"
            rows={3}
            className="w-full bg-transparent text-[11px] text-[#ccc] placeholder-muted/40 outline-none resize-none" />
          <div className="flex gap-2">
            <button onClick={confirmCreate} className="px-3 py-1 rounded-lg text-[11px] bg-accent/20 text-purple-300 hover:bg-accent/30 transition-colors">Save</button>
            <button onClick={() => setEditing(null)} className="px-3 py-1 rounded-lg text-[11px] text-muted hover:text-[#ccc] transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={startCreate}
          className="w-full py-2 rounded-xl border border-dashed border-border text-[11px] text-muted hover:text-[#ccc] hover:border-accent/30 transition-colors">
          + Create persona
        </button>
      )}
    </div>
  )
}

// ── MCP Marketplace ───────────────────────────────────────────────────────────

const CATALOG = [
  { name: 'filesystem',  label: 'Filesystem',     desc: 'Read/write local files outside the CWD. Official Anthropic server.', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'], tag: 'Official' },
  { name: 'github',      label: 'GitHub',          desc: 'Search repos, read files, create issues and PRs via GitHub API.',      command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'],            tag: 'Official' },
  { name: 'fetch',       label: 'Fetch / Browser', desc: 'Fetch any URL and return the page content as markdown.',              command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'],             tag: 'Official' },
  { name: 'memory',      label: 'Memory',          desc: 'Persistent knowledge graph — the agent remembers facts across sessions.', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'],          tag: 'Official' },
  { name: 'playwright',  label: 'Playwright',      desc: 'Control a real browser — navigate, screenshot, fill forms, scrape.',  command: 'npx', args: ['-y', '@executeautomation/playwright-mcp-server'],    tag: 'Community' },
  { name: 'postgres',    label: 'PostgreSQL',       desc: 'Query a Postgres database with natural language.',                    command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres'],         tag: 'Official' },
  { name: 'slack',       label: 'Slack',            desc: 'Read channels, post messages and search Slack workspaces.',          command: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'],             tag: 'Official' },
  { name: 'linear',      label: 'Linear',           desc: 'Create, update and search Linear issues from the agent.',            command: 'npx', args: ['-y', '@linear/linear-mcp-server'],                     tag: 'Community' },
  { name: 'brave-search',label: 'Brave Search',     desc: 'Privacy-focused web search — alternative to Serper.',               command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'],    tag: 'Official' },
  { name: 'puppeteer',   label: 'Puppeteer',        desc: 'Headless Chrome automation — scrape, screenshot, generate PDFs.',    command: 'npx', args: ['-y', '@modelcontextprotocol/server-puppeteer'],       tag: 'Official' },
]

function MarketplaceTab() {
  const [installed, setInstalled] = useState<string[]>([])
  const [busy, setBusy]           = useState<string | null>(null)
  const [status, setStatus]       = useState<Record<string, 'ok' | 'err'>>({})

  useEffect(() => {
    window.mentis.listMcp().then(list => setInstalled(list.map(s => s.name)))
  }, [])

  const toggle = async (item: typeof CATALOG[0]) => {
    setBusy(item.name)
    try {
      if (installed.includes(item.name)) {
        await window.mentis.uninstallMcp(item.name)
        setInstalled(prev => prev.filter(n => n !== item.name))
        setStatus(prev => ({ ...prev, [item.name]: 'ok' }))
      } else {
        const res = await window.mentis.installMcp({ name: item.name, command: item.command, args: item.args })
        if (res.ok) { setInstalled(prev => [...prev, item.name]); setStatus(prev => ({ ...prev, [item.name]: 'ok' })) }
        else setStatus(prev => ({ ...prev, [item.name]: 'err' }))
      }
    } finally { setBusy(null) }
  }

  return (
    <div className="space-y-3">
      <SectionTitle>MCP Marketplace</SectionTitle>
      <p className="text-[11px] text-muted leading-relaxed">
        Install Model Context Protocol servers to give the agent new capabilities. Servers are saved to <code className="font-mono text-accent/70">~/.mentis/mcp.json</code>.
      </p>
      <div className="grid grid-cols-1 gap-2">
        {CATALOG.map(item => {
          const isInstalled = installed.includes(item.name)
          const isBusy      = busy === item.name
          const st          = status[item.name]
          return (
            <div key={item.name} className="flex items-start gap-3 p-3 rounded-xl bg-surface border border-border hover:border-accent/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[12px] font-medium text-[#ddd]">{item.label}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${item.tag === 'Official' ? 'bg-accent/15 text-purple-300' : 'bg-white/5 text-muted'}`}>{item.tag}</span>
                  {st === 'ok' && <span className="text-[9px] text-green-400">✓</span>}
                  {st === 'err' && <span className="text-[9px] text-red-400">✗ error</span>}
                </div>
                <p className="text-[11px] text-muted leading-relaxed">{item.desc}</p>
              </div>
              <button
                onClick={() => toggle(item)}
                disabled={isBusy}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                  isInstalled
                    ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                    : 'bg-accent/15 text-purple-300 hover:bg-accent/25 border border-accent/25'
                } disabled:opacity-50`}
              >
                {isBusy ? '…' : isInstalled ? 'Remove' : 'Install'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
