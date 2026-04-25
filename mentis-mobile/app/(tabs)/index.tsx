import { useCallback, useRef, useState } from 'react'
import {
  FlatList, KeyboardAvoidingView, Platform,
  StyleSheet, Text, View, SafeAreaView,
} from 'react-native'
import { useChat, useSettings } from '../../store'
import { streamAnthropicChat } from '../../services/anthropicClient'
import { streamChat } from '../../services/mentisClient'
import ChatBubble from '../../components/ChatBubble'
import ChatInput from '../../components/ChatInput'
import ThinkingDot from '../../components/ThinkingDot'
import { C } from '../../constants/theme'

export default function ChatScreen() {
  const { feed, streaming, thinking, addMessage, newPendingMsg, appendChunk, setStreaming, setThinking, activeSession } = useChat()
  const settings = useSettings()
  const abortRef = useRef<AbortController | null>(null)
  const listRef  = useRef<FlatList>(null)
  const [error, setError] = useState<string | null>(null)

  const scrollToEnd = () => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80)
  }

  const send = useCallback(async (text: string) => {
    if (streaming) return
    setError(null)
    setThinking(true)

    // Add user message
    addMessage({ id: `u${Date.now()}`, role: 'user', content: text, timestamp: Date.now() })
    scrollToEnd()

    const pendingId = newPendingMsg()
    scrollToEnd()

    const onChunk = (chunk: string) => {
      appendChunk(pendingId, chunk)
      setStreaming(true)
      setThinking(false)
      scrollToEnd()
    }
    const onDone = () => { setStreaming(false); setThinking(false) }
    const onError = (err: string) => {
      setError(err)
      setStreaming(false)
      setThinking(false)
    }

    if (settings.syncMode === 'desktop') {
      await streamChat(settings.desktopHost, text, activeSession, onChunk, onDone, onError)
    } else {
      // Standalone — direct Anthropic
      abortRef.current = new AbortController()
      const history = feed
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }))
      await streamAnthropicChat(
        settings.anthropicKey, settings.model,
        history as Array<{ role: 'user' | 'assistant'; content: string }>,
        text, onChunk, onDone, onError, abortRef.current.signal,
      )
    }
  }, [streaming, feed, settings, activeSession])

  const cancel = () => {
    abortRef.current?.abort()
    setStreaming(false)
    setThinking(false)
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logo}><Text style={styles.logoText}>M</Text></View>
          <Text style={styles.headerTitle}>Mentis</Text>
        </View>
        <View style={[styles.modeBadge, { borderColor: C.accent + '44', backgroundColor: C.accent + '18' }]}>
          <Text style={[styles.modeText, { color: C.accentL }]}>
            {settings.syncMode === 'desktop' ? '⬡ Desktop' : '☁ Cloud'}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Feed */}
        <FlatList
          ref={listRef}
          data={feed}
          keyExtractor={m => m.id}
          renderItem={({ item }) => <ChatBubble message={item} />}
          contentContainerStyle={styles.feedContent}
          ListEmptyComponent={<EmptyState />}
          ListFooterComponent={thinking ? <ThinkingDot /> : null}
          onContentSizeChange={scrollToEnd}
        />

        {/* Error banner */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠ {error}</Text>
          </View>
        )}

        {/* Input */}
        <ChatInput onSend={send} onCancel={cancel} streaming={streaming || thinking} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>M</Text>
      <Text style={styles.emptyTitle}>Mentis</Text>
      <Text style={styles.emptySub}>Your AI coding assistant</Text>
      <Text style={styles.emptyHint}>Type a message to start</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo:         { width: 24, height: 24, borderRadius: 6, backgroundColor: C.accent + '33', alignItems: 'center', justifyContent: 'center' },
  logoText:     { fontSize: 12, fontWeight: '700', color: C.accentL },
  headerTitle:  { fontSize: 15, fontWeight: '600', color: C.text },
  modeBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  modeText:     { fontSize: 11, fontWeight: '500' },
  feedContent:  { padding: 12, paddingBottom: 8, flexGrow: 1 },
  errorBanner:  { marginHorizontal: 12, marginBottom: 4, backgroundColor: C.red + '22', borderWidth: 1, borderColor: C.red + '44', borderRadius: 8, padding: 10 },
  errorText:    { color: C.red, fontSize: 12 },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 6 },
  emptyIcon:    { fontSize: 32, fontWeight: '800', color: C.accent },
  emptyTitle:   { fontSize: 18, fontWeight: '700', color: C.text },
  emptySub:     { fontSize: 13, color: C.muted2 },
  emptyHint:    { fontSize: 12, color: C.muted, marginTop: 8 },
})
