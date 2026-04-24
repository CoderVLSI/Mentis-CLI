import { useState } from 'react'
import { ToolEvent } from '../types'

interface Props {
  tool:      ToolEvent
  onApprove: (id: string, approved: boolean) => void
}

const TOOL_ICONS: Record<string, string> = {
  read_file:  '📄', write_file: '✏️', edit_file: '🔧', list_dir: '📁', run_shell: '⚡',
}

export default function ToolCallCard({ tool, onApprove }: Props) {
  const [open, setOpen] = useState(tool.needsApproval)
  const isWait = tool.needsApproval && tool.status === 'pending'
  const icon   = TOOL_ICONS[tool.name] || '🔧'

  const label = () => {
    const a = tool.args
    if (a.file_path) return String(a.file_path)
    if (a.path)      return String(a.path)
    if (a.command)   return String(a.command)
    return tool.name
  }

  const badge = () => {
    if (isWait)                     return <span className="badge yellow animate-pulse">Waiting approval</span>
    if (tool.status === 'approved') return <span className="badge green">Approved</span>
    if (tool.status === 'denied')   return <span className="badge red">Denied</span>
    if (tool.status === 'done')     return <span className="badge blue">Done</span>
    return <span className="badge gray">Running</span>
  }

  return (
    <div className={`rounded-lg border text-xs overflow-hidden ${isWait ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-border bg-panel'}`}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-[13px]">{icon}</span>
        <span className="font-mono text-[11px] text-[#ccc]">{tool.name}</span>
        <span className="text-muted truncate flex-1 text-[10px] font-mono">{label()}</span>
        {badge()}
        <span className="text-muted ml-1 text-[10px]">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="border-t border-border px-3 py-2 flex flex-col gap-2">
          {/* Diff view for edit_file */}
          {tool.name === 'edit_file' && tool.args.old_string != null && (
            <DiffSection old={String(tool.args.old_string)} next={String(tool.args.new_string || '')} />
          )}

          {/* Content preview for write_file */}
          {tool.name === 'write_file' && tool.args.content != null && (
            <div>
              <SectionLabel>New file content</SectionLabel>
              <pre className="text-[11px] bg-surface rounded p-2 overflow-x-auto font-mono max-h-48 text-green-400/80">
                {String(tool.args.content).split('\n').map((line, i) => (
                  <div key={i}><span className="text-green-600/50 select-none mr-2">+</span>{line}</div>
                ))}
              </pre>
            </div>
          )}

          {/* Args for other tools */}
          {tool.name !== 'edit_file' && tool.name !== 'write_file' && (
            <div>
              <SectionLabel>Arguments</SectionLabel>
              <pre className="text-[11px] text-[#bbb] bg-surface rounded p-2 overflow-x-auto font-mono">
                {JSON.stringify(tool.args, null, 2)}
              </pre>
            </div>
          )}

          {/* Result */}
          {tool.result && (
            <div>
              <SectionLabel>Result</SectionLabel>
              <pre className="text-[11px] text-[#bbb] bg-surface rounded p-2 overflow-x-auto font-mono max-h-32">
                {tool.result}
              </pre>
            </div>
          )}

          {/* Approval buttons */}
          {isWait && (
            <div className="flex gap-2 pt-1">
              <button onClick={() => onApprove(tool.id, true)}  className="flex-1 px-3 py-1.5 rounded bg-green-600/15 hover:bg-green-600/25 text-green-400 border border-green-600/30 text-[11px] font-medium transition-colors">✓ Approve</button>
              <button onClick={() => onApprove(tool.id, false)} className="flex-1 px-3 py-1.5 rounded bg-red-600/10   hover:bg-red-600/20   text-red-400   border border-red-600/30   text-[11px] font-medium transition-colors">✗ Deny</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] text-muted uppercase tracking-wider mb-1">{children}</div>
}

function DiffSection({ old, next }: { old: string; next: string }) {
  return (
    <div>
      <SectionLabel>Changes</SectionLabel>
      <div className="rounded overflow-hidden border border-border font-mono text-[11px]">
        {old.split('\n').map((line, i) => (
          <div key={`r${i}`} className="flex bg-red-900/20 px-2 py-0.5">
            <span className="text-red-600/60 select-none w-4 shrink-0">−</span>
            <span className="text-red-300/80">{line}</span>
          </div>
        ))}
        {next.split('\n').map((line, i) => (
          <div key={`a${i}`} className="flex bg-green-900/20 px-2 py-0.5">
            <span className="text-green-600/60 select-none w-4 shrink-0">+</span>
            <span className="text-green-300/80">{line}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
