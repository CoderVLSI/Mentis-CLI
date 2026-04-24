interface Props {
  onMinimize: () => void
  onMaximize: () => void
  onClose:    () => void
}

const isMac = typeof window !== 'undefined' && window.mentis?.platform === 'darwin'

export default function TitleBar({ onMinimize, onMaximize, onClose }: Props) {
  return isMac ? (
    <MacTitleBar onMinimize={onMinimize} onMaximize={onMaximize} onClose={onClose} />
  ) : (
    <WinTitleBar onMinimize={onMinimize} onMaximize={onMaximize} onClose={onClose} />
  )
}

function MacTitleBar({ onMinimize, onMaximize, onClose }: Props) {
  return (
    <div className="titlebar flex items-center justify-between h-10 px-4 bg-surface border-b border-border shrink-0 z-50">
      <div className="flex items-center gap-1.5">
        <button onClick={onClose}    className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-110 transition-all" />
        <button onClick={onMinimize} className="w-3 h-3 rounded-full bg-[#febc2e] hover:brightness-110 transition-all" />
        <button onClick={onMaximize} className="w-3 h-3 rounded-full bg-[#28c840] hover:brightness-110 transition-all" />
      </div>
      <span className="text-[11px] font-medium text-muted tracking-widest uppercase">Mentis</span>
      <div className="w-16" />
    </div>
  )
}

function WinTitleBar({ onMinimize, onMaximize, onClose }: Props) {
  return (
    <div className="titlebar flex items-center justify-between h-9 bg-[#0a0a0a] border-b border-border shrink-0 z-50 select-none">
      {/* Left: icon + title */}
      <div className="flex items-center gap-2 px-3">
        <div className="w-4 h-4 rounded-sm bg-accent/30 flex items-center justify-center">
          <span className="text-[9px] font-bold text-purple-300">M</span>
        </div>
        <span className="text-[11px] font-medium text-[#888] tracking-wide">Mentis</span>
      </div>

      {/* Right: Windows controls */}
      <div className="flex h-full">
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
        close
          ? 'hover:bg-red-600 hover:text-white'
          : 'hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}
