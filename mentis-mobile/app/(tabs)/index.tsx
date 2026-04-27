import { useCallback, useRef, useState } from 'react'
import {
  Alert, FlatList, KeyboardAvoidingView, Platform, StatusBar,
  SafeAreaView, Share, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useChat, useSettings, Message, Mode } from '../../store'
import { runStandaloneChat, EngineEvent, ImageAttachment } from '../../services/standaloneEngine'
import { streamChat, newSession, approveAction, setDesktopMode, SyncEvent } from '../../services/mentisClient'
import ChatBubble from '../../components/ChatBubble'
import ChatInput from '../../components/ChatInput'
import ThinkingDot from '../../components/ThinkingDot'
import ToolCard from '../../components/ToolCard'
import ModelPicker from '../../components/ModelPicker'
import DrawerNav from '../../components/DrawerNav'
import RepoPicker from '../../components/RepoPicker'
import { C } from '../../constants/theme'

export default function ChatScreen() {
  const chat     = useChat()
  const settings = useSettings()
  const abortRef          = useRef<AbortController | null>(null)
  const listRef           = useRef<FlatList>(null)
  const pendingApprovals  = useRef<Map<string, (approved: boolean) => void>>(new Map())
  const [error, setError]                     = useState<string | null>(null)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [drawerOpen, setDrawerOpen]           = useState(false)
  const [repoPickerOpen, setRepoPickerOpen]   = useState(false)
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

  // ── Tool approval ─────────────────────────────────────────────────────────
  const handleApprove = useCallback(async (id: string, approved: boolean) => {
    const tool = chat.tools.get(id)
    if (!tool) return
    chat.upsertTool({ ...tool, status: approved ? 'approved' : 'denied', needsApproval: false })

    if (settings.syncMode === 'desktop') {
      await approveAction(settings.desktopHost, id, approved).catch(() => {})
    } else {
      // Resolve the Promise held in the standalone engine loop
      const resolve = pendingApprovals.current.get(id)
      if (resolve) { resolve(approved); pendingApprovals.current.delete(id) }
    }
  }, [chat, settings])

  // ── Send message ───────────────────────────────────────────────────────────
  const send = useCallback(async (text: string, images?: ImageAttachment[]) => {
    if (chat.streaming) return
    if (!images?.length && handleSlash(text)) return
    setError(null)
    chat.clearTools()
    chat.setThinking(true)

    const displayText  = text || ''
    const imageUris    = images?.map(i => i.uri)
    chat.addMessage({ id: `u${Date.now()}`, role: 'user', content: displayText, timestamp: Date.now(), images: imageUris })
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
      // ── Standalone mode: tool-enabled engine with GitHub connector ─────
      abortRef.current = new AbortController()

      const history = chat.feed
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

      await runStandaloneChat(
        {
          provider:      settings.provider,
          anthropicKey:  settings.anthropicKey,
          openaiKey:     settings.openaiKey,
          geminiKey:     settings.geminiKey,
          grokKey:       settings.grokKey,
          kimiKey:       settings.kimiKey,
          glmKey:        settings.glmKey,
          openrouterKey: settings.openrouterKey,
          ollamaUrl:     settings.ollamaUrl,
          model:         settings.model,
          githubToken:   settings.githubToken,
          githubRepo:    settings.githubRepo,
          githubBranch:  settings.githubBranch || 'main',
        },
        history,
        text,
        (evt: EngineEvent) => {
          switch (evt.type) {
            case 'thinking':        chat.setThinking(true); break
            case 'chunk':           chat.appendChunk(msgId, evt.text); chat.setStreaming(true); chat.setThinking(false); scrollToEnd(); break
            case 'tool_start':      chat.upsertTool({ id: evt.id, name: evt.name, args: evt.args, status: 'pending', needsApproval: false }); break
            case 'tool_result':     { const t = chat.tools.get(evt.id); if (t) chat.upsertTool({ ...t, result: evt.result, status: 'done' }); break }
            case 'approval_needed': chat.upsertTool({ id: evt.id, name: evt.name, args: evt.args, status: 'pending', needsApproval: true }); scrollToEnd(); break
            case 'approval_done':   { const t = chat.tools.get(evt.id); if (t) chat.upsertTool({ ...t, status: evt.approved ? 'approved' : 'denied', needsApproval: false }); break }
            case 'done':            chat.setStreaming(false); chat.setThinking(false); pendingId.current = null; break
            case 'error':           setError(evt.message); chat.setStreaming(false); chat.setThinking(false); pendingId.current = null; break
          }
        },
        // Approval gate — returns a Promise that resolves when user taps Allow/Deny
        (id, _name, _args) => new Promise<boolean>(resolve => {
          pendingApprovals.current.set(id, resolve)
        }),
        abortRef.current.signal,
        images,
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
          ListEmptyComponent={
            <EmptyState
              mode={chat.mode}
              syncMode={settings.syncMode}
              githubRepo={settings.githubRepo}
              onSuggest={send}
            />
          }
          onContentSizeChange={scrollToEnd}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        />

        {/* Error */}
        {error && (
          <TouchableOpacity style={styles.errorBanner} onPress={() => setError(null)}>
            <Text style={styles.errorText}>⚠ {error}  (tap to dismiss)</Text>
          </TouchableOpacity>
        )}

        <ChatInput
          onSend={send}
          onCancel={cancel}
          streaming={chat.streaming || chat.thinking}
          githubRepo={settings.githubRepo || undefined}
          onRepoPick={() => setRepoPickerOpen(true)}
        />
      </KeyboardAvoidingView>

      <ModelPicker visible={modelPickerOpen} onClose={() => setModelPickerOpen(false)} />
      <RepoPicker visible={repoPickerOpen} onClose={() => setRepoPickerOpen(false)} />

      <DrawerNav
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNewChat={startNewChat}
      />
    </SafeAreaView>
  )
}

const SUGGESTIONS = [
  'Search for TODO comments and fix them',
  'Create or update a README.md',
  'Recommend areas to improve the code',
  'Find and fix any obvious bugs',
]

function EmptyState({ mode, syncMode, githubRepo, onSuggest }: {
  mode: Mode; syncMode: string; githubRepo: string; onSuggest: (t: string) => void
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyM}>M</Text>
      <Text style={styles.emptyTitle}>Mentis</Text>
      <Text style={styles.emptySub}>
        {syncMode === 'desktop'
          ? 'Connected to desktop'
          : githubRepo ? `⬡ ${githubRepo}` : 'AI coding assistant'}
      </Text>

      <Text style={styles.suggestLabel}>Suggestions</Text>
      <View style={styles.suggestList}>
        {SUGGESTIONS.map(s => (
          <TouchableOpacity key={s} style={styles.suggestCard} onPress={() => onSuggest(s)}>
            <Text style={styles.suggestText}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 10, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : 10, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel },
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
  suggestLabel: { fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600', marginTop: 20, marginBottom: 10, alignSelf: 'flex-start' },
  suggestList:  { width: '100%', gap: 8 },
  suggestCard:  { backgroundColor: C.panel, borderWidth: 1, borderColor: C.border2, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13 },
  suggestText:  { fontSize: 13, color: C.textDim, lineHeight: 18 },
})
