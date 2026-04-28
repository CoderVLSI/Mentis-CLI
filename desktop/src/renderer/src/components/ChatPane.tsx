import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChatMessage, FeedItem, ToolEvent, ToolSummaryMessage } from '../types'
import ToolCallCard from './ToolCallCard'

interface Props {
  feed:      FeedItem[]
  tools:     Map<string, ToolEvent>
  thinking:  boolean
  streaming: boolean
  onApprove: (id: string, approved: boolean) => void
}

const TOOL_LABELS: Record<string, string> = {
  read_file:  'read',
  write_file: 'write',
  edit_file:  'edit',
  list_dir:   'list',
  run_shell:  'shell',
  web_search: 'search',
}

function toolSummaryText(names: string[]): string {
  const counts: Record<string, number> = {}
  for (const n of names) counts[n] = (counts[n] || 0) + 1
  return Object.entries(counts)
    .map(([n, c]) => `${TOOL_LABELS[n] || n}${c > 1 ? ` ×${c}` : ''}`)
    .join(' · ')
}

export default function ChatPane({ feed, tools, thinking, onApprove }: Props) {
  const bottomRef              = useRef<HTMLDivElement>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [feed, tools, thinking])

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightbox) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightbox])

  const toolList = Array.from(tools.values())

  // When tools are running, defer the pending assistant message to render AFTER tool cards.
  // Only defer if the message already has content — empty placeholders are hidden by the
  // ThinkingIndicator, so there's nothing to reorder.
  const lastItem    = feed[feed.length - 1]
  const hasTools    = toolList.length > 0 || thinking
  const lastIsAssistantWithContent =
    !!lastItem &&
    (lastItem as ChatMessage).role === 'assistant' &&
    !!(lastItem as ChatMessage).content &&
    (lastItem as ToolSummaryMessage).type !== 'tool_summary'
  const shouldDefer  = hasTools && lastIsAssistantWithContent
  const visibleFeed  = shouldDefer ? feed.slice(0, -1) : feed
  const deferredMsg  = shouldDefer ? (lastItem as ChatMessage) : null

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2 select-text">
      {feed.length === 0 && !thinking && <EmptyState />}

      {visibleFeed.map(item => {
        if ((item as ToolSummaryMessage).type === 'tool_summary') {
          const s = item as ToolSummaryMessage
          return <ToolSummaryLine key={s.id} names={s.names} count={s.count} />
        }
        const msg = item as ChatMessage
        // Hide empty assistant placeholders — ThinkingIndicator covers the waiting state
        if (msg.role === 'assistant' && !msg.content) return null
        return <MessageBubble key={item.id} message={msg} onImageClick={setLightbox} />
      })}

      {toolList.length > 0 && (
        <div className="flex flex-col gap-1.5 max-w-[680px] w-full pl-9">
          {toolList.map(t => <ToolCallCard key={t.id} tool={t} onApprove={onApprove} />)}
        </div>
      )}

      {deferredMsg && <MessageBubble key={deferredMsg.id} message={deferredMsg} onImageClick={setLightbox} />}

      {thinking && <ThinkingIndicator />}
      <div ref={bottomRef} />

      {/* Lightbox overlay */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors"
            onClick={() => setLightbox(null)}
          >✕</button>
          <img
            src={lightbox}
            alt="Preview"
            className="max-w-[92vw] max-h-[92vh] object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

function ToolSummaryLine({ names, count }: { names: string[]; count: number }) {
  return (
    <div className="flex items-center gap-2 py-0.5 pl-9 fade-in">
      <div className="flex items-center gap-1.5 text-[10px] text-muted/70 bg-[#111] border border-border/60 rounded-full px-2.5 py-0.5">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent/50 shrink-0">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
        <span className="font-mono">{toolSummaryText(names)}</span>
        {count > 1 && <span className="text-muted/50">({count})</span>}
      </div>
    </div>
  )
}

function MessageBubble({ message, onImageClick }: { message: ChatMessage; onImageClick: (src: string) => void }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end fade-in">
        <div className="flex flex-col items-end gap-1.5 max-w-[640px]">
          {/* Image previews */}
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap gap-1.5 justify-end">
              {message.images.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  onClick={() => onImageClick(src)}
                  className="h-32 max-w-[200px] object-cover rounded-xl border border-accent/20 cursor-zoom-in hover:border-accent/60 transition-all hover:scale-[1.02]"
                />
              ))}
            </div>
          )}
          {/* Text bubble — only show if there's text */}
          {typeof message.content === 'string' && message.content && (
            <div className="px-4 py-2.5 rounded-2xl rounded-tr-sm bg-accent/15 border border-accent/25 text-[#ddd] text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 fade-in max-w-[720px]">
      <div className="w-6 h-6 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-[10px] text-purple-300 font-bold">M</span>
      </div>
      <div className="flex-1 min-w-0">
        {typeof message.content === 'string' && message.content ? (
          <div className="prose text-sm text-[#ddd]">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '')
                  const isBlock = !!match
                  return isBlock ? (
                    <CodeBlock lang={match?.[1]} className={className} {...props}>{children}</CodeBlock>
                  ) : (
                    <code className={className} {...props}>{children}</code>
                  )
                },
                pre({ children }) { return <>{children}</> }
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        ) : (
          <span className="cursor-blink text-muted">▋</span>
        )}
      </div>
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <div className="flex gap-3 items-center fade-in">
      <div className="w-6 h-6 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center shrink-0">
        <span className="text-[10px] text-purple-300 font-bold">M</span>
      </div>
      <span className="thinking-shimmer text-sm font-mono">Thinking...</span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
        <span className="text-2xl font-bold text-purple-300">M</span>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-[#ddd] mb-1">Mentis Desktop</h2>
        <p className="text-muted text-sm">Your AI coding agent</p>
      </div>
      <div className="grid grid-cols-2 gap-2 max-w-sm">
        {[
          ['Build a feature', 'Describe what to create'],
          ['/plan', 'Design before building'],
          ['Fix a bug', 'Paste the error or file'],
          ['/status', 'View session info'],
        ].map(([title, desc]) => (
          <div key={title} className="text-left bg-panel border border-border rounded-xl px-3 py-2.5">
            <div className="text-[11px] font-medium text-[#ccc] mb-0.5">{title}</div>
            <div className="text-[10px] text-muted">{desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Code block with copy button ────────────────────────────────────────────────

function CodeBlock({ lang, children, className, ...props }: {
  lang?: string; children?: React.ReactNode; className?: string; [k: string]: unknown
}) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    const text = extractText(children)
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div className="relative my-2 group">
      <div className="flex items-center justify-between bg-[#0a0a0a] px-3 py-1 rounded-t border border-b-0 border-[#2a2a2a]">
        <span className="text-[10px] text-muted font-mono uppercase">{lang || 'code'}</span>
        <button
          onClick={copy}
          className="text-[10px] text-muted hover:text-[#ccc] transition-colors flex items-center gap-1 opacity-0 group-hover:opacity-100"
          title="Copy code"
        >
          {copied ? (<><CheckIcon /> Copied</>) : (<><CopyIcon /> Copy</>)}
        </button>
      </div>
      <pre className="!mt-0 !rounded-t-none border-t-0">
        <code className={className} {...props}>{children}</code>
      </pre>
    </div>
  )
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node))     return node.map(extractText).join('')
  if (node && typeof node === 'object' && 'props' in (node as object))
    return extractText((node as React.ReactElement).props.children)
  return ''
}

const CopyIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
)
const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
