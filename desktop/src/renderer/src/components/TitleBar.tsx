import { useState, useEffect, useRef } from 'react'
import { PanelTab } from './BottomPanel'

interface Props {
  onMinimize:       () => void
  onMaximize:       () => void
  onClose:          () => void
  onNewChat:        () => void
  onPickFolder:     () => void
  onExportChat:     () => void
  onToggleMode:     () => void
  onClearChat:      () => void
  onOpenSettings:   () => void
  onToggleTerminal: () => void
  onToggleBrowser:  () => void
  mode:             'PLAN' | 'BUILD'
  panelVisible:     boolean
  panelTab:         PanelTab
}

type MenuItem =
  | { type: 'item'; label: string; shortcut?: string; onClick: () => void; checked?: boolean }
  | { type: 'sep' }

const isMac = typeof window !== 'undefined' && window.mentis?.platform === 'darwin'

export default function TitleBar(props: Props) {
  return isMac ? <MacTitleBar {...props} /> : <WinTitleBar {...props} />
}

// ── Shared menu bar ────────────────────────────────────────────────────────────

function useMenus(props: Props) {
  const { onNewChat, onPickFolder, onExportChat, onToggleMode, onClearChat, mode,
          onToggleTerminal, onToggleBrowser, panelVisible, panelTab } = props

  const fileMenu: MenuItem[] = [
    { type: 'item', label: 'New Chat',      shortcut: 'Ctrl+N', onClick: onNewChat },
    { type: 'sep' },
    { type: 'item', label: 'Open Folder…',  shortcut: 'Ctrl+O', onClick: onPickFolder },
    { type: 'item', label: 'Export Chat',                        onClick: onExportChat },
    { type: 'sep' },
    { type: 'item', label: 'Clear History',                      onClick: onClearChat },
  ]

  const viewMenu: MenuItem[] = [
    { type: 'item', label: 'PLAN mode',  onClick: () => { if (mode !== 'PLAN')  onToggleMode() }, checked: mode === 'PLAN' },
    { type: 'item', label: 'BUILD mode', onClick: () => { if (mode !== 'BUILD') onToggleMode() }, checked: mode === 'BUILD' },
    { type: 'sep' },
    { type: 'item', label: 'Terminal', shortcut: 'Ctrl+`',       onClick: onToggleTerminal, checked: panelVisible && panelTab === 'terminal' },
    { type: 'item', label: 'Browser',  shortcut: 'Ctrl+Shift+`', onClick: onToggleBrowser,  checked: panelVisible && panelTab === 'browser'  },
  ]

  const helpMenu: MenuItem[] = [
    { type: 'item', label: 'Documentation',  onClick: () => window.open('https://github.com/CoderVLSI/Mentis-CLI') },
    { type: 'item', label: 'Report Issue',   onClick: () => window.open('https://github.com/CoderVLSI/Mentis-CLI/issues') },
    { type: 'sep' },
    { type: 'item', label: 'About Mentis',   onClick: props.onOpenSettings },
  ]

  return [
    { label: 'File', items: fileMenu },
    { label: 'View', items: viewMenu },
    { label: 'Help', items: helpMenu },
  ]
}

// ── Panel toggle icon buttons ──────────────────────────────────────────────────

function PanelIcons({ props }: { props: Props }) {
  const { onToggleTerminal, onToggleBrowser, panelVisible, panelTab } = props
  return (
    <div className="flex items-center no-drag">
      <button
        onClick={onToggleTerminal}
        title="Terminal  (Ctrl+`)"
        className={`p-1.5 rounded transition-colors ${
          panelVisible && panelTab === 'terminal'
            ? 'text-accent bg-accent/10'
            : 'text-muted hover:text-[#ccc] hover:bg-white/[0.05]'
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
      </button>
      <button
        onClick={onToggleBrowser}
        title="Browser  (Ctrl+Shift+`)"
        className={`p-1.5 rounded transition-colors ${
          panelVisible && panelTab === 'browser'
            ? 'text-accent bg-accent/10'
            : 'text-muted hover:text-[#ccc] hover:bg-white/[0.05]'
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="18" rx="2"/>
          <line x1="2" y1="9" x2="22" y2="9"/>
          <line x1="8" y1="3" x2="8" y2="9"/>
        </svg>
      </button>
    </div>
  )
}

// ── Drop-down menu component ───────────────────────────────────────────────────

function MenuDropdowns({ menus, onOpenSettings }: {
  menus: { label: string; items: MenuItem[] }[]
  onOpenSettings: () => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="flex items-center gap-0.5 no-drag">
      {menus.map(menu => (
        <div key={menu.label} className="relative">
          <button
            onClick={() => setOpen(open === menu.label ? null : menu.label)}
            className={`px-2.5 h-7 text-[12px] rounded transition-colors ${
              open === menu.label
                ? 'bg-white/10 text-[#ddd]'
                : 'text-muted hover:bg-white/[0.05] hover:text-[#ccc]'
            }`}
          >
            {menu.label}
          </button>

          {open === menu.label && (
            <div className="absolute top-full left-0 mt-0.5 bg-panel border border-border rounded-xl shadow-2xl z-[200] py-1 min-w-[190px] no-drag">
              {menu.items.map((item, i) => {
                if (item.type === 'sep') {
                  return <div key={i} className="my-1 border-t border-border" />
                }
                return (
                  <button
                    key={i}
                    onClick={() => { item.onClick(); setOpen(null) }}
                    className="flex items-center justify-between w-full px-3 py-1.5 text-left text-[12px] text-muted hover:bg-white/[0.04] hover:text-[#ddd] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-accent text-[10px] w-3 shrink-0 ${item.checked ? '' : 'opacity-0'}`}>✓</span>
                      {item.label}
                    </div>
                    {item.shortcut && (
                      <span className="text-[10px] text-muted/50 ml-6 shrink-0">{item.shortcut}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ))}

      {/* Settings gear */}
      <button
        onClick={onOpenSettings}
        title="Settings"
        className="p-1.5 ml-0.5 rounded transition-colors text-muted hover:text-[#ccc] hover:bg-white/[0.05]"
      >
        <GearIcon />
      </button>
    </div>
  )
}

// ── Mac titlebar ───────────────────────────────────────────────────────────────

function MacTitleBar(props: Props) {
  const { onMinimize, onMaximize, onClose, onOpenSettings } = props
  const menus = useMenus(props)

  return (
    <div className="titlebar flex items-center h-10 px-3 bg-surface border-b border-border shrink-0 z-50 gap-4">
      {/* Traffic lights */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button onClick={onClose}    className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-110 transition-all" />
        <button onClick={onMinimize} className="w-3 h-3 rounded-full bg-[#febc2e] hover:brightness-110 transition-all" />
        <button onClick={onMaximize} className="w-3 h-3 rounded-full bg-[#28c840] hover:brightness-110 transition-all" />
      </div>

      {/* Logo */}
      <div className="flex items-center gap-1.5 shrink-0 no-drag">
        <div className="w-4 h-4 rounded-sm bg-accent/30 flex items-center justify-center">
          <span className="text-[9px] font-bold text-purple-300">M</span>
        </div>
        <span className="text-[11px] font-semibold text-[#888] tracking-wide">Mentis</span>
      </div>

      {/* Menus */}
      <MenuDropdowns menus={menus} onOpenSettings={onOpenSettings} />

      {/* Drag fill */}
      <div className="flex-1" />

      {/* Panel toggles */}
      <PanelIcons props={props} />
    </div>
  )
}

// ── Windows titlebar ───────────────────────────────────────────────────────────

function WinTitleBar(props: Props) {
  const { onMinimize, onMaximize, onClose, onOpenSettings } = props
  const menus = useMenus(props)

  return (
    <div className="titlebar flex items-center h-9 bg-[#0a0a0a] border-b border-border shrink-0 z-50 select-none">
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 shrink-0 no-drag">
        <div className="w-4 h-4 rounded-sm bg-accent/30 flex items-center justify-center">
          <span className="text-[9px] font-bold text-purple-300">M</span>
        </div>
        <span className="text-[11px] font-medium text-[#888] tracking-wide">Mentis</span>
      </div>

      {/* Menus */}
      <MenuDropdowns menus={menus} onOpenSettings={onOpenSettings} />

      {/* Drag fill */}
      <div className="flex-1" />

      {/* Panel toggles */}
      <PanelIcons props={props} />

      {/* Window controls */}
      <div className="flex h-full shrink-0 no-drag">
        <WinBtn onClick={onMinimize} title="Minimize">
          <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
        </WinBtn>
        <WinBtn onClick={onMaximize} title="Maximize">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor"/>
          </svg>
        </WinBtn>
        <WinBtn onClick={onClose} title="Close" close>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2"/>
            <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </WinBtn>
      </div>
    </div>
  )
}

function WinBtn({ onClick, title, close, children }: {
  onClick: () => void
  title:   string
  close?:  boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center w-11 h-full text-[#888] transition-colors ${
        close ? 'hover:bg-red-600 hover:text-white' : 'hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function GearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}
