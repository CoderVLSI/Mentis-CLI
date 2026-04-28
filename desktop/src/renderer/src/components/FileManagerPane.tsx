import { useEffect, useState, useCallback } from 'react'

interface Entry { name: string; type: 'file' | 'dir' }

interface Props {
  active:       boolean
  rootPath:     string
  onInsertPath: (p: string) => void
}

const FILE_ICONS: Record<string, string> = {
  ts: '󰛦', tsx: '󰛦', js: '󰌞', jsx: '󰌞', json: '󰘦', md: '󰍔',
  css: '󰌜', html: '󰌝', py: '󰌠', rs: '󱘗', go: '󰟓',
  sh: '󰆍', bash: '󰆍', env: '󰒓', yml: '󰒓', yaml: '󰒓',
  png: '󰋲', jpg: '󰋲', jpeg: '󰋲', svg: '󰕠', gif: '󰋲',
  lock: '󰌾', gitignore: '󰊤',
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return FILE_ICONS[ext] ?? '󰈙'
}

function joinPath(a: string, b: string): string {
  return a.replace(/[\\/]+$/, '') + '/' + b
}

export default function FileManagerPane({ active, rootPath, onInsertPath }: Props) {
  const [path,     setPath]     = useState(rootPath)
  const [entries,  setEntries]  = useState<Entry[]>([])
  const [loading,  setLoading]  = useState(false)

  const load = useCallback(async (p: string) => {
    setLoading(true)
    const result = await window.mentis.readDir(p)
    setEntries(result as Entry[])
    setPath(p)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (active && rootPath) load(rootPath)
  }, [active, rootPath, load])

  const up = () => {
    const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
    if (parts.length <= 1) return
    parts.pop()
    load('/' + parts.join('/'))
  }

  // Breadcrumb segments
  const segments = path.replace(/\\/g, '/').split('/').filter(Boolean)

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] text-[#ccc] text-[12px] select-none">
      {/* Breadcrumb toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[#1e1e1e] shrink-0 overflow-x-auto">
        <button
          onClick={up}
          disabled={segments.length <= 1}
          className="p-0.5 rounded hover:bg-white/[0.06] disabled:opacity-30 shrink-0"
          title="Go up"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        <div className="flex items-center gap-0.5 min-w-0 flex-1">
          {segments.map((seg, i) => {
            const segPath = '/' + segments.slice(0, i + 1).join('/')
            return (
              <span key={i} className="flex items-center gap-0.5 shrink-0">
                {i > 0 && <span className="text-[#444]">/</span>}
                <button
                  onClick={() => load(segPath)}
                  className="text-[11px] text-[#888] hover:text-[#ccc] transition-colors truncate max-w-[80px]"
                  title={segPath}
                >
                  {seg}
                </button>
              </span>
            )
          })}
        </div>

        <button
          onClick={() => load(path)}
          className="p-0.5 rounded hover:bg-white/[0.06] text-[#555] hover:text-[#aaa] shrink-0"
          title="Refresh"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-16 text-[#444] text-[11px]">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="flex items-center justify-center h-16 text-[#444] text-[11px]">Empty directory</div>
        ) : (
          <div className="py-0.5">
            {entries.map(e => (
              <button
                key={e.name}
                onClick={() => {
                  const full = joinPath(path, e.name)
                  if (e.type === 'dir') load(full)
                  else onInsertPath(full)
                }}
                className="flex items-center gap-2 w-full px-3 py-[3px] hover:bg-white/[0.04] text-left group"
                title={e.type === 'file' ? 'Click to insert path in chat' : 'Click to open'}
              >
                {e.type === 'dir'
                  ? <FolderIcon />
                  : <span className="text-[11px] text-[#555] group-hover:text-[#888] w-3.5 shrink-0">{fileIcon(e.name)}</span>
                }
                <span className={`truncate ${e.type === 'dir' ? 'text-[#b0a4e8]' : 'text-[#aaa]'}`}>
                  {e.name}
                </span>
                {e.type === 'file' && (
                  <span className="ml-auto text-[9px] text-[#333] group-hover:text-[#555] shrink-0 opacity-0 group-hover:opacity-100">
                    insert
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FolderIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8b7fd4" strokeWidth="1.5" className="shrink-0">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  )
}
