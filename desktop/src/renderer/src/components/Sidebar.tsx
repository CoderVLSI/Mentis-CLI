import { useState, useMemo, useEffect } from 'react'
import { SessionInfo, SessionMeta, McpServer, HookEntry } from '../types'

interface Props {
  session:        SessionInfo
  sessions:       SessionMeta[]
  onNew:          () => void
  onSwitch:       (id: string) => void
  onDelete:       (id: string) => void
  onPickFolder:   () => void
  onToggleMode:   () => void
  onClear:        () => void
  onOpenSettings: () => void
  width?:         number
}

type Panel = 'sessions' | 'search' | 'mcp' | 'hooks'

function relTime(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000)
  if (m < 1) return 'now'; if (m < 60) return `${m}m`; if (h < 24) return `${h}h`
  if (d < 7) return `${d}d`; return `${Math.floor(d / 7)}w`
}

function groupSessions(sessions: SessionMeta[]) {
  const now = Date.now()
  const g: Record<string, SessionMeta[]> = { Today: [], Yesterday: [], 'This week': [], Older: [] }
  for (const s of sessions) {
    const d = Math.floor((now - s.updatedAt) / 86400000)
    if (d < 1) g['Today'].push(s)
    else if (d < 2) g['Yesterday'].push(s)
    else if (d < 7) g['This week'].push(s)
    else g['Older'].push(s)
  }
  return g
}

export default function Sidebar({ session, sessions, onNew, onSwitch, onDelete, onPickFolder, onToggleMode, onClear, onOpenSettings, width }: Props) {
  const [panel, setPanel]         = useState<Panel>('sessions')

  const [hoverId, setHoverId]     = useState<string | null>(null)
  const [mcpList, setMcpList]     = useState<McpServer[]>([])
  const [hooks, setHooks]         = useState<Record<string, HookEntry[]>>({})

  useEffect(() => {
    if (panel === 'mcp')   window.mentis.listMcp().then(data => setMcpList(data ?? [])).catch(() => setMcpList([]))
    if (panel === 'hooks') window.mentis.listHooks().then(data => setHooks(data ?? {})).catch(() => setHooks({}))
  }, [panel])

  const groups = useMemo(() => groupSessions(sessions), [sessions])

  const cwdShort = session.cwd
    ? session.cwd.replace(/^.*[/\\]([^/\\]+[/\\][^/\\]+)$/, '…/$1') || session.cwd
    : 'No folder'

  const navItem = (id: Panel, icon: React.ReactNode, label: string) => (
    <button
      key={id}
      onClick={() => setPanel(id)}
      className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[11px] transition-colors ${
        panel === id ? 'bg-white/[0.06] text-[#ddd]' : 'text-muted hover:text-[#bbb] hover:bg-white/[0.03]'
      }`}
    >
      <span className="w-3.5 flex items-center justify-center">{icon}</span>
      {label}
    </button>
  )

  return (
    <aside className="flex flex-col bg-[#0a0a0a] border-r border-border shrink-0 overflow-hidden" style={{ width: width ?? 224 }}>
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border">
        <div className="w-5 h-5 rounded bg-accent/20 flex items-center justify-center">
          <span className="text-[10px] font-bold text-purple-300">M</span>
        </div>
        <span className="text-[12px] font-semibold text-[#ccc]">mentis</span>
        <span className="text-[10px] text-muted">desktop</span>
      </div>

      {/* New chat */}
      <div className="px-2 pt-2 pb-1">
        <button
          onClick={onNew}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-accent hover:bg-violet-600 text-white text-[11px] font-medium transition-colors"
        >
          <PlusIcon /> New chat
        </button>
      </div>

      {/* Nav items */}
      <div className="px-2 py-1 flex flex-col gap-0.5">
        {navItem('search', <SearchIcon />, 'Search')}
        {navItem('mcp',    <McpIcon />,    'MCP Servers')}
        {navItem('hooks',  <HooksIcon />,  'Hooks')}
      </div>

      <div className="border-t border-border mx-3 my-1 opacity-30" />

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto px-2 pb-1">
        {panel === 'search' && (
          <SearchPanel sessions={sessions} onSwitch={(id) => { onSwitch(id); setPanel('sessions') }} currentId={session.sessionId} />
        )}
        {panel === 'mcp' && <McpPanel servers={mcpList} />}
        {panel === 'hooks' && <HooksPanel hooks={hooks} />}
        {panel === 'sessions' && (
          <>
            <div className="text-[10px] text-muted uppercase tracking-widest px-2 py-1.5">Chats</div>
            {Object.entries(groups).map(([label, items]) =>
              items.length === 0 ? null : (
                <div key={label} className="mb-2">
                  <div className="px-2 py-0.5 text-[10px] text-muted/60">{label}</div>
                  {items.map(s => (
                    <div
                      key={s.id}
                      onMouseEnter={() => setHoverId(s.id)}
                      onMouseLeave={() => setHoverId(null)}
                      onClick={() => onSwitch(s.id)}
                      className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-[11px] ${
                        s.id === session.sessionId ? 'bg-accent/15 text-[#ddd]' : 'text-muted hover:bg-white/[0.04] hover:text-[#ccc]'
                      }`}
                    >
                      <ChatIcon />
                      <span className="flex-1 truncate">{s.title}</span>
                      {hoverId === s.id ? (
                        <button onClick={e => { e.stopPropagation(); onDelete(s.id) }}
                          className="w-4 h-4 flex items-center justify-center rounded hover:bg-red-500/20 text-muted hover:text-red-400 transition-colors">
                          <XIcon />
                        </button>
                      ) : (
                        <span className="text-[9px] text-muted/50">{relTime(s.updatedAt)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
            {sessions.length === 0 && <div className="text-center text-muted text-[11px] py-6">No chats</div>}
          </>
        )}
      </div>

      {/* Bottom */}
      <div className="border-t border-border px-2 py-2 flex flex-col gap-1">
        <button onClick={onToggleMode} className={`flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-colors ${
          session.mode === 'PLAN' ? 'bg-accent/10 text-purple-300 border border-accent/30' : 'bg-[#0f2d1a] text-green-400 border border-green-800/40'
        }`}>
          <span>{session.mode === 'PLAN' ? '◆' : '▶'}</span>{session.mode} MODE
        </button>

        <button onClick={onPickFolder} className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-[11px] text-muted hover:text-[#ccc] hover:bg-white/[0.03] transition-colors" title={session.cwd}>
          <FolderIcon /><span className="truncate font-mono text-[10px]">{cwdShort}</span>
        </button>

        <div className="flex gap-1">
          <button onClick={onClear} className="flex items-center gap-1.5 flex-1 px-2 py-1.5 rounded-lg text-[11px] text-red-400/60 hover:text-red-400 hover:bg-red-900/10 transition-colors">
            <TrashIcon /> Clear
          </button>
          <button onClick={onOpenSettings} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] text-muted hover:text-[#ccc] hover:bg-white/[0.03] transition-colors">
            <SettingsIcon /> Settings
          </button>
        </div>
        <div className="px-1"><span className="text-[10px] text-muted font-mono">v1.2.0</span></div>
      </div>
    </aside>
  )
}

// ── Sub-panels ────────────────────────────────────────────────────────────────

function SearchPanel({ sessions, onSwitch, currentId }: { sessions: SessionMeta[]; onSwitch: (id: string) => void; currentId?: string }) {
  const [q, setQ] = useState('')
  const results = sessions.filter(s => s.title.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="pt-1">
      <div className="flex items-center gap-2 px-2 py-1.5 mb-2 rounded-lg bg-surface border border-border">
        <SearchIcon />
        <input autoFocus type="text" placeholder="Search chats…" value={q} onChange={e => setQ(e.target.value)}
          className="bg-transparent text-[11px] text-[#ccc] placeholder-muted outline-none w-full" />
      </div>
      {results.map(s => (
        <button key={s.id} onClick={() => onSwitch(s.id)} className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-[11px] transition-colors mb-0.5 ${
          s.id === currentId ? 'bg-accent/15 text-[#ddd]' : 'text-muted hover:bg-white/[0.04] hover:text-[#ccc]'
        }`}>
          <ChatIcon /><span className="truncate">{s.title}</span>
        </button>
      ))}
      {q && results.length === 0 && <div className="text-center text-muted text-[11px] py-4">No results</div>}
    </div>
  )
}

function McpPanel({ servers }: { servers: McpServer[] }) {
  const list = servers ?? []
  return (
    <div className="pt-1">
      <div className="flex items-center justify-between px-2 py-1 mb-1">
        <span className="text-[10px] text-muted uppercase tracking-widest">MCP Servers</span>
        <span className="text-[10px] text-muted">{list.length}</span>
      </div>
      {list.length === 0 ? (
        <div className="px-2 py-4 text-center">
          <div className="text-[11px] text-muted mb-1">No MCP servers configured</div>
          <div className="text-[10px] text-muted/60">Run <code className="font-mono bg-[#111] px-1 rounded">mentis /mcp</code> in CLI</div>
        </div>
      ) : list.map((s, i) => (
        <div key={i} className="px-2 py-2 rounded-lg bg-panel border border-border mb-1">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
            <span className="text-[11px] text-[#ccc] font-medium truncate">{s.name}</span>
          </div>
          {s.command && <div className="text-[10px] text-muted mt-0.5 font-mono truncate">{s.command} {s.args?.join(' ')}</div>}
        </div>
      ))}
    </div>
  )
}

function HooksPanel({ hooks }: { hooks: Record<string, HookEntry[]> }) {
  const hookNames = Object.keys(hooks)
  const HOOK_COLORS: Record<string, string> = {
    SessionStart: 'text-blue-400',
    PreToolUse:   'text-yellow-400',
    PostToolUse:  'text-green-400',
    Stop:         'text-red-400',
  }
  return (
    <div className="pt-1">
      <div className="flex items-center justify-between px-2 py-1 mb-1">
        <span className="text-[10px] text-muted uppercase tracking-widest">Hooks</span>
        <span className="text-[10px] text-muted">{hookNames.length}</span>
      </div>
      {hookNames.length === 0 ? (
        <div className="px-2 py-4 text-center">
          <div className="text-[11px] text-muted mb-1">No hooks configured</div>
          <div className="text-[10px] text-muted/60">Edit <code className="font-mono bg-[#111] px-1 rounded">~/.mentis/settings.json</code></div>
        </div>
      ) : hookNames.map(name => (
        <div key={name} className="mb-2">
          <div className={`text-[10px] font-mono font-semibold px-2 mb-1 ${HOOK_COLORS[name] || 'text-muted'}`}>{name}</div>
          {(hooks[name] || []).map((h, i) => (
            <div key={i} className="px-2 py-1.5 rounded-lg bg-panel border border-border mb-0.5">
              <div className="text-[10px] font-mono text-[#bbb] truncate">{h.command}</div>
              {h.blocking && <span className="text-[9px] text-yellow-400/70">blocking</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────────
const PlusIcon    = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const SearchIcon  = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted shrink-0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const McpIcon     = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted shrink-0"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
const HooksIcon   = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted shrink-0"><polyline points="13 2 13 9 22 9"/><polyline points="11 22 11 15 2 15"/><path d="M22 9 12 19 2 9"/></svg>
const ChatIcon    = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted/60 shrink-0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
const XIcon       = () => <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const FolderIcon  = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
const TrashIcon   = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
const SettingsIcon= () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
