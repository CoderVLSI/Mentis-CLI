interface Props {
  onMinimize: () => void
  onMaximize: () => void
  onClose:    () => void
}

export default function TitleBar({ onMinimize, onMaximize, onClose }: Props) {
  return (
    <div className="titlebar flex items-center justify-between h-10 px-4 bg-surface border-b border-border shrink-0 z-50">
      {/* Traffic lights */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onClose}
          className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-110 transition-all"
          title="Close"
        />
        <button
          onClick={onMinimize}
          className="w-3 h-3 rounded-full bg-[#febc2e] hover:brightness-110 transition-all"
          title="Minimize"
        />
        <button
          onClick={onMaximize}
          className="w-3 h-3 rounded-full bg-[#28c840] hover:brightness-110 transition-all"
          title="Maximize"
        />
      </div>

      {/* Title */}
      <span className="text-[11px] font-medium text-muted tracking-widest uppercase">
        Mentis
      </span>

      {/* Spacer */}
      <div className="w-16" />
    </div>
  )
}
