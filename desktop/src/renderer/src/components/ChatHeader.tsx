import { useState, useRef, useEffect } from 'react'
import { SessionInfo } from '../types'

interface Props {
  session:        SessionInfo
  sessionTitle:   string
  onRename:       (title: string) => void
  onExport:       () => void
  onFork:         () => void
  onClear:        () => void
}

export default function ChatHeader({ session, sessionTitle, onRename, onExport, onFork, onClear }: Props) {
  const [menuOpen, setMenuOpen]   = useState(false)
  const [editing,  setEditing]    = useState(false)
  const [draft,    setDraft]      = useState(sessionTitle)
  const menuRef                   = useRef<HTMLDivElement>(null)
  const inputRef                  = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(sessionTitle) }, [sessionTitle])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const commitRename = () => {
    const t = draft.trim()
    if (t && t !== sessionTitle) onRename(t)
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border bg-[#0c0c0c] shrink-0">
      {/* Title */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraft(sessionTitle); setEditing(false) } }}
            className="bg-transparent text-[13px] font-medium text-[#e0e0e0] outline-none border-b border-accent/50 pb-0.5 flex-1 min-w-0"
          />
        ) : (
          <button
            onDoubleClick={() => setEditing(true)}
            className="text-[13px] font-medium text-[#e0e0e0] truncate hover:text-white transition-colors cursor-default"
            title="Double-click to rename"
          >
            {sessionTitle || 'New chat'}
          </button>
        )}

        {/* Mode badge — Mentis style */}
        <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold tracking-wider border ${
          session.mode === 'PLAN'
            ? 'bg-accent/10 text-purple-400 border-accent/30'
            : 'bg-green-900/30 text-green-400 border-green-700/40'
        }`}>
          {session.mode}
        </span>

        {/* Source badge for CLI sessions */}
        {(session as unknown as { source?: string }).source === 'cli' && (
          <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded font-mono bg-[#1a1a1a] text-muted border border-border">CLI</span>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Fork */}
        <HeaderBtn onClick={onFork} title="Fork session">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="6" cy="6" r="3"/>
            <path d="M18 9a9 9 0 0 1-9 9"/>
          </svg>
        </HeaderBtn>

        {/* Export */}
        <HeaderBtn onClick={onExport} title="Export as Markdown">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </HeaderBtn>

        {/* ··· menu */}
        <div className="relative" ref={menuRef}>
          <HeaderBtn onClick={() => setMenuOpen(o => !o)} title="More options">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5"  cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
            </svg>
          </HeaderBtn>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-panel border border-border rounded-xl overflow-hidden shadow-2xl z-50 min-w-[160px]">
              <MenuItem icon="✏" label="Rename" onClick={() => { setEditing(true); setMenuOpen(false) }} />
              <MenuItem icon="⎇" label="Fork session" onClick={() => { onFork(); setMenuOpen(false) }} />
              <MenuItem icon="↓" label="Export markdown" onClick={() => { onExport(); setMenuOpen(false) }} />
              <div className="border-t border-border my-1" />
              <MenuItem icon="✕" label="Clear chat" onClick={() => { onClear(); setMenuOpen(false) }} danger />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function HeaderBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-[#ccc] hover:bg-white/[0.05] transition-colors"
    >
      {children}
    </button>
  )
}

function MenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 w-full px-3 py-2 text-left text-[11px] transition-colors ${
        danger ? 'text-red-400/70 hover:text-red-400 hover:bg-red-900/10' : 'text-muted hover:text-[#ccc] hover:bg-white/[0.04]'
      }`}
    >
      <span className="w-3 text-center opacity-70">{icon}</span>
      {label}
    </button>
  )
}
