export type MsgRole = 'user' | 'assistant' | 'tool' | 'system'

export interface ChatMessage {
  id: string
  role: MsgRole
  content: string
  timestamp: number
}

export interface ToolSummaryMessage {
  id: string
  type: 'tool_summary'
  names: string[]
  count: number
  timestamp: number
}

export type FeedItem = ChatMessage | ToolSummaryMessage

export interface ToolEvent {
  id: string
  name: string
  args: Record<string, unknown>
  result?: string
  status: 'pending' | 'approved' | 'denied' | 'done'
  needsApproval: boolean
  preview?: string
}

export interface SessionInfo {
  mode: 'PLAN' | 'BUILD'
  cwd: string
  messageCount: number
  model?: string
  sessionId?: string
}

export interface SessionMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

export interface McpServer {
  name: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  autoConnect?: boolean
}

export interface HookEntry {
  command: string
  blocking?: boolean
}

declare global {
  interface Window {
    mentis: {
      // Chat
      sendMessage:  (msg: string) => Promise<{ ok: boolean }>
      cancelChat:   () => Promise<{ ok: boolean }>
      getHistory:   () => Promise<Array<{ role: MsgRole; content?: string }>>
      clearHistory: () => Promise<{ ok: boolean }>

      // Approval
      respondApproval: (id: string, approved: boolean) => Promise<{ ok: boolean }>

      // Current session
      getSession: () => Promise<SessionInfo>
      setMode:    (mode: 'PLAN' | 'BUILD') => Promise<{ ok: boolean }>
      setCwd:     (cwd: string) => Promise<{ ok: boolean }>

      // Multi-session
      listSessions:  () => Promise<SessionMeta[]>
      newSession:    () => Promise<{ ok: boolean; id: string }>
      loadSession:   (id: string) => Promise<{ ok: boolean; history: Array<{ role: MsgRole; content?: string }> }>
      deleteSession: (id: string) => Promise<{ ok: boolean }>
      renameSession: (id: string, title: string) => Promise<{ ok: boolean }>

      // Config
      getConfig:   () => Promise<Record<string, unknown>>
      setModel:    (model: string)    => Promise<{ ok: boolean }>
      setProvider: (provider: string) => Promise<{ ok: boolean }>

      // MCP + Hooks
      listMcp:   () => Promise<McpServer[]>
      listHooks: () => Promise<Record<string, HookEntry[]>>

      // Window
      pickFolder: () => Promise<string | null>
      minimize:   () => void
      maximize:   () => void
      close:      () => void

      // Platform
      platform: string

      // Events
      on: (channel: string, fn: (...args: unknown[]) => void) => () => void
    }
  }
}
