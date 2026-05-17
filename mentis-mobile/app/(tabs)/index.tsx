import { useCallback, useRef, useState } from 'react'
import {
  Alert, FlatList, KeyboardAvoidingView, Platform,
  SafeAreaView, Share, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useChat, useSettings, Message, Mode } from '../../store'
import { streamAnthropicChat } from '../../services/anthropicClient'
import { streamChat, newSession } from '../../services/mentisClient'
import { speak, stopSpeaking } from '../../services/tts'
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
  const [voiceMode, setVoiceMode]             = useState(false)
  const [speaking, setSpeaking]               = useState(false)
  const voiceModeRef = useRef(false)
  const textBuffer   = useRef('')          // accumulates streaming text for TTS
  const pendingId    = useRef<string | null>(null)

  const toggleVoice = () => {
    const next = !voiceMode
    setVoiceMode(next)
    voiceModeRef.current = next
    if (!next) { stopSpeaking(); setSpeaking(false) }
  }

  const startNewChat = useCallback(async () => {
    chat.clearChat()
    if (settings.syncMode === 'desktop') {
      try {
        const { id } = await newSession(settings.desktopHost)
        chat.setActiveSession(id)
      } catch { /* ignore */ }
    }
  }, [chat, settings])

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60)
  }, [])

  const handleSlash = (text: string): boolean => {
    const cmd = text.trim().toLowerCase()
    if (cmd === '/clear')  { chat.clearChat(); return true }
    if (cmd === '/plan')   { chat.setMode('PLAN');  return true }
    if (cmd === '/build')  { chat.setMode('BUILD'); return true }
    if (cmd === '/status') {
      Alert.alert('Status', `Mode: ${chat.mode}\nModel: ${settings.model}\nProvider: ${settings.provider}\nSync: ${settings.syncMode}`)
      return true
    }
    return false
  }

  const send = useCallback(async (text: string) => {
    if (chat.streaming) return
    if (handleSlash(text)) return
    setError(null)
    chat.setThinking(true)
    textBuffer.current = ''

    chat.addMessage({ id: `u${Date.now()}`, role: 'user', content: text, timestamp: Date.now() })
    scrollToEnd()

    const id = chat.newPendingMsg()
    pendingId.current = id
    scrollToEnd()

    const onChunk = (chunk: string) => {
      textBuffer.current += chunk
      chat.appendChunk(id, chunk)
      chat.setStreaming(true)
      chat.setThinking(false)
      scrollToEnd()
    }

    const onDone = () => {
      chat.setStreaming(false)
      chat.setThinking(false)
      pendingId.current = null
      if (voiceModeRef.current && textBuffer.current) {
        setSpeaking(true)
        speak(textBuffer.current, () => setSpeaking(false))
      }
      textBuffer.current = ''
    }

    const onError = (err: string) => {
      setError(err)
      chat.setStreaming(false)
      chat.setThinking(false)
      pendingId.current = null
      textBuffer.current = ''
    }

    if (settings.syncMode === 'desktop') {
      await streamChat(settings.desktopHost, text, chat.activeSession, onChunk, onDone, onError)
    } else {
      abortRef.current = new AbortController()
      const history = chat.feed
        .filter(m => m.content)
        .map(m => ({ role: m.role, content: m.content })) as Array<{ role: 'user' | 'assistant'; content: string }>
      await streamAnthropicChat(
        settings.anthropicKey, settings.model,
        history, text, onChunk, onDone, onError, abortRef.current.signal,
      )
    }
  }, [chat, settings])

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

  const toggleMode = () => chat.setMode(chat.mode === 'PLAN' ? 'BUILD' : 'PLAN')

  type FeedRow = { type: 'msg'; data: Message } | { type: 'thinking' }

  const feedRows: FeedRow[] = [
    ...chat.feed.map(m => ({ type: 'msg' as const, data: m })),
    ...(chat.thinking ? [{ type: 'thinking' as const }] : []),
  ]

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
            onPress={toggleMode}
          >
            <Text style={[styles.badgeText, { color: chat.mode === 'PLAN' ? C.yellow : C.green }]}>
              {chat.mode}
            </Text>
          </TouchableOpacity>

          {/* Model selector */}
          <TouchableOpacity style={styles.modelBtn} onPress={() => setModelPickerOpen(true)}>
            <Text style={styles.modelText} numberOfLines={1}>
              {settings.model.replace('claude-', '').replace('-4-7', ' Opus').replace('-4-6', ' Sonnet').replace('-4-5-20251001', ' Haiku')}
            </Text>
            <Text style={styles.modelChevron}>▾</Text>
          </TouchableOpacity>

          {/* Voice mode toggle */}
          <TouchableOpacity
            style={[styles.iconBtn, voiceMode && styles.iconBtnVoiceActive]}
            onPress={toggleVoice}
          >
            <Ionicons
              name={voiceMode ? 'volume-high' : 'volume-mute-outline'}
              size={15}
              color={voiceMode ? C.accentL : C.muted2}
            />
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
          <Text style={styles.syncText}>⬡ Synced with desktop — {settings.desktopHost}</Text>
        </View>
      )}

      {/* Speaking indicator */}
      {speaking && (
        <View style={styles.speakingBar}>
          <Ionicons name="volume-high" size={12} color={C.accentL} />
          <Text style={styles.speakingText}>  Speaking…</Text>
          <TouchableOpacity onPress={() => { stopSpeaking(); setSpeaking(false) }}>
            <Text style={styles.speakingStop}>  Stop ■</Text>
          </TouchableOpacity>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        {Array.from(chat.tools.values()).filter(t => t.needsApproval && t.status === 'pending').map(t => (
          <ToolCard key={t.id} tool={t} onApprove={(id, ok) => {
            chat.upsertTool({ ...t, status: ok ? 'approved' : 'denied' })
          }} />
        ))}

        <FlatList
          ref={listRef}
          data={feedRows}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) =>
            item.type === 'thinking'
              ? <ThinkingDot />
              : <ChatBubble message={item.data} isStreaming={item.data.id === pendingId.current && chat.streaming} />
          }
          contentContainerStyle={styles.feedContent}
          ListEmptyComponent={<EmptyState voiceMode={voiceMode} />}
          onContentSizeChange={scrollToEnd}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        />

        {error && (
          <TouchableOpacity style={styles.errorBanner} onPress={() => setError(null)}>
            <Text style={styles.errorText}>⚠ {error}  (tap to dismiss)</Text>
          </TouchableOpacity>
        )}

        <ChatInput onSend={send} onCancel={cancel} streaming={chat.streaming || chat.thinking} />
      </KeyboardAvoidingView>

      <ModelPicker visible={modelPickerOpen} onClose={() => setModelPickerOpen(false)} />
      <DrawerNav visible={drawerOpen} onClose={() => setDrawerOpen(false)} onNewChat={startNewChat} />
    </SafeAreaView>
  )
}

function EmptyState({ voiceMode }: { voiceMode: boolean }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyM}>M</Text>
      <Text style={styles.emptyTitle}>Mentis</Text>
      <Text style={styles.emptySub}>AI coding assistant</Text>
      {voiceMode && (
        <View style={styles.voiceHint}>
          <Ionicons name="mic-outline" size={14} color={C.accentL} />
          <Text style={styles.voiceHintText}> Tap the mic and start talking</Text>
        </View>
      )}
      <View style={styles.emptyHints}>
        {['/plan — plan before coding', '/build — switch to build mode', '/clear — clear history'].map(h => (
          <Text key={h} style={styles.emptyHint}>{h}</Text>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root:             { flex: 1, backgroundColor: C.bg },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel },
  headerLeft:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hamburger:        { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  logo:             { width: 26, height: 26, borderRadius: 7, backgroundColor: C.accent + '33', alignItems: 'center', justifyContent: 'center' },
  logoText:         { fontSize: 12, fontWeight: '800', color: C.accentL },
  headerTitle:      { fontSize: 15, fontWeight: '700', color: C.text },
  headerRight:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge:            { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, borderWidth: 1 },
  badgePlan:        { borderColor: C.yellow + '44', backgroundColor: C.yellow + '18' },
  badgeBuild:       { borderColor: C.green  + '44', backgroundColor: C.green  + '18' },
  badgeText:        { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  modelBtn:         { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: C.panel2, borderRadius: 7, borderWidth: 1, borderColor: C.border2, maxWidth: 110 },
  modelText:        { fontSize: 11, color: C.muted2, fontFamily: 'Courier New', flex: 1 },
  modelChevron:     { fontSize: 10, color: C.muted },
  iconBtn:          { width: 28, height: 28, borderRadius: 7, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.border2, alignItems: 'center', justifyContent: 'center' },
  iconBtnText:      { fontSize: 14, color: C.muted2 },
  iconBtnVoiceActive: { backgroundColor: C.accent + '33', borderColor: C.accentL + '66' },
  syncBar:          { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: C.accent + '18', borderBottomWidth: 1, borderBottomColor: C.accent + '33' },
  syncText:         { fontSize: 11, color: C.accentL },
  speakingBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 5, backgroundColor: C.accentL + '18', borderBottomWidth: 1, borderBottomColor: C.accentL + '33' },
  speakingText:     { fontSize: 11, color: C.accentL, flex: 1 },
  speakingStop:     { fontSize: 11, color: C.muted2 },
  feedContent:      { paddingTop: 12, paddingBottom: 8, flexGrow: 1 },
  errorBanner:      { marginHorizontal: 12, marginBottom: 4, backgroundColor: C.red + '22', borderWidth: 1, borderColor: C.red + '44', borderRadius: 8, padding: 10 },
  errorText:        { color: C.red, fontSize: 12 },
  empty:            { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 6 },
  emptyM:           { fontSize: 36, fontWeight: '800', color: C.accent },
  emptyTitle:       { fontSize: 20, fontWeight: '700', color: C.text },
  emptySub:         { fontSize: 13, color: C.muted2, marginBottom: 8 },
  voiceHint:        { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.accent + '18', borderRadius: 10, borderWidth: 1, borderColor: C.accentL + '44' },
  voiceHintText:    { fontSize: 13, color: C.accentL },
  emptyHints:       { gap: 6, alignItems: 'center' },
  emptyHint:        { fontSize: 12, color: C.muted, fontFamily: 'Courier New' },
})
