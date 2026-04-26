import { useCallback, useRef, useState } from 'react'
import {
  Alert, FlatList, KeyboardAvoidingView, Platform,
  SafeAreaView, Share, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useChat, useSettings, Message, Mode } from '../../store'
import { streamStandaloneChat, StandaloneProvider } from '../../services/anthropicClient'
import { streamChat, newSession, approveAction, setDesktopMode, SyncEvent } from '../../services/mentisClient'
import ChatBubble from '../../components/ChatBubble'
import ChatInput from '../../components/ChatInput'
import ThinkingDot from '../../components/ThinkingDot'
import ToolCard from '../../components/ToolCard'
import ModelPicker from '../../components/ModelPicker'
import DrawerNav from '../../components/DrawerNav'
import { C } from '../../constants/theme'

export default function ChatScreen() {
  const chat     = useChat()
  const settings = useSettings()
  const abortRef = useRef<AbortController | null>(null)
  const listRef  = useRef<FlatList>(null)
  const [error, setError]                     = useState<string | null>(null)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [drawerOpen, setDrawerOpen]           = useState(false)
  const pendingId = useRef<string | null>(null)

  const startNewChat = useCallback(async () => {
    chat.clearChat()
    if (settings.syncMode === 'desktop') {
      try {
        const { id } = await newSession(settings.desktopHost)
        chat.setActiveSession(id)
      } catch { /* ignore — chat already cleared */ }
    }
  }, [chat, settings])

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60)
  }, [])

  // ── Slash command handler ──────────────────────────────────────────────────
  const handleSlash = (text: string): boolean => {
    const cmd = text.trim().toLowerCase()
    if (cmd === '/clear') { chat.clearChat(); return true }
    if (cmd === '/plan')  { toggleMode('PLAN');  return true }
    if (cmd === '/build') { toggleMode('BUILD'); return true }
    if (cmd === '/status') {
      Alert.alert('Status',
        `Mode: ${chat.mode}\nModel: ${settings.model}\nProvider: ${settings.provider}\nSync: ${settings.syncMode}`
      )
      return true
    }
    return false
  }

  // ── Mode toggle — syncs to desktop in desktop mode ─────────────────────────
  const toggleMode = useCallback(async (force?: Mode) => {
    const next: Mode = force ?? (chat.mode === 'PLAN' ? 'BUILD' : 'PLAN')
    chat.setMode(next)
    if (settings.syncMode === 'desktop') {
      await setDesktopMode(settings.desktopHost, next).catch(() => {})
    }
  }, [chat, settings])

  // ── Tool approval — in desktop mode hits the sync server ──────────────────
  const handleApprove = useCallback(async (id: string, approved: boolean) => {
    const tool = chat.tools.get(id)
    if (!tool) return
    chat.upsertTool({ ...tool, status: approved ? 'approved' : 'denied', needsApproval: false })
    if (settings.syncMode === 'desktop') {
      await approveAction(settings.desktopHost, id, approved).catch(() => {})
    }
  }, [chat, settings])

  // ── Send message ───────────────────────────────────────────────────────────
  const send = useCallback(async (text: string) => {
    if (chat.streaming) return
    if (handleSlash(text)) return
    setError(null)
    chat.clearTools()
    chat.setThinking(true)

    chat.addMessage({ id: `u${Date.now()}`, role: 'user', content: text, timestamp: Date.now() })
    scrollToEnd()

    const msgId = chat.newPendingMsg()
    pendingId.current = msgId
    scrollToEnd()

    if (settings.syncMode === 'desktop') {
      // ── Desktop mode: stream all engine events via sync server ──────────
      await streamChat(
        settings.desktopHost,
        text,
        chat.activeSession,
        (evt: SyncEvent) => {
          switch (evt.type) {
            case 'thinking':
              chat.setThinking(true)
              break
            case 'chunk':
              chat.appendChunk(msgId, evt.text)
              chat.setStreaming(true)
              chat.setThinking(false)
              scrollToEnd()
              break
            case 'tool_summary':
              // No-op on mobile — tool cards appear via tool_start events
              break
            case 'tool_start':
              chat.upsertTool({ id: evt.id, name: evt.name, args: evt.args, status: 'pending', needsApproval: false })
              break
            case 'approval_needed':
              chat.upsertTool({ id: evt.id, name: evt.name, args: evt.args, status: 'pending', needsApproval: true })
              scrollToEnd()
              break
            case 'approval_done':
              {
                const t = chat.tools.get(evt.id)
                if (t) chat.upsertTool({ ...t, status: evt.approved ? 'approved' : 'denied', needsApproval: false })
              }
              break
            case 'tool_result':
              {
                const t = chat.tools.get(evt.id)
                if (t) chat.upsertTool({ ...t, result: evt.result, status: 'done' })
              }
              break
            case 'done':
              chat.setStreaming(false)
              chat.setThinking(false)
              pendingId.current = null
              break
            case 'error':
              setError(evt.message)
              chat.setStreaming(false)
              chat.setThinking(false)
              pendingId.current = null
              break
          }
        },
      )
    } else {
      // ── Standalone mode: direct provider API call ──────────────────────
      abortRef.current = new AbortController()
      const history = chat.feed
        .filter(m => m.content)
        .map(m => ({ role: m.role, content: m.content })) as Array<{ role: 'user' | 'assistant'; content: string }>

      const provider  = settings.provider as StandaloneProvider
      const apiKey    = provider === 'openrouter' ? settings.openrouterKey : settings.anthropicKey

      await streamStandaloneChat(
        provider === 'ollama' ? 'openrouter' : provider, // Ollama goes through desktop mode; fallback to anthropic
        apiKey,
        settings.model,
        history,
        text,
        (chunk) => { chat.appendChunk(msgId, chunk); chat.setStreaming(true); chat.setThinking(false); scrollToEnd() },
        () => { chat.setStreaming(false); chat.setThinking(false); pendingId.current = null },
        (err) => { setError(err); chat.setStreaming(false); chat.setThinking(false); pendingId.current = null },
        abortRef.current.signal,
      )
    }
  }, [chat, settings, scrollToEnd])

  const cancel = () => {
    abortRef.current?.abort()
    chat.setStreaming(false)
    chat.setThinking(false)
  }

  const exportChat = async () => {
    const lines = chat.feed.map(m =>
      m.role === 'user' ? `**You:** ${m.content}` : `**Mentis:** ${m.content}`
    ).join('\n\n')
    await Share.share({ message: lines, title: 'Mentis Chat Export' })
  }

  // ── Render feed items ──────────────────────────────────────────────────────
  type FeedRow = { type: 'msg'; data: Message } | { type: 'thinking' }
  const feedRows: FeedRow[] = [
    ...chat.feed.map(m => ({ type: 'msg' as const, data: m })),
    ...(chat.thinking ? [{ type: 'thinking' as const }] : []),
  ]

  const pendingTools = Array.from(chat.tools.values()).filter(t => t.needsApproval && t.status === 'pending')

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.hamburger}
            onPress={() => setDrawerOpen(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="menu" size={20} color={C.muted2} />
          </TouchableOpacity>
          <View style={styles.logo}><Text style={styles.logoText}>M</Text></View>
          <Text style={styles.headerTitle}>Mentis</Text>
        </View>

        <View style={styles.headerRight}>
          {/* Mode toggle */}
          <TouchableOpacity
            style={[styles.badge, chat.mode === 'PLAN' ? styles.badgePlan : styles.badgeBuild]}
            onPress={() => toggleMode()}
          >
            <Text style={[styles.badgeText, { color: chat.mode === 'PLAN' ? C.yellow : C.green }]}>
              {chat.mode === 'PLAN' ? '⏸ PLAN' : '▶ BUILD'}
            </Text>
          </TouchableOpacity>

          {/* Model selector */}
          <TouchableOpacity style={styles.modelBtn} onPress={() => setModelPickerOpen(true)}>
            <Text style={styles.modelText} numberOfLines={1}>
              {settings.model.replace('claude-', '').replace('-4-7', ' Opus').replace('-4-6', ' Sonnet').replace('-4-5-20251001', ' Haiku')}
            </Text>
            <Text style={styles.modelChevron}>▾</Text>
          </TouchableOpacity>

          {/* Export */}
          {chat.feed.length > 0 && (
            <TouchableOpacity style={styles.iconBtn} onPress={exportChat}>
              <Text style={styles.iconBtnText}>↑</Text>
            </TouchableOpacity>
          )}

          {/* Clear */}
          {chat.feed.length > 0 && (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => Alert.alert('Clear chat?', 'This cannot be undone.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: chat.clearChat },
              ])}
            >
              <Text style={styles.iconBtnText}>⌫</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Sync badge */}
      {settings.syncMode === 'desktop' && (
        <View style={styles.syncBar}>
          <Text style={styles.syncText}>⬡ Desktop sync · {settings.desktopHost}</Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        {/* Pending tool approvals */}
        {pendingTools.map(t => (
          <ToolCard key={t.id} tool={t} onApprove={handleApprove} />
        ))}

        {/* Feed */}
        <FlatList
          ref={listRef}
          data={feedRows}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) =>
            item.type === 'thinking'
              ? <ThinkingDot />
              : <ChatBubble
                  message={item.data}
                  isStreaming={item.data.id === pendingId.current && chat.streaming}
                />
          }
          contentContainerStyle={styles.feedContent}
          ListEmptyComponent={<EmptyState mode={chat.mode} syncMode={settings.syncMode} />}
          onContentSizeChange={scrollToEnd}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        />

        {/* Error */}
        {error && (
          <TouchableOpacity style={styles.errorBanner} onPress={() => setError(null)}>
            <Text style={styles.errorText}>⚠ {error}  (tap to dismiss)</Text>
          </TouchableOpacity>
        )}

        <ChatInput onSend={send} onCancel={cancel} streaming={chat.streaming || chat.thinking} />
      </KeyboardAvoidingView>

      <ModelPicker visible={modelPickerOpen} onClose={() => setModelPickerOpen(false)} />

      <DrawerNav
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNewChat={startNewChat}
      />
    </SafeAreaView>
  )
}

function EmptyState({ mode, syncMode }: { mode: Mode; syncMode: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyM}>M</Text>
      <Text style={styles.emptyTitle}>Mentis</Text>
      <Text style={styles.emptySub}>
        {syncMode === 'desktop' ? 'Connected to desktop' : 'AI coding assistant'}
      </Text>
      <View style={styles.emptyHints}>
        {mode === 'PLAN'
          ? [
              '⏸ PLAN mode — analysis only',
              'Agent reads files and produces a plan',
              'Tap PLAN to switch to BUILD mode',
            ].map(h => <Text key={h} style={styles.emptyHint}>{h}</Text>)
          : [
              '/plan — plan before coding',
              '/build — switch to build mode',
              '/clear — clear history',
            ].map(h => <Text key={h} style={styles.emptyHint}>{h}</Text>)
        }
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hamburger:    { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  logo:         { width: 26, height: 26, borderRadius: 7, backgroundColor: C.accent + '33', alignItems: 'center', justifyContent: 'center' },
  logoText:     { fontSize: 12, fontWeight: '800', color: C.accentL },
  headerTitle:  { fontSize: 15, fontWeight: '700', color: C.text },
  headerRight:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, borderWidth: 1 },
  badgePlan:    { borderColor: C.yellow + '44', backgroundColor: C.yellow + '18' },
  badgeBuild:   { borderColor: C.green  + '44', backgroundColor: C.green  + '18' },
  badgeText:    { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  modelBtn:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: C.panel2, borderRadius: 7, borderWidth: 1, borderColor: C.border2, maxWidth: 110 },
  modelText:    { fontSize: 11, color: C.muted2, fontFamily: 'Courier New', flex: 1 },
  modelChevron: { fontSize: 10, color: C.muted },
  iconBtn:      { width: 28, height: 28, borderRadius: 7, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.border2, alignItems: 'center', justifyContent: 'center' },
  iconBtnText:  { fontSize: 14, color: C.muted2 },
  syncBar:      { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: C.accent + '18', borderBottomWidth: 1, borderBottomColor: C.accent + '33' },
  syncText:     { fontSize: 11, color: C.accentL },
  feedContent:  { paddingTop: 12, paddingBottom: 8, flexGrow: 1 },
  errorBanner:  { marginHorizontal: 12, marginBottom: 4, backgroundColor: C.red + '22', borderWidth: 1, borderColor: C.red + '44', borderRadius: 8, padding: 10 },
  errorText:    { color: C.red, fontSize: 12 },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 6 },
  emptyM:       { fontSize: 36, fontWeight: '800', color: C.accent },
  emptyTitle:   { fontSize: 20, fontWeight: '700', color: C.text },
  emptySub:     { fontSize: 13, color: C.muted2, marginBottom: 16 },
  emptyHints:   { gap: 6, alignItems: 'center' },
  emptyHint:    { fontSize: 12, color: C.muted, fontFamily: 'Courier New' },
})
