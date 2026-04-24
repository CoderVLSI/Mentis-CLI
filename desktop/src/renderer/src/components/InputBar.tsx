import { useState, useRef, useEffect, KeyboardEvent } from 'react'

interface Props {
  disabled:  boolean
  streaming: boolean
  onSend:    (text: string) => void
  onCancel:  () => void
}

const SLASH_COMMANDS = [
  { cmd: '/plan',   desc: 'Plan before building' },
  { cmd: '/build',  desc: 'Execute the agreed plan' },
  { cmd: '/status', desc: 'Show session info' },
  { cmd: '/clear',  desc: 'Clear chat history' },
  { cmd: '/mode',   desc: 'Toggle PLAN / BUILD mode' },
  { cmd: '/help',   desc: 'List commands' },
]

export default function InputBar({ disabled, streaming, onSend, onCancel }: Props) {
  const [text, setText]           = useState('')
  const [ddOpen, setDdOpen]       = useState(false)
  const [ddItems, setDdItems]     = useState(SLASH_COMMANDS)
  const [ddIdx, setDdIdx]         = useState(0)
  const textareaRef               = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 180) + 'px'
  }, [text])

  // Focus on mount
  useEffect(() => { textareaRef.current?.focus() }, [])

  const handleChange = (val: string) => {
    setText(val)
    if (val.startsWith('/')) {
      const q = val.toLowerCase()
      const filtered = SLASH_COMMANDS.filter(c => c.cmd.startsWith(q))
      setDdItems(filtered)
      setDdIdx(0)
      setDdOpen(filtered.length > 0)
    } else {
      setDdOpen(false)
    }
  }

  const acceptCmd = (cmd: string) => {
    setText(cmd + ' ')
    setDdOpen(false)
    textareaRef.current?.focus()
  }

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed)
    setText('')
    setDdOpen(false)
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (ddOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setDdIdx(i => Math.min(i + 1, ddItems.length - 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setDdIdx(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && ddItems.length)) {
        e.preventDefault()
        acceptCmd(ddItems[ddIdx]?.cmd || text)
        return
      }
      if (e.key === 'Escape') { setDdOpen(false); return }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!streaming) submit()
    }
  }

  return (
    <div className="relative px-4 pb-4 pt-2 border-t border-border bg-surface shrink-0">
      {/* Slash command dropdown */}
      {ddOpen && ddItems.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-1 bg-panel border border-border rounded-xl overflow-hidden shadow-2xl z-50">
          {ddItems.map((item, i) => (
            <button
              key={item.cmd}
              onClick={() => acceptCmd(item.cmd)}
              className={`flex items-center gap-3 w-full px-4 py-2.5 text-left text-xs transition-colors ${
                i === ddIdx ? 'bg-accent/10 text-[#ddd]' : 'text-muted hover:bg-white/[0.03]'
              }`}
            >
              <span className="font-mono text-purple-400 w-20 shrink-0">{item.cmd}</span>
              <span className="text-[#888]">{item.desc}</span>
            </button>
          ))}
        </div>
      )}

      <div className={`flex items-end gap-2 px-3 py-2 rounded-xl border transition-colors ${
        disabled ? 'border-border' : 'border-[#333] focus-within:border-accent/40'
      } bg-panel`}>
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
          {streaming ? (
            <button
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 text-[11px] font-medium transition-colors flex items-center gap-1.5"
            >
              <StopIcon /> Stop
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim()}
              className="px-3 py-1.5 rounded-lg bg-accent hover:bg-violet-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[11px] font-medium transition-colors flex items-center gap-1.5"
            >
              <SendIcon /> Send
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center mt-1.5 px-1">
        <span className="text-[10px] text-muted">
          {streaming ? 'Generating…' : 'Enter to send · Shift+Enter for newline · / for commands'}
        </span>
        {text.length > 0 && (
          <span className="text-[10px] text-muted">{text.length}</span>
        )}
      </div>
    </div>
  )
}

function SendIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  )
}

function StopIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
    </svg>
  )
}
