export type MsgRole = 'user' | 'assistant' | 'tool' | 'system'

export interface ChatMessage {
  id: string
  role: MsgRole
  content: string
  timestamp: number
}

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
}

export type AppEvent =
  | { type: 'thinking';        data: { text: string } }
  | { type: 'message_start';   data: { role: 'assistant' } }
  | { type: 'message_chunk';   data: { text: string } }
  | { type: 'message_end';     data: { content: string } }
  | { type: 'tool_start';      data: { id: string; name: string; args: Record<string, unknown> } }
  | { type: 'tool_result';     data: { id: string; name: string; result: string } }
  | { type: 'approval_needed'; data: { id: string; name: string; args: Record<string, unknown>; preview?: string } }
  | { type: 'approval_done';   data: { id: string; approved: boolean } }
  | { type: 'error';           data: { message: string } }
  | { type: 'session_update';  data: { messageCount: number; mode: 'PLAN' | 'BUILD'; model: string; cwd: string } }

declare global {
  interface Window {
    mentis: {
      sendMessage:     (msg: string) => Promise<{ ok: boolean }>
      cancelChat:      () => Promise<{ ok: boolean }>
      getHistory:      () => Promise<Array<{ role: MsgRole; content?: string }>>
      clearHistory:    () => Promise<{ ok: boolean }>
      respondApproval: (id: string, approved: boolean) => Promise<{ ok: boolean }>
      getSession:      () => Promise<SessionInfo>
      setMode:         (mode: 'PLAN' | 'BUILD') => Promise<{ ok: boolean }>
      setCwd:          (cwd: string) => Promise<{ ok: boolean }>
      pickFolder:      () => Promise<string | null>
      minimize:        () => void
      maximize:        () => void
      close:           () => void
      on:              (channel: string, fn: (...args: unknown[]) => void) => () => void
    }
  }
}
