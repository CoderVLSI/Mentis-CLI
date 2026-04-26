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
export type Provider = 'anthropic' | 'openai' | 'gemini' | 'grok' | 'kimi' | 'glm' | 'openrouter' | 'ollama'

export interface Settings {
  syncMode:       SyncMode
  desktopHost:    string
  // API keys (stored in SecureStore)
  anthropicKey:   string
  openaiKey:      string
  geminiKey:      string
  grokKey:        string
  kimiKey:        string
  glmKey:         string
  openrouterKey:  string
  githubToken:    string
  // Non-sensitive settings
  ollamaUrl:      string
  provider:       Provider
  model:          string
  githubRepo:     string
  githubBranch:   string
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
  openaiKey:     '',
  geminiKey:     '',
  grokKey:       '',
  kimiKey:       '',
  glmKey:        '',
  openrouterKey: '',
  githubToken:   '',
  ollamaUrl:     'http://localhost:11434/v1',
  provider:      'anthropic',
  model:         'claude-sonnet-4-6',
  githubRepo:    '',
  githubBranch:  'main',
}

const SECURE_KEYS = ['anthropicKey', 'openaiKey', 'geminiKey', 'grokKey', 'kimiKey', 'glmKey', 'openrouterKey', 'githubToken'] as const
type SecureKey = typeof SECURE_KEYS[number]

const SECURE_STORE_ID: Record<SecureKey, string> = {
  anthropicKey:  'mentis:anthropic_key',
  openaiKey:     'mentis:openai_key',
  geminiKey:     'mentis:gemini_key',
  grokKey:       'mentis:grok_key',
  kimiKey:       'mentis:kimi_key',
  glmKey:        'mentis:glm_key',
  openrouterKey: 'mentis:openrouter_key',
  githubToken:   'mentis:github_token',
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  load: async () => {
    try {
      const raw    = await AsyncStorage.getItem('mentis:settings')
      const stored = raw ? JSON.parse(raw) : {}
      const secure: Partial<Settings> = {}
      for (const k of SECURE_KEYS) {
        secure[k] = (await SecureStore.getItemAsync(SECURE_STORE_ID[k]).catch(() => '')) ?? ''
      }
      set({ ...DEFAULTS, ...stored, ...secure, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  save: async (patch) => {
    const next = { ...get(), ...patch }
    set(next)
    // Persist non-secure fields to AsyncStorage
    const { loaded, load, save, ...allSettings } = next
    const toStore = { ...allSettings } as Record<string, unknown>
    for (const k of SECURE_KEYS) delete toStore[k]
    await AsyncStorage.setItem('mentis:settings', JSON.stringify(toStore))
    // Persist secure fields to SecureStore
    for (const k of SECURE_KEYS) {
      if ((patch as Record<string, unknown>)[k] !== undefined) {
        await SecureStore.setItemAsync(SECURE_STORE_ID[k], (next[k] as string) ?? '')
      }
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
