import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChatMessage, ToolEvent } from '../types'
import ToolCallCard from './ToolCallCard'

interface Props {
  messages:  ChatMessage[]
  tools:     Map<string, ToolEvent>
  thinking:  boolean
  streaming: boolean
  onApprove: (id: string, approved: boolean) => void
}

export default function ChatPane({ messages, tools, thinking, onApprove }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, tools, thinking])

  const toolList = Array.from(tools.values())

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3 select-text">
      {messages.length === 0 && !thinking && (
        <EmptyState />
      )}

      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {/* Tool call cards — shown inline after last assistant message */}
      {toolList.length > 0 && (
        <div className="flex flex-col gap-2 max-w-[720px] w-full self-start pl-0">
          {toolList.map(t => (
            <ToolCallCard key={t.id} tool={t} onApprove={onApprove} />
          ))}
        </div>
      )}

      {thinking && <ThinkingIndicator />}

      <div ref={bottomRef} />
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end fade-in">
        <div className="max-w-[640px] px-4 py-2.5 rounded-2xl rounded-tr-sm bg-accent/20 border border-accent/30 text-[#ddd] text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
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
        {message.content ? (
          <div className="prose text-sm text-[#ddd]">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '')
                  const isBlock = !!match
                  return isBlock ? (
                    <div className="relative my-2">
                      {match && (
                        <div className="flex items-center justify-between bg-[#0a0a0a] px-3 py-1 rounded-t border border-b-0 border-[#2a2a2a]">
                          <span className="text-[10px] text-muted font-mono uppercase">{match[1]}</span>
                        </div>
                      )}
                      <pre className="!mt-0 !rounded-t-none border-t-0">
                        <code className={className} {...props}>{children}</code>
                      </pre>
                    </div>
                  ) : (
                    <code className={className} {...props}>{children}</code>
                  )
                },
                pre({ children }) {
                  return <>{children}</>
                }
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
  const tips = [
    'Ask me to build, fix, or explain anything.',
    'Use /plan to design before building.',
    'I can read, write, edit files and run commands.',
    'Type a task and I\'ll figure out the steps.',
  ]
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 py-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
        <span className="text-2xl font-bold text-purple-300">M</span>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-[#ddd] mb-1">Mentis Desktop</h2>
        <p className="text-muted text-sm">Your AI coding agent</p>
      </div>
      <div className="flex flex-col gap-2 max-w-xs">
        {tips.map((t, i) => (
          <div key={i} className="text-xs text-muted bg-panel border border-border rounded-lg px-4 py-2">
            {t}
          </div>
        ))}
      </div>
    </div>
  )
}
