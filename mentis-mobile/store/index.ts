import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Message {
  id:        string
  role:      'user' | 'assistant'
  content:   string
  timestamp: number
}

export interface ToolEvent {
  id:          string
  name:        string
  status:      'pending' | 'done' | 'approved' | 'denied'
  args?:       Record<string, unknown>
  result?:     string
  needsApproval: boolean
}

export interface Session {
  id:           string
  title:        string
  createdAt:    number
  updatedAt:    number
  messageCount: number
}

export type SyncMode = 'standalone' | 'desktop'
export type Mode     = 'PLAN' | 'BUILD'

export interface Settings {
  syncMode:       SyncMode
  desktopHost:    string
  anthropicKey:   string
  openrouterKey:  string
  ollamaUrl:      string
  provider:       'anthropic' | 'openrouter' | 'ollama'
  model:          string
}

// ── Settings store ────────────────────────────────────────────────────────────

interface SettingsState extends Settings {
  loaded: boolean
  load:   () => Promise<void>
  save:   (patch: Partial<Settings>) => Promise<void>
}

const DEFAULTS: Settings = {
  syncMode:      'standalone',
  desktopHost:   '192.168.1.1:3747',
  anthropicKey:  '',
  openrouterKey: '',
  ollamaUrl:     'http://localhost:11434/v1',
  provider:      'anthropic',
  model:         'claude-sonnet-4-6',
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem('mentis:settings')
      const stored = raw ? JSON.parse(raw) : {}
      const key    = await SecureStore.getItemAsync('mentis:anthropic_key').catch(() => '')
      const orKey  = await SecureStore.getItemAsync('mentis:openrouter_key').catch(() => '')
      set({ ...DEFAULTS, ...stored, anthropicKey: key ?? '', openrouterKey: orKey ?? '', loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  save: async (patch) => {
    const next = { ...get(), ...patch }
    set(next)
    const { anthropicKey, openrouterKey, loaded, load, save, ...rest } = next
    await AsyncStorage.setItem('mentis:settings', JSON.stringify(rest))
    if (patch.anthropicKey !== undefined) {
      await SecureStore.setItemAsync('mentis:anthropic_key', patch.anthropicKey)
    }
    if (patch.openrouterKey !== undefined) {
      await SecureStore.setItemAsync('mentis:openrouter_key', patch.openrouterKey)
    }
  },
}))

// ── Chat store ────────────────────────────────────────────────────────────────

let _id = 0
const uid = () => `m${++_id}`

interface ChatState {
  sessions:      Session[]
  activeSession: string | null
  feed:          Message[]
  tools:         Map<string, ToolEvent>
  streaming:     boolean
  thinking:      boolean
  mode:          Mode

  setSessions:      (s: Session[]) => void
  setActiveSession: (id: string | null) => void
  setFeed:          (f: Message[]) => void
  addMessage:       (m: Message) => void
  newPendingMsg:    () => string
  appendChunk:      (id: string, text: string) => void
  setStreaming:     (v: boolean) => void
  setThinking:      (v: boolean) => void
  setMode:          (m: Mode) => void
  upsertTool:       (t: ToolEvent) => void
  clearTools:       () => void
  clearChat:        () => void
}

export const useChat = create<ChatState>((set) => ({
  sessions:      [],
  activeSession: null,
  feed:          [],
  tools:         new Map(),
  streaming:     false,
  thinking:      false,
  mode:          'BUILD',

  setSessions:      (sessions)      => set({ sessions }),
  setActiveSession: (activeSession) => set({ activeSession }),
  setFeed:          (feed)          => set({ feed }),
  setStreaming:     (streaming)     => set({ streaming }),
  setThinking:      (thinking)      => set({ thinking }),
  setMode:          (mode)          => set({ mode }),
  clearChat:        ()              => set({ feed: [], tools: new Map(), streaming: false, thinking: false }),

  addMessage: (m) => set(s => ({ feed: [...s.feed, m] })),

  newPendingMsg: () => {
    const id = uid()
    set(s => ({ feed: [...s.feed, { id, role: 'assistant', content: '', timestamp: Date.now() }] }))
    return id
  },

  appendChunk: (id, text) => set(s => ({
    feed: s.feed.map(m => m.id === id ? { ...m, content: m.content + text } : m)
  })),

  upsertTool: (t) => set(s => {
    const next = new Map(s.tools)
    next.set(t.id, t)
    return { tools: next }
  }),

  clearTools: () => set({ tools: new Map() }),
}))
