import { SessionInfo } from '../types'

interface Props {
  session:       SessionInfo
  onPickFolder:  () => void
  onToggleMode:  () => void
  onClear:       () => void
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>
  )
}

export default function Sidebar({ session, onPickFolder, onToggleMode, onClear }: Props) {
  const cwdShort = session.cwd
    ? session.cwd.replace(/^.*[/\\]([^/\\]+[/\\][^/\\]+)$/, '…/$1') || session.cwd
    : 'No folder'

  return (
    <aside className="flex flex-col w-52 bg-panel border-r border-border shrink-0 py-3 gap-1 overflow-hidden">
      {/* Logo */}
      <div className="px-4 pb-3 mb-1 border-b border-border">
        <span className="text-accent font-mono font-semibold text-sm tracking-tight">mentis</span>
        <span className="text-muted text-[10px] ml-1">desktop</span>
      </div>

      {/* Mode toggle */}
      <div className="px-3">
        <button
          onClick={onToggleMode}
          className={`w-full text-left px-3 py-2 rounded-md text-xs font-mono font-medium transition-colors ${
            session.mode === 'PLAN'
              ? 'bg-accent/20 text-purple-300 border border-accent/40'
              : 'bg-[#0f2d1a] text-green-400 border border-green-800/50'
          }`}
        >
          {session.mode === 'PLAN' ? '◆ PLAN MODE' : '▶ BUILD MODE'}
        </button>
      </div>

      {/* Working directory */}
      <div className="px-3 mt-2">
        <div className="text-[10px] text-muted uppercase tracking-widest mb-1 px-1">Working Dir</div>
        <button
          onClick={onPickFolder}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-surface hover:bg-[#181818] border border-border text-[11px] text-left transition-colors"
          title={session.cwd || 'Pick folder'}
        >
          <span className="text-muted shrink-0"><FolderIcon /></span>
          <span className="text-[#ccc] truncate font-mono text-[10px]">{cwdShort}</span>
        </button>
      </div>

      {/* Session stats */}
      <div className="px-3 mt-3">
        <div className="text-[10px] text-muted uppercase tracking-widest mb-1 px-1">Session</div>
        <div className="flex flex-col gap-1 px-1">
          <StatRow label="Messages" value={String(session.messageCount)} />
          {session.model && <StatRow label="Model" value={session.model.split('-').slice(-2).join('-')} />}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <div className="px-3 flex flex-col gap-1">
        <SidebarBtn onClick={onClear} icon={<ClearIcon />} label="Clear chat" danger />
      </div>

      {/* Footer */}
      <div className="px-4 pt-3 border-t border-border mt-1">
        <span className="text-[10px] text-muted font-mono">v1.2.0</span>
      </div>
    </aside>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[11px] text-muted">{label}</span>
      <span className="text-[11px] text-[#aaa] font-mono">{value}</span>
    </div>
  )
}

function SidebarBtn({ onClick, icon, label, danger }: {
  onClick: () => void
  icon: React.ReactNode
  label: string
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-3 py-2 rounded-md text-[11px] transition-colors ${
        danger
          ? 'text-red-400/70 hover:text-red-400 hover:bg-red-900/10'
          : 'text-muted hover:text-[#ccc] hover:bg-[#1a1a1a]'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
