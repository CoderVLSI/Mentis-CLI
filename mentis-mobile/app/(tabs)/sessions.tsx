import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Alert, FlatList, Modal, StyleSheet, Text, TextInput,
  TouchableOpacity, View, SafeAreaView, RefreshControl,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { useChat, useSettings } from '../../store'
import * as client from '../../services/mentisClient'
import { C } from '../../constants/theme'

export default function SessionsScreen() {
  const { sessions, setSessions, activeSession, setActiveSession, setFeed } = useChat()
  const settings  = useSettings()
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // ── Rename modal state ─────────────────────────────────────────────────────
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null)
  const [renameText, setRenameText]     = useState('')
  const renameInputRef = useRef<TextInput>(null)

  const load = useCallback(async () => {
    if (settings.syncMode !== 'desktop') return
    setRefreshing(true)
    try {
      const list = await client.listSessions(settings.desktopHost)
      setSessions(list)
      setError(null)
    } catch {
      setError('Could not reach desktop. Check sync settings.')
    } finally {
      setRefreshing(false)
    }
  }, [settings.desktopHost, settings.syncMode])

  useEffect(() => { load() }, [load])

  const openSession = async (id: string) => {
    if (settings.syncMode !== 'desktop') return
    try {
      const history = await client.getHistory(settings.desktopHost, id)
      setFeed(history)
      setActiveSession(id)
    } catch {
      Alert.alert('Error', 'Could not load session')
    }
  }

  const deleteSession = (id: string, title: string) => {
    Alert.alert('Delete Session', `Delete "${title}"?\nThis cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await client.deleteSession(settings.desktopHost, id)
          setSessions(sessions.filter(s => s.id !== id))
          if (activeSession === id) { setActiveSession(null); setFeed([]) }
        },
      },
    ])
  }

  const openContextMenu = (id: string, title: string) => {
    Alert.alert(title, undefined, [
      {
        text: 'Rename',
        onPress: () => {
          setRenameText(title)
          setRenameTarget({ id, title })
          setTimeout(() => renameInputRef.current?.focus(), 150)
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteSession(id, title),
      },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const confirmRename = async () => {
    if (!renameTarget || !renameText.trim()) return
    const trimmed = renameText.trim()
    try {
      await client.renameSession(settings.desktopHost, renameTarget.id, trimmed)
      setSessions(sessions.map(s => s.id === renameTarget.id ? { ...s, title: trimmed } : s))
    } catch {
      Alert.alert('Error', 'Could not rename session')
    } finally {
      setRenameTarget(null)
    }
  }

  const newSession = async () => {
    if (settings.syncMode !== 'desktop') return
    try {
      const { id } = await client.newSession(settings.desktopHost)
      setFeed([])
      setActiveSession(id)
      await load()
    } catch {
      Alert.alert('Error', 'Could not create session')
    }
  }

  if (settings.syncMode !== 'desktop') {
    return (
      <SafeAreaView style={styles.root}>
        <HeaderBar title="History" />
        <View style={styles.centred}>
          <Text style={styles.offlineIcon}>⬡</Text>
          <Text style={styles.offlineTitle}>Desktop Sync Off</Text>
          <Text style={styles.offlineSub}>
            Switch to Desktop Sync in Settings to see{'\n'}session history from your PC.
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.root}>
      <HeaderBar title="History" action={{ label: '+ New', onPress: newSession }} />

      {error && <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View>}

      <FlatList
        data={sessions}
        keyExtractor={s => s.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={C.accent} />}
        renderItem={({ item: s }) => (
          <TouchableOpacity
            style={[styles.row, s.id === activeSession && styles.rowActive]}
            onPress={() => openSession(s.id)}
            onLongPress={() => openContextMenu(s.id, s.title)}
            delayLongPress={400}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{s.title}</Text>
              <Text style={styles.rowMeta}>{s.messageCount} messages · {timeAgo(s.updatedAt)}</Text>
            </View>
            {s.id === activeSession && <View style={styles.activeDot} />}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.centred}>
            <Text style={styles.offlineSub}>No sessions yet.{'\n'}Start a chat to create one.</Text>
          </View>
        }
        contentContainerStyle={{ flexGrow: 1 }}
      />

      {/* ── Rename modal ────────────────────────────────────────────────────── */}
      <Modal
        visible={!!renameTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameTarget(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setRenameTarget(null)}
        />
        <KeyboardAvoidingView
          style={styles.modalWrapper}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
        >
          <View style={styles.renameSheet}>
            <Text style={styles.renameTitle}>Rename Session</Text>
            <TextInput
              ref={renameInputRef}
              style={styles.renameInput}
              value={renameText}
              onChangeText={setRenameText}
              placeholder="Session name"
              placeholderTextColor={C.muted}
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={confirmRename}
            />
            <View style={styles.renameButtons}>
              <TouchableOpacity
                style={styles.renameCancelBtn}
                onPress={() => setRenameTarget(null)}
              >
                <Text style={styles.renameCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.renameConfirmBtn, !renameText.trim() && styles.btnDisabled]}
                onPress={confirmRename}
                disabled={!renameText.trim()}
              >
                <Text style={styles.renameConfirmText}>Rename</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

function HeaderBar({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>{title}</Text>
      {action && (
        <TouchableOpacity onPress={action.onPress} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000)    return 'just now'
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

const styles = StyleSheet.create({
  root:             { flex: 1, backgroundColor: C.bg },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel },
  headerTitle:      { fontSize: 16, fontWeight: '700', color: C.text },
  headerBtn:        { backgroundColor: C.accent + '22', borderWidth: 1, borderColor: C.accent + '44', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  headerBtnText:    { color: C.accentL, fontSize: 13, fontWeight: '600' },
  row:              { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  rowActive:        { backgroundColor: C.accent + '0d' },
  rowTitle:         { fontSize: 14, fontWeight: '500', color: C.text, marginBottom: 3 },
  rowMeta:          { fontSize: 11, color: C.muted },
  activeDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent },
  errorBanner:      { margin: 12, padding: 10, backgroundColor: C.red + '22', borderRadius: 8, borderWidth: 1, borderColor: C.red + '44' },
  errorText:        { color: C.red, fontSize: 12 },
  centred:          { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  offlineIcon:      { fontSize: 28, color: C.muted },
  offlineTitle:     { fontSize: 16, fontWeight: '600', color: C.textDim },
  offlineSub:       { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 20 },
  // ── Rename modal ────────────────────────────────────────────────────────────
  modalBackdrop:    { ...StyleSheet.absoluteFillObject, backgroundColor: '#000a' },
  modalWrapper:     { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  renameSheet:      { width: '100%', backgroundColor: C.panel, borderRadius: 16, padding: 20, gap: 14, borderWidth: 1, borderColor: C.border2 },
  renameTitle:      { fontSize: 15, fontWeight: '700', color: C.text },
  renameInput:      { backgroundColor: C.panel2, borderWidth: 1, borderColor: C.border2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 14 },
  renameButtons:    { flexDirection: 'row', gap: 10 },
  renameCancelBtn:  { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: C.border2, alignItems: 'center' },
  renameCancelText: { color: C.muted2, fontSize: 14, fontWeight: '500' },
  renameConfirmBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: C.accent, alignItems: 'center' },
  renameConfirmText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnDisabled:      { opacity: 0.4 },
})
