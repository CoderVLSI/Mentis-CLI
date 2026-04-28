import { useEffect, useRef, useState, useCallback } from 'react'
import { ChatMessage, FeedItem, SessionInfo, SessionMeta, ToolEvent, ToolSummaryMessage } from './types'
import Sidebar from './components/Sidebar'
import ChatPane from './components/ChatPane'
import ChatHeader from './components/ChatHeader'
import InputBar from './components/InputBar'
import TitleBar from './components/TitleBar'
import SettingsModal from './components/SettingsModal'
import BottomPanel, { PanelTab } from './components/BottomPanel'

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
  const [settingsOpen, setSettingsOpen]   = useState(false)
  const [panelVisible, setPanelVisible]   = useState(false)
  const [panelTab, setPanelTab]           = useState<PanelTab>('terminal')
  const [panelHeight, setPanelHeight]     = useState(280)
  const pendingMsgId                      = useRef<string | null>(null)

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

  const loadFeedFromHistory = (hist: Array<{ role: string; content?: unknown }>) => {
    const items: FeedItem[] = hist
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => {
        // content may be a ContentBlock[] when the message had images
        let text = ''
        let images: string[] | undefined
        if (typeof m.content === 'string') {
          text = m.content
        } else if (Array.isArray(m.content)) {
          text   = (m.content as Array<{ type: string; text?: string; data?: string; mediaType?: string }>)
            .filter(b => b.type === 'text').map(b => b.text ?? '').join('')
          images = (m.content as Array<{ type: string; data?: string; mediaType?: string }>)
            .filter(b => b.type === 'image' && b.data)
            .map(b => `data:${b.mediaType};base64,${b.data}`)
        }
        return { id: uid(), role: m.role as 'user' | 'assistant', content: text, timestamp: Date.now(), images }
      })
      .filter(m => m.content || m.images?.length)
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
      const id = pendingMsgId.current
      setStreaming(false); setThinking(false); pendingMsgId.current = null
      // Remove placeholder assistant messages that never received text
      // (these are pre-tool empty bubbles; ThinkingIndicator covers the waiting state)
      if (id) {
        setFeed(prev => {
          const msg = prev.find(m => m.id === id) as ChatMessage | undefined
          if (msg?.role === 'assistant' && !msg.content) return prev.filter(m => m.id !== id)
          return prev
        })
      }
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

    off.push(window.mentis.on('telegram_message', (data: unknown) => {
      const { text, fromName } = data as { text: string; fromName: string }
      setFeed(prev => [...prev, { id: uid(), role: 'user', content: text, timestamp: Date.now(), source: fromName }])
      setThinking(true)
    }))

    return () => off.forEach(fn => fn())
  }, [])

  const clearChat = useCallback(async () => {
    await window.mentis.clearHistory(); setFeed([]); setTools(new Map())
  }, [])

  // ── Slash command handler ──────────────────────────────────────────────────
  const sysMsg = (content: string) =>
    setFeed(prev => [...prev, { id: uid(), role: 'assistant' as const, content, timestamp: Date.now() }])

  const handleSlash = useCallback(async (cmd: string): Promise<boolean> => {
    const c = cmd.trim().toLowerCase()

    if (c === '/clear') {
      await clearChat()
      return true
    }
    if (c === '/plan' || c === '/build') {
      const next = c === '/plan' ? 'PLAN' : 'BUILD'
      await window.mentis.setMode(next)
      setSession(prev => ({ ...prev, mode: next }))
      sysMsg(`Switched to **${next} MODE**`)
      return true
    }
    if (c === '/mode') {
      const next = session.mode === 'PLAN' ? 'BUILD' : 'PLAN'
      await window.mentis.setMode(next)
      setSession(prev => ({ ...prev, mode: next }))
      sysMsg(`Switched to **${next} MODE**`)
      return true
    }
    if (c === '/status') {
      const s = await window.mentis.getSession()
      sysMsg(
        `**Session status**\n\n` +
        `- Mode: \`${s.mode}\`\n` +
        `- Session: \`${s.sessionId || 'new'}\`\n` +
        `- Messages: ${s.messageCount}\n` +
        `- Working dir: \`${s.cwd || 'not set'}\`\n` +
        `- Model: \`${model}\`\n` +
        `- Provider: \`${provider}\``
      )
      return true
    }
    if (c === '/help') {
      sysMsg(
        `**Available commands**\n\n` +
        `| Command | Description |\n` +
        `|---------|-------------|\n` +
        `| \`/plan\` | Switch to PLAN mode — design before building |\n` +
        `| \`/build\` | Switch to BUILD mode — execute the plan |\n` +
        `| \`/mode\` | Toggle between PLAN and BUILD |\n` +
        `| \`/status\` | Show session info |\n` +
        `| \`/clear\` | Clear chat history |\n` +
        `| \`/help\` | Show this message |`
      )
      return true
    }
    return false
  }, [session.mode, model, provider, clearChat])

  // ── Actions ────────────────────────────────────────────────────────────────
  const send = useCallback(async (text: string, images?: import('./components/InputBar').ImageAttachment[]) => {
    const t = text.trim()
    if (!t && (!images || images.length === 0) || streaming) return
    if (t.startsWith('/') && (!images || images.length === 0)) {
      const handled = await handleSlash(t)
      if (handled) return
    }
    const displayText = t || ''
    const previews    = images?.map(i => i.preview)
    setFeed(prev => [...prev, { id: uid(), role: 'user', content: displayText, timestamp: Date.now(), images: previews }])
    setThinking(true)
    const ipcImages = images?.map(({ base64, mediaType, name }) => ({ base64, mediaType, name }))
    await window.mentis.sendMessage(t || '', ipcImages)
  }, [streaming, handleSlash])

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

  // Panel toggles — Ctrl+` cycles terminal, Ctrl+Shift+` cycles browser
  const toggleTerminal = useCallback(() => {
    if (panelVisible && panelTab === 'terminal') { setPanelVisible(false) }
    else { setPanelVisible(true); setPanelTab('terminal') }
  }, [panelVisible, panelTab])

  const toggleBrowser = useCallback(() => {
    if (panelVisible && panelTab === 'browser') { setPanelVisible(false) }
    else { setPanelVisible(true); setPanelTab('browser') }
  }, [panelVisible, panelTab])

  const toggleFiles = useCallback(() => {
    if (panelVisible && panelTab === 'files') { setPanelVisible(false) }
    else { setPanelVisible(true); setPanelTab('files') }
  }, [panelVisible, panelTab])

  const insertPathIntoChat = useCallback((p: string) => {
    // Dispatch a custom event that InputBar can listen to for pre-filling text
    window.dispatchEvent(new CustomEvent('mentis:insert-text', { detail: p }))
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`' && !e.shiftKey && !e.altKey) { e.preventDefault(); toggleTerminal() }
      if (e.ctrlKey && e.key === '`' &&  e.shiftKey && !e.altKey) { e.preventDefault(); toggleBrowser() }
      if (e.ctrlKey && e.key === '`' &&  e.altKey)                { e.preventDefault(); toggleFiles() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleTerminal, toggleBrowser, toggleFiles])

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
        onToggleTerminal={toggleTerminal}
        onToggleBrowser={toggleBrowser}
        onToggleFiles={toggleFiles}
        mode={session.mode}
        panelVisible={panelVisible}
        panelTab={panelTab}
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
          onOpenSettings={() => setSettingsOpen(true)}
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
          <BottomPanel
            visible={panelVisible}
            tab={panelTab}
            height={panelHeight}
            cwd={session.cwd}
            onTabChange={setPanelTab}
            onHeightChange={setPanelHeight}
            onClose={() => setPanelVisible(false)}
            onInsertPath={insertPathIntoChat}
          />
          <InputBar
            disabled={streaming || thinking}
            streaming={streaming || thinking}
            model={model}
            provider={provider}
            planMode={session.mode === 'PLAN'}
            onSend={send}
            onCancel={cancel}
            onModelChange={changeModel}
            onProviderChange={changeProvider}
            onTogglePlanMode={toggleMode}
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
