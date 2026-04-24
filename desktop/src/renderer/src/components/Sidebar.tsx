import { useState, useMemo } from 'react'
import { SessionInfo, SessionMeta } from '../types'

interface Props {
  session:       SessionInfo
  sessions:      SessionMeta[]
  onNew:         () => void
  onSwitch:      (id: string) => void
  onDelete:      (id: string) => void
  onPickFolder:  () => void
  onToggleMode:  () => void
  onClear:       () => void
}

function relTime(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m`
  if (h < 24) return `${h}h`
  if (d < 7)  return `${d}d`
  return `${Math.floor(d / 7)}w`
}

function groupSessions(sessions: SessionMeta[]) {
  const now = Date.now()
  const groups: Record<string, SessionMeta[]> = { Today: [], Yesterday: [], 'Last 7 days': [], Older: [] }
  for (const s of sessions) {
    const d = Math.floor((now - s.updatedAt) / 86400000)
    if (d < 1)       groups['Today'].push(s)
    else if (d < 2)  groups['Yesterday'].push(s)
    else if (d < 7)  groups['Last 7 days'].push(s)
    else             groups['Older'].push(s)
  }
  return groups
}

export default function Sidebar({ session, sessions, onNew, onSwitch, onDelete, onPickFolder, onToggleMode, onClear }: Props) {
  const [search, setSearch]   = useState('')
  const [hoverId, setHoverId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions
    const q = search.toLowerCase()
    return sessions.filter(s => s.title.toLowerCase().includes(q))
  }, [sessions, search])

  const groups = useMemo(() => groupSessions(filtered), [filtered])

  const cwdShort = session.cwd
    ? session.cwd.replace(/^.*[/\\]([^/\\]+[/\\][^/\\]+)$/, '…/$1') || session.cwd
    : 'No folder'

  return (
    <aside className="flex flex-col w-56 bg-[#0a0a0a] border-r border-border shrink-0 overflow-hidden">
      {/* Logo */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded bg-accent/20 flex items-center justify-center">
            <span className="text-[10px] font-bold text-purple-300">M</span>
          </div>
          <span className="text-[12px] font-semibold text-[#ccc]">mentis</span>
          <span className="text-[10px] text-muted">desktop</span>
        </div>
      </div>

      {/* New chat */}
      <div className="px-2 pt-2 pb-1">
        <button
          onClick={onNew}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-accent hover:bg-violet-600 text-white text-[11px] font-medium transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New chat
        </button>
      </div>

      {/* Search */}
      <div className="px-2 py-1">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface border border-border">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted shrink-0">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search chats…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-[11px] text-[#ccc] placeholder-muted outline-none w-full"
          />
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {Object.entries(groups).map(([label, items]) =>
          items.length === 0 ? null : (
            <div key={label} className="mb-2">
              <div className="px-2 py-1 text-[10px] text-muted uppercase tracking-widest">{label}</div>
              {items.map(s => (
                <div
                  key={s.id}
                  onMouseEnter={() => setHoverId(s.id)}
                  onMouseLeave={() => setHoverId(null)}
                  onClick={() => onSwitch(s.id)}
                  className={`group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-[11px] ${
                    s.id === session.sessionId
                      ? 'bg-accent/15 text-[#ddd]'
                      : 'text-muted hover:bg-white/[0.04] hover:text-[#ccc]'
                  }`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 opacity-50">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span className="flex-1 truncate">{s.title}</span>
                  {hoverId === s.id ? (
                    <button
                      onClick={e => { e.stopPropagation(); onDelete(s.id) }}
                      className="shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-red-500/20 text-muted hover:text-red-400 transition-colors"
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  ) : (
                    <span className="shrink-0 text-[9px] text-muted opacity-60">{relTime(s.updatedAt)}</span>
                  )}
                </div>
              ))}
            </div>
          )
        )}
        {filtered.length === 0 && (
          <div className="text-center text-muted text-[11px] py-6">No chats found</div>
        )}
      </div>

      {/* Bottom section */}
      <div className="border-t border-border px-2 py-2 flex flex-col gap-1">
        {/* Mode toggle */}
        <button
          onClick={onToggleMode}
          className={`flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-colors ${
            session.mode === 'PLAN'
              ? 'bg-accent/10 text-purple-300 border border-accent/30'
              : 'bg-[#0f2d1a] text-green-400 border border-green-800/40'
          }`}
        >
          <span>{session.mode === 'PLAN' ? '◆' : '▶'}</span>
          {session.mode} MODE
        </button>

        {/* Folder */}
        <button
          onClick={onPickFolder}
          className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-[11px] text-muted hover:text-[#ccc] hover:bg-white/[0.03] transition-colors"
          title={session.cwd}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span className="truncate font-mono text-[10px]">{cwdShort}</span>
        </button>

        {/* Clear + Settings row */}
        <div className="flex gap-1">
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 flex-1 px-2 py-1.5 rounded-lg text-[11px] text-red-400/60 hover:text-red-400 hover:bg-red-900/10 transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            Clear
          </button>
          <button className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] text-muted hover:text-[#ccc] hover:bg-white/[0.03] transition-colors">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
            Settings
          </button>
        </div>

        <div className="px-1 pt-1">
          <span className="text-[10px] text-muted font-mono">v1.2.0</span>
        </div>
      </div>
    </aside>
  )
}
