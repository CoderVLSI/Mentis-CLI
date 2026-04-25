import { useCallback, useRef } from 'react'
import TerminalPane from './TerminalPane'
import BrowserPane from './BrowserPane'

export type PanelTab = 'terminal' | 'browser'

interface Props {
  visible:     boolean
  tab:         PanelTab
  height:      number
  onTabChange: (tab: PanelTab) => void
  onHeightChange: (h: number) => void
  onClose:     () => void
}

export default function BottomPanel({ visible, tab, height, onTabChange, onHeightChange, onClose }: Props) {
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragRef.current = { startY: e.clientY, startH: height }

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startY - ev.clientY
      onHeightChange(Math.max(140, Math.min(window.innerHeight - 280, dragRef.current.startH + delta)))
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }, [height, onHeightChange])

  if (!visible) return null

  return (
    <div
      className="flex flex-col border-t border-border bg-surface shrink-0"
      style={{ height }}
    >
      {/* Drag handle */}
      <div
        className="h-[3px] bg-transparent hover:bg-accent/40 cursor-ns-resize transition-colors shrink-0"
        onMouseDown={onDragStart}
      />

      {/* Tab bar */}
      <div className="flex items-center px-2 py-1 border-b border-border bg-[#0a0a0a] shrink-0 gap-1">
        <div className="flex gap-0.5 flex-1">
          <TabBtn active={tab === 'terminal'} onClick={() => onTabChange('terminal')}>
            <TerminalIcon /> Terminal
          </TabBtn>
          <TabBtn active={tab === 'browser'} onClick={() => onTabChange('browser')}>
            <BrowserIcon /> Browser
          </TabBtn>
        </div>

        {/* Utility buttons */}
        <button
          onClick={onClose}
          title="Close panel  (Ctrl+`)"
          className="p-1 rounded text-muted hover:text-[#ccc] hover:bg-white/[0.05] transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Content — both panes always mounted, shown/hidden via CSS */}
      <div className="flex-1 overflow-hidden min-h-0">
        <TerminalPane active={tab === 'terminal' && visible} />
        <BrowserPane  active={tab === 'browser'  && visible} />
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: {
  active:   boolean
  onClick:  () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1 rounded text-[12px] transition-colors ${
        active
          ? 'bg-surface border border-border text-[#ddd]'
          : 'text-muted hover:text-[#ccc] hover:bg-white/[0.04]'
      }`}
    >
      {children}
    </button>
  )
}

function TerminalIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
    </svg>
  )
}

function BrowserIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="3" width="20" height="18" rx="2"/>
      <line x1="2" y1="9" x2="22" y2="9"/>
      <line x1="8" y1="3" x2="8" y2="9"/>
    </svg>
  )
}
