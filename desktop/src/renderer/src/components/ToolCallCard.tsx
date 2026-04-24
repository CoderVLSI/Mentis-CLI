import { useState } from 'react'
import { ToolEvent } from '../types'

interface Props {
  tool:      ToolEvent
  onApprove: (id: string, approved: boolean) => void
}

const TOOL_ICONS: Record<string, string> = {
  read_file:  '📄',
  write_file: '✏️',
  edit_file:  '🔧',
  list_dir:   '📁',
  run_shell:  '⚡',
}

export default function ToolCallCard({ tool, onApprove }: Props) {
  const [open, setOpen] = useState(tool.needsApproval)

  const icon   = TOOL_ICONS[tool.name] || '🔧'
  const isWait = tool.needsApproval && tool.status === 'pending'

  const statusBadge = () => {
    if (isWait)              return <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 animate-pulse">Waiting</span>
    if (tool.status === 'approved') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">Approved</span>
    if (tool.status === 'denied')   return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">Denied</span>
    if (tool.status === 'done')     return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">Done</span>
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#222] text-muted border border-border">Running</span>
  }

  const formatArgs = () => {
    const a = tool.args
    if (a.file_path) return String(a.file_path)
    if (a.path)      return String(a.path)
    if (a.command)   return String(a.command)
    return JSON.stringify(a)
  }

  return (
    <div className={`rounded-lg border text-xs overflow-hidden transition-colors ${
      isWait ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-border bg-panel'
    }`}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span>{icon}</span>
        <span className="font-mono text-[11px] text-[#ccc]">{tool.name}</span>
        <span className="text-muted truncate flex-1 text-[10px]">{formatArgs()}</span>
        {statusBadge()}
        <span className="text-muted ml-1">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="border-t border-border px-3 py-2 flex flex-col gap-2">
          {/* Args */}
          <div>
            <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Arguments</div>
            <pre className="text-[11px] text-[#bbb] bg-surface rounded p-2 overflow-x-auto font-mono">
              {JSON.stringify(tool.args, null, 2)}
            </pre>
          </div>

          {/* Preview (for write_file) */}
          {tool.preview && (
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Preview</div>
              <pre className="text-[11px] text-[#bbb] bg-surface rounded p-2 overflow-x-auto font-mono max-h-40">
                {tool.preview}
              </pre>
            </div>
          )}

          {/* Result */}
          {tool.result && (
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Result</div>
              <pre className="text-[11px] text-[#bbb] bg-surface rounded p-2 overflow-x-auto font-mono max-h-32">
                {tool.result}
              </pre>
            </div>
          )}

          {/* Approval buttons */}
          {isWait && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onApprove(tool.id, true)}
                className="flex-1 px-3 py-1.5 rounded bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/30 text-[11px] font-medium transition-colors"
              >
                ✓ Approve
              </button>
              <button
                onClick={() => onApprove(tool.id, false)}
                className="flex-1 px-3 py-1.5 rounded bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-600/30 text-[11px] font-medium transition-colors"
              >
                ✗ Deny
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
