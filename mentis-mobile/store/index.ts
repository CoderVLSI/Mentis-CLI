import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'

// ── Types ────────────────────────────────────────────────────────────────────

export interface Message {
  id:        string
  role:      'user' | 'assistant'
  content:   string
  timestamp: number
}

export interface Session {
  id:           string
  title:        string
  createdAt:    number
  updatedAt:    number
  messageCount: number
}

export type SyncMode = 'standalone' | 'desktop'

export interface Settings {
  syncMode:        SyncMode
  desktopHost:     string   // e.g. "192.168.1.5:3747"
  anthropicKey:    string
  ollamaUrl:       string
  provider:        'anthropic' | 'ollama'
  model:           string
}

// ── Settings store ────────────────────────────────────────────────────────────

interface SettingsState extends Settings {
  loaded: boolean
  load:   () => Promise<void>
  save:   (patch: Partial<Settings>) => Promise<void>
}

const DEFAULT_SETTINGS: Settings = {
  syncMode:     'standalone',
  desktopHost:  '192.168.1.1:3747',
  anthropicKey: '',
  ollamaUrl:    'http://localhost:11434/v1',
  provider:     'anthropic',
  model:        'claude-sonnet-4-6',
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem('mentis:settings')
      const stored = raw ? JSON.parse(raw) : {}
      // API key is in SecureStore
      const key = await SecureStore.getItemAsync('mentis:anthropic_key').catch(() => '')
      set({ ...DEFAULT_SETTINGS, ...stored, anthropicKey: key ?? '', loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  save: async (patch) => {
    const next = { ...get(), ...patch }
    set(next)
    // Keep API key in SecureStore, everything else in AsyncStorage
    const { anthropicKey, loaded, load, save, ...rest } = next
    await AsyncStorage.setItem('mentis:settings', JSON.stringify(rest))
    if (patch.anthropicKey !== undefined) {
      await SecureStore.setItemAsync('mentis:anthropic_key', patch.anthropicKey)
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
  streaming:     boolean
  thinking:      boolean

  setSessions:      (s: Session[]) => void
  setActiveSession: (id: string | null) => void
  setFeed:          (f: Message[]) => void
  addMessage:       (m: Message) => void
  appendChunk:      (id: string, text: string) => void
  setStreaming:     (v: boolean) => void
  setThinking:      (v: boolean) => void
  newPendingMsg:    () => string
}

export const useChat = create<ChatState>((set) => ({
  sessions:      [],
  activeSession: null,
  feed:          [],
  streaming:     false,
  thinking:      false,

  setSessions:      (sessions) => set({ sessions }),
  setActiveSession: (activeSession) => set({ activeSession }),
  setFeed:          (feed) => set({ feed }),
  addMessage:       (m) => set(s => ({ feed: [...s.feed, m] })),
  setStreaming:     (streaming) => set({ streaming }),
  setThinking:     (thinking) => set({ thinking }),

  newPendingMsg: () => {
    const id = uid()
    set(s => ({ feed: [...s.feed, { id, role: 'assistant', content: '', timestamp: Date.now() }] }))
    return id
  },

  appendChunk: (id, text) => set(s => ({
    feed: s.feed.map(m => m.id === id ? { ...m, content: m.content + text } : m)
  })),
}))
