import { useEffect, useRef, useState, useCallback } from 'react'
import { ChatMessage, FeedItem, SessionInfo, SessionMeta, ToolEvent, ToolSummaryMessage } from './types'
import Sidebar from './components/Sidebar'
import ChatPane from './components/ChatPane'
import ChatHeader from './components/ChatHeader'
import InputBar from './components/InputBar'
import TitleBar from './components/TitleBar'
import SettingsModal from './components/SettingsModal'

let _id = 0
const uid = () => String(++_id)

export default function App() {
  const [feed, setFeed]             = useState<FeedItem[]>([])
  const [tools, setTools]           = useState<Map<string, ToolEvent>>(new Map())
  const [session, setSession]       = useState<SessionInfo>({ mode: 'BUILD', cwd: '', messageCount: 0 })
  const [sessions, setSessions]     = useState<SessionMeta[]>([])
  const [streaming, setStreaming]   = useState(false)
  const [thinking, setThinking]     = useState(false)
  const [model, setModelState]      = useState('llama3')
  const [provider, setProviderState] = useState('ollama')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const pendingMsgId                = useRef<string | null>(null)

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    window.mentis.getSession().then(s => {
      setSession(s)
    })
    window.mentis.listSessions().then(setSessions)
    window.mentis.getHistory().then(loadFeedFromHistory)
    window.mentis.getConfig().then((cfg) => {
      // ~/.mentisrc CLI format: defaultProvider + flat keys cfg[provider].model
      const provider = (cfg.defaultProvider as string) || 'ollama'
      const p        = (cfg[provider] as Record<string, string>) || {}
      setProviderState(provider)
      setModelState(p.model || (provider === 'anthropic' ? 'claude-sonnet-4-6' : 'llama3'))
    })
  }, [])

  const loadFeedFromHistory = (hist: Array<{ role: string; content?: string }>) => {
    const items: FeedItem[] = hist
      .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content)
      .map(m => ({ id: uid(), role: m.role as 'user' | 'assistant', content: m.content!, timestamp: Date.now() }))
    setFeed(items)
  }

  // ── Engine events ──────────────────────────────────────────────────────────
  useEffect(() => {
    const off: Array<() => void> = []

    off.push(window.mentis.on('thinking', () => setThinking(true)))

    off.push(window.mentis.on('message_start', () => {
      const id = uid()
      pendingMsgId.current = id
      setStreaming(true); setThinking(false)
      setFeed(prev => [...prev, { id, role: 'assistant', content: '', timestamp: Date.now() }])
    }))

    off.push(window.mentis.on('message_chunk', (data: unknown) => {
      const { text } = data as { text: string }
      setFeed(prev => prev.map(m => m.id === pendingMsgId.current ? { ...m, content: (m as ChatMessage).content + text } : m))
    }))

    off.push(window.mentis.on('message_end', () => {
      setStreaming(false); setThinking(false); pendingMsgId.current = null
    }))

    off.push(window.mentis.on('tool_summary', (data: unknown) => {
      const d = data as { names: string[]; count: number }
      const item: ToolSummaryMessage = { id: uid(), type: 'tool_summary', names: d.names, count: d.count, timestamp: Date.now() }
      setFeed(prev => [...prev, item])
    }))

    off.push(window.mentis.on('tool_start', (data: unknown) => {
      const d = data as { id: string; name: string; args: Record<string, unknown> }
      setTools(prev => { const n = new Map(prev); n.set(d.id, { id: d.id, name: d.name, args: d.args, status: 'pending', needsApproval: false }); return n })
    }))

    off.push(window.mentis.on('tool_result', (data: unknown) => {
      const d = data as { id: string; result: string }
      setTools(prev => { const n = new Map(prev); const e = n.get(d.id); if (e) n.set(d.id, { ...e, result: d.result, status: 'done' }); return n })
    }))

    off.push(window.mentis.on('approval_needed', (data: unknown) => {
      const d = data as { id: string; name: string; args: Record<string, unknown>; preview?: string }
      setTools(prev => {
        const n = new Map(prev)
        const e = n.get(d.id) || { id: d.id, name: d.name, args: d.args, status: 'pending' as const, needsApproval: true }
        n.set(d.id, { ...e, needsApproval: true, status: 'pending', preview: d.preview })
        return n
      })
    }))

    off.push(window.mentis.on('approval_done', (data: unknown) => {
      const d = data as { id: string; approved: boolean }
      setTools(prev => { const n = new Map(prev); const e = n.get(d.id); if (e) n.set(d.id, { ...e, status: d.approved ? 'approved' : 'denied' }); return n })
    }))

    off.push(window.mentis.on('error', (data: unknown) => {
      const { message } = data as { message: string }
      setStreaming(false); setThinking(false)
      setFeed(prev => [...prev, { id: uid(), role: 'assistant', content: `⚠ ${message}`, timestamp: Date.now() }])
    }))

    off.push(window.mentis.on('session_update', (data: unknown) => {
      const d = data as { messageCount: number; mode: 'PLAN' | 'BUILD'; model: string; cwd: string; sessionId: string }
      setSession(prev => ({ ...prev, mode: d.mode, cwd: d.cwd, messageCount: d.messageCount, model: d.model, sessionId: d.sessionId }))
      setModelState(d.model)
    }))

    off.push(window.mentis.on('sessions_changed', (data: unknown) => {
      const { sessions: s } = data as { sessions: SessionMeta[] }
      setSessions(s)
    }))

    return () => off.forEach(fn => fn())
  }, [])

  // ── Actions ────────────────────────────────────────────────────────────────
  const send = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return
    setFeed(prev => [...prev, { id: uid(), role: 'user', content: text.trim(), timestamp: Date.now() }])
    setThinking(true)
    await window.mentis.sendMessage(text.trim())
  }, [streaming])

  const cancel = useCallback(() => {
    window.mentis.cancelChat(); setStreaming(false); setThinking(false)
  }, [])

  const newChat = useCallback(async () => {
    await window.mentis.newSession()
    setFeed([]); setTools(new Map()); setThinking(false); setStreaming(false)
    const s = await window.mentis.getSession(); setSession(s)
  }, [])

  const switchSession = useCallback(async (id: string) => {
    const res = await window.mentis.loadSession(id)
    if (res.ok) {
      loadFeedFromHistory(res.history)
      setTools(new Map())
      const s = await window.mentis.getSession(); setSession(s)
    }
  }, [])

  const deleteSession = useCallback(async (id: string) => {
    await window.mentis.deleteSession(id)
    const s = await window.mentis.getSession(); setSession(s)
    const h = await window.mentis.getHistory(); loadFeedFromHistory(h)
  }, [])

  const clearChat = useCallback(async () => {
    await window.mentis.clearHistory(); setFeed([]); setTools(new Map())
  }, [])

  const approve = useCallback((id: string, approved: boolean) => {
    window.mentis.respondApproval(id, approved)
  }, [])

  const pickFolder = useCallback(async () => {
    const folder = await window.mentis.pickFolder()
    if (folder) { await window.mentis.setCwd(folder); setSession(prev => ({ ...prev, cwd: folder })) }
  }, [])

  const toggleMode = useCallback(async () => {
    const next = session.mode === 'PLAN' ? 'BUILD' : 'PLAN'
    await window.mentis.setMode(next); setSession(prev => ({ ...prev, mode: next }))
  }, [session.mode])

  const changeModel = useCallback(async (m: string) => {
    setModelState(m); await window.mentis.setModel(m)
  }, [])

  const currentSessionTitle = sessions.find(s => s.id === session.sessionId)?.title || 'New chat'

  const renameSession = useCallback(async (title: string) => {
    if (!session.sessionId) return
    await window.mentis.renameSession(session.sessionId, title)
  }, [session.sessionId])

  const exportChat = useCallback(() => {
    const lines: string[] = [`# ${currentSessionTitle}\n`]
    for (const item of feed) {
      if ((item as ToolSummaryMessage).type === 'tool_summary') continue
      const msg = item as ChatMessage
      lines.push(msg.role === 'user' ? `**You:** ${msg.content}` : `**Mentis:** ${msg.content}`)
      lines.push('')
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${currentSessionTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`
    a.click()
  }, [feed, currentSessionTitle])

  const forkSession = useCallback(async () => {
    const res = await window.mentis.newSession()
    if (!res.ok) return
    // Copy current feed messages into display; history already in engine after fork
    setTools(new Map())
    const s = await window.mentis.getSession(); setSession(s)
  }, [])

  const changeProvider = useCallback(async (p: string) => {
    setProviderState(p); await window.mentis.setProvider(p)
    const cfg   = await window.mentis.getConfig()
    const pCfg  = (cfg[p] as Record<string, string>) || {}
    setModelState(pCfg.model || (p === 'anthropic' ? 'claude-sonnet-4-6' : 'llama3'))
  }, [])

  const onSettingsSaved = useCallback(async () => {
    const cfg  = await window.mentis.getConfig()
    const p    = (cfg.defaultProvider as string) || 'ollama'
    const pCfg = (cfg[p] as Record<string, string>) || {}
    setProviderState(p)
    setModelState(pCfg.model || (p === 'anthropic' ? 'claude-sonnet-4-6' : 'llama3'))
  }, [])

  return (
    <>
    <div className="flex flex-col h-full bg-surface text-[#e8e8e8] select-none">
      <TitleBar
        onMinimize={window.mentis.minimize}
        onMaximize={window.mentis.maximize}
        onClose={window.mentis.close}
        onNewChat={newChat}
        onPickFolder={pickFolder}
        onExportChat={exportChat}
        onToggleMode={toggleMode}
        onClearChat={clearChat}
        onOpenSettings={() => setSettingsOpen(true)}
        mode={session.mode}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          session={session}
          sessions={sessions}
          onNew={newChat}
          onSwitch={switchSession}
          onDelete={deleteSession}
          onPickFolder={pickFolder}
          onToggleMode={toggleMode}
          onClear={clearChat}
        />
        <div className="flex flex-col flex-1 overflow-hidden">
          <ChatHeader
            session={session}
            sessionTitle={currentSessionTitle}
            onRename={renameSession}
            onExport={exportChat}
            onFork={forkSession}
            onClear={clearChat}
          />
          <ChatPane feed={feed} tools={tools} thinking={thinking} streaming={streaming} onApprove={approve} />
          <InputBar
            disabled={streaming || thinking}
            streaming={streaming || thinking}
            model={model}
            provider={provider}
            onSend={send}
            onCancel={cancel}
            onModelChange={changeModel}
            onProviderChange={changeProvider}
          />
        </div>
      </div>
    </div>

    {settingsOpen && (
      <SettingsModal
        onClose={() => setSettingsOpen(false)}
        onSaved={onSettingsSaved}
      />
    )}
    </>
  )
}
