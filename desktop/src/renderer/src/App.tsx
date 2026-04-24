import { useEffect, useRef, useState, useCallback } from 'react'
import { ChatMessage, SessionInfo, ToolEvent } from './types'
import Sidebar from './components/Sidebar'
import ChatPane from './components/ChatPane'
import InputBar from './components/InputBar'
import TitleBar from './components/TitleBar'

let _msgId = 0
const uid = () => String(++_msgId)

export default function App() {
  const [messages, setMessages]       = useState<ChatMessage[]>([])
  const [tools, setTools]             = useState<Map<string, ToolEvent>>(new Map())
  const [session, setSession]         = useState<SessionInfo>({ mode: 'BUILD', cwd: '', messageCount: 0 })
  const [streaming, setStreaming]     = useState(false)
  const [thinking, setThinking]       = useState(false)
  const pendingMsgId                  = useRef<string | null>(null)

  // Load initial session + history
  useEffect(() => {
    window.mentis.getSession().then(setSession)
    window.mentis.getHistory().then((hist) => {
      const msgs: ChatMessage[] = hist
        .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content)
        .map(m => ({
          id: uid(),
          role: m.role as 'user' | 'assistant',
          content: m.content!,
          timestamp: Date.now()
        }))
      setMessages(msgs)
    })
  }, [])

  // Subscribe to engine events
  useEffect(() => {
    const off: Array<() => void> = []

    off.push(window.mentis.on('thinking', () => {
      setThinking(true)
    }))

    off.push(window.mentis.on('message_start', () => {
      const id = uid()
      pendingMsgId.current = id
      setStreaming(true)
      setThinking(false)
      setMessages(prev => [...prev, { id, role: 'assistant', content: '', timestamp: Date.now() }])
    }))

    off.push(window.mentis.on('message_chunk', (data: unknown) => {
      const { text } = data as { text: string }
      setMessages(prev => prev.map(m =>
        m.id === pendingMsgId.current ? { ...m, content: m.content + text } : m
      ))
    }))

    off.push(window.mentis.on('message_end', () => {
      setStreaming(false)
      setThinking(false)
      pendingMsgId.current = null
    }))

    off.push(window.mentis.on('tool_start', (data: unknown) => {
      const d = data as { id: string; name: string; args: Record<string, unknown> }
      setTools(prev => {
        const next = new Map(prev)
        next.set(d.id, { id: d.id, name: d.name, args: d.args, status: 'pending', needsApproval: false })
        return next
      })
    }))

    off.push(window.mentis.on('tool_result', (data: unknown) => {
      const d = data as { id: string; name: string; result: string }
      setTools(prev => {
        const next = new Map(prev)
        const existing = next.get(d.id)
        if (existing) next.set(d.id, { ...existing, result: d.result, status: 'done' })
        return next
      })
    }))

    off.push(window.mentis.on('approval_needed', (data: unknown) => {
      const d = data as { id: string; name: string; args: Record<string, unknown>; preview?: string }
      setTools(prev => {
        const next = new Map(prev)
        const existing = next.get(d.id) || { id: d.id, name: d.name, args: d.args, status: 'pending' as const, needsApproval: true }
        next.set(d.id, { ...existing, needsApproval: true, status: 'pending', preview: d.preview })
        return next
      })
    }))

    off.push(window.mentis.on('approval_done', (data: unknown) => {
      const d = data as { id: string; approved: boolean }
      setTools(prev => {
        const next = new Map(prev)
        const existing = next.get(d.id)
        if (existing) next.set(d.id, { ...existing, status: d.approved ? 'approved' : 'denied' })
        return next
      })
    }))

    off.push(window.mentis.on('error', (data: unknown) => {
      const { message } = data as { message: string }
      setStreaming(false)
      setThinking(false)
      setMessages(prev => [...prev, {
        id: uid(), role: 'assistant', content: `⚠ ${message}`, timestamp: Date.now()
      }])
    }))

    off.push(window.mentis.on('session_update', (data: unknown) => {
      const d = data as { messageCount: number; mode: 'PLAN' | 'BUILD'; model: string; cwd: string }
      setSession({ mode: d.mode, cwd: d.cwd, messageCount: d.messageCount, model: d.model })
    }))

    return () => off.forEach(fn => fn())
  }, [])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || streaming) return
    setMessages(prev => [...prev, { id: uid(), role: 'user', content: trimmed, timestamp: Date.now() }])
    setThinking(true)
    await window.mentis.sendMessage(trimmed)
  }, [streaming])

  const cancel = useCallback(() => {
    window.mentis.cancelChat()
    setStreaming(false)
    setThinking(false)
  }, [])

  const clearChat = useCallback(async () => {
    await window.mentis.clearHistory()
    setMessages([])
    setTools(new Map())
  }, [])

  const approve = useCallback((id: string, approved: boolean) => {
    window.mentis.respondApproval(id, approved)
  }, [])

  const pickFolder = useCallback(async () => {
    const folder = await window.mentis.pickFolder()
    if (folder) {
      await window.mentis.setCwd(folder)
      setSession(prev => ({ ...prev, cwd: folder }))
    }
  }, [])

  const toggleMode = useCallback(async () => {
    const next = session.mode === 'PLAN' ? 'BUILD' : 'PLAN'
    await window.mentis.setMode(next)
    setSession(prev => ({ ...prev, mode: next }))
  }, [session.mode])

  return (
    <div className="flex flex-col h-full bg-surface text-[#e8e8e8] select-none">
      <TitleBar onMinimize={window.mentis.minimize} onMaximize={window.mentis.maximize} onClose={window.mentis.close} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          session={session}
          onPickFolder={pickFolder}
          onToggleMode={toggleMode}
          onClear={clearChat}
        />

        <div className="flex flex-col flex-1 overflow-hidden">
          <ChatPane
            messages={messages}
            tools={tools}
            thinking={thinking}
            streaming={streaming}
            onApprove={approve}
          />
          <InputBar
            disabled={streaming || thinking}
            onSend={send}
            onCancel={cancel}
            streaming={streaming || thinking}
          />
        </div>
      </div>
    </div>
  )
}
