import { useState } from 'react'
import { ToolEvent } from '../types'

interface Props {
  tool:      ToolEvent
  onApprove: (id: string, approved: boolean) => void
}

const STATUS_STYLE: Record<string, string> = {
  pending:  'text-amber-400  bg-amber-400/8  border-amber-400/20',
  approved: 'text-emerald-400 bg-emerald-400/8 border-emerald-400/20',
  denied:   'text-red-400    bg-red-400/8    border-red-400/20',
  done:     'text-sky-400    bg-sky-400/8    border-sky-400/20',
}
const STATUS_DOT: Record<string, string> = {
  pending:  'bg-amber-400 animate-pulse',
  approved: 'bg-emerald-400',
  denied:   'bg-red-400',
  done:     'bg-sky-400',
}
const STATUS_LABEL: Record<string, string> = {
  pending: 'Waiting', approved: 'Approved', denied: 'Denied', done: 'Done',
}

function shortLabel(tool: ToolEvent) {
  const a = tool.args
  if (tool.name === 'web_search') return String(a.query || '').slice(0, 60)
  if (a.file_path) return String(a.file_path).replace(/\\/g, '/').split('/').pop() || String(a.file_path)
  if (a.path)      return String(a.path).replace(/\\/g, '/').split('/').pop() || String(a.path)
  if (a.command)   return String(a.command).slice(0, 60)
  return tool.name
}

function fullPath(tool: ToolEvent) {
  const a = tool.args
  if (a.file_path) return String(a.file_path)
  if (a.path)      return String(a.path)
  return null
}

export default function ToolCallCard({ tool, onApprove }: Props) {
  const [open, setOpen] = useState(tool.needsApproval)
  const isWait = tool.needsApproval && tool.status === 'pending'
  const statusStyle = STATUS_STYLE[tool.status] || STATUS_STYLE.done
  const dotStyle    = STATUS_DOT[tool.status]   || STATUS_DOT.done
  const path        = fullPath(tool)

  return (
    <div className={`rounded-xl border text-xs overflow-hidden transition-colors ${
      isWait ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-[#0d0d0d]'
    }`}>
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        <ToolIcon name={tool.name} />
        <span className="font-mono text-[11px] text-[#aaa]">{tool.name}</span>
        <span className="text-[#666] text-[10px] font-mono truncate flex-1">{shortLabel(tool)}</span>
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${statusStyle}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${dotStyle}`} />
          {STATUS_LABEL[tool.status] || tool.status}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="border-t border-border/60 px-3 py-2.5 flex flex-col gap-2.5">
          {/* Full path if different from short label */}
          {path && path !== shortLabel(tool) && (
            <div className="text-[10px] font-mono text-muted truncate">{path}</div>
          )}

          {/* Diff for edit_file */}
          {tool.name === 'edit_file' && tool.args.old_string != null && (
            <DiffSection old={String(tool.args.old_string)} next={String(tool.args.new_string || '')} />
          )}

          {/* Content for write_file */}
          {tool.name === 'write_file' && tool.args.content != null && (
            <CodeSection label="New file" code={String(tool.args.content)} color="text-emerald-300/80" prefix="+" bg="bg-emerald-950/20" />
          )}

          {/* Query + result for web_search */}
          {tool.name === 'web_search' && (
            <div className="text-[11px] text-muted font-mono">Search: {String(tool.args.query)}</div>
          )}

          {/* Args for other tools */}
          {tool.name !== 'edit_file' && tool.name !== 'write_file' && tool.name !== 'web_search' && (
            <pre className="text-[11px] text-[#bbb] bg-surface rounded-lg p-2.5 overflow-x-auto font-mono leading-relaxed">
              {JSON.stringify(tool.args, null, 2)}
            </pre>
          )}

          {/* Result */}
          {tool.result && (
            <div>
              <SectionLabel>Output</SectionLabel>
              <pre className="text-[11px] text-[#999] bg-surface rounded-lg p-2.5 overflow-x-auto font-mono max-h-40 leading-relaxed whitespace-pre-wrap">
                {tool.result}
              </pre>
            </div>
          )}

          {/* Approval buttons */}
          {isWait && (
            <div className="flex gap-2 pt-0.5">
              <button onClick={() => onApprove(tool.id, true)}
                className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 border border-emerald-600/30 text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5">
                <CheckIcon /> Allow
              </button>
              <button onClick={() => onApprove(tool.id, false)}
                className="flex-1 px-3 py-1.5 rounded-lg bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-600/30 text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5">
                <XIcon /> Deny
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] text-muted/70 uppercase tracking-widest mb-1">{children}</div>
}

function CodeSection({ label, code, color, prefix, bg }: { label: string; code: string; color: string; prefix: string; bg: string }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className={`rounded-lg overflow-hidden border border-border font-mono text-[11px] max-h-48 overflow-y-auto ${bg}`}>
        {code.split('\n').map((line, i) => (
          <div key={i} className="flex px-2 py-px">
            <span className={`${color} opacity-40 select-none w-4 shrink-0`}>{prefix}</span>
            <span className={color}>{line}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DiffSection({ old, next }: { old: string; next: string }) {
  return (
    <div>
      <SectionLabel>Changes</SectionLabel>
      <div className="rounded-lg overflow-hidden border border-border font-mono text-[11px] max-h-48 overflow-y-auto">
        {old.split('\n').map((line, i) => (
          <div key={`r${i}`} className="flex bg-red-950/30 px-2 py-px">
            <span className="text-red-500/50 select-none w-4 shrink-0">−</span>
            <span className="text-red-300/80">{line}</span>
          </div>
        ))}
        {next.split('\n').map((line, i) => (
          <div key={`a${i}`} className="flex bg-emerald-950/30 px-2 py-px">
            <span className="text-emerald-500/50 select-none w-4 shrink-0">+</span>
            <span className="text-emerald-300/80">{line}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ToolIcon({ name }: { name: string }) {
  const cls = 'text-muted shrink-0'
  if (name === 'read_file')  return <svg className={cls} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
  if (name === 'write_file') return <svg className={cls} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
  if (name === 'edit_file')  return <svg className={cls} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  if (name === 'list_dir')   return <svg className={cls} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
  if (name === 'run_shell')  return <svg className={cls} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
  if (name === 'web_search') return <svg className={cls} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
  return <svg className={cls} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      className={`text-muted/50 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}>
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  )
}

const CheckIcon = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
const XIcon    = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
