import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Alert, FlatList, Modal, StyleSheet, Text, TextInput,
  TouchableOpacity, View, SafeAreaView, RefreshControl,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { useChat, useSettings, Session } from '../../store'
import * as client from '../../services/mentisClient'
import { C } from '../../constants/theme'

type Filter = 'all' | 'active' | 'done'

export default function SessionsScreen() {
  const { sessions, setSessions, activeSession, setActiveSession, setFeed } = useChat()
  const settings  = useSettings()
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [filter, setFilter]         = useState<Filter>('all')

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

  const filtered = sessions.filter(s => {
    if (filter === 'active') return s.id === activeSession
    if (filter === 'done')   return s.id !== activeSession
    return true
  })

  // Group by time
  const grouped = groupByTime(filtered, activeSession)

  const openSession = async (id: string) => {
    if (settings.syncMode !== 'desktop') return
    try {
      const history = await client.getHistory(settings.desktopHost, id)
      setFeed(history)
      setActiveSession(id)
    } catch { Alert.alert('Error', 'Could not load session') }
  }

  const deleteSession = (id: string, title: string) => {
    Alert.alert('Delete Session', `Delete "${title}"?`, [
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
      { text: 'Rename', onPress: () => { setRenameText(title); setRenameTarget({ id, title }); setTimeout(() => renameInputRef.current?.focus(), 150) } },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSession(id, title) },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const confirmRename = async () => {
    if (!renameTarget || !renameText.trim()) return
    const trimmed = renameText.trim()
    try {
      await client.renameSession(settings.desktopHost, renameTarget.id, trimmed)
      setSessions(sessions.map(s => s.id === renameTarget.id ? { ...s, title: trimmed } : s))
    } catch { Alert.alert('Error', 'Could not rename session') }
    finally { setRenameTarget(null) }
  }

  const newSession = async () => {
    if (settings.syncMode !== 'desktop') return
    try {
      const { id } = await client.newSession(settings.desktopHost)
      setFeed([]); setActiveSession(id); await load()
    } catch { Alert.alert('Error', 'Could not create session') }
  }

  if (settings.syncMode !== 'desktop') {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerBig}>Sessions</Text>
        </View>
        <View style={styles.centred}>
          <Text style={styles.offlineIcon}>⬡</Text>
          <Text style={styles.offlineTitle}>Desktop Sync Off</Text>
          <Text style={styles.offlineSub}>Switch to Desktop Sync in Settings{'\n'}to see session history from your PC.</Text>
        </View>
      </SafeAreaView>
    )
  }

  const counts = {
    all:    sessions.length,
    active: sessions.filter(s => s.id === activeSession).length,
    done:   sessions.filter(s => s.id !== activeSession).length,
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Title */}
      <View style={styles.header}>
        <Text style={styles.headerBig}>Sessions</Text>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {(['all', 'active', 'done'] as Filter[]).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Done'}{' '}
              <Text style={[styles.filterCount, filter === f && styles.filterCountActive]}>
                {counts[f]}
              </Text>
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View>}

      <FlatList
        data={grouped}
        keyExtractor={item => item.type === 'header' ? item.label : item.session.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={C.accent} />}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return <Text style={styles.groupLabel}>{item.label}</Text>
          }
          const s = item.session
          const isActive = s.id === activeSession
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => openSession(s.id)}
              onLongPress={() => openContextMenu(s.id, s.title)}
              delayLongPress={400}
              activeOpacity={0.7}
            >
              <StatusIcon active={isActive} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.cardTitle, { flex: 1 }]} numberOfLines={2}>{s.title}</Text>
                  {s.source === 'cli' && (
                    <View style={styles.cliBadge}>
                      <Text style={styles.cliBadgeText}>CLI</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.cardMeta}>
                  {s.messageCount} messages · {timeAgo(s.updatedAt)}
                </Text>
              </View>
            </TouchableOpacity>
          )
        }}
        ListEmptyComponent={
          <View style={styles.centred}>
            <Text style={styles.offlineSub}>No sessions yet.{'\n'}Tap + New to start one.</Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={newSession} activeOpacity={0.85}>
        <Text style={styles.fabIcon}>+</Text>
        <Text style={styles.fabText}>New session</Text>
      </TouchableOpacity>

      {/* Rename modal */}
      <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setRenameTarget(null)} />
        <KeyboardAvoidingView style={styles.modalWrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
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
              <TouchableOpacity style={styles.renameCancelBtn} onPress={() => setRenameTarget(null)}>
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

// ── Status icon ───────────────────────────────────────────────────────────────

function StatusIcon({ active }: { active: boolean }) {
  return (
    <View style={[styles.statusIcon, active ? styles.statusActive : styles.statusDone]}>
      {active
        ? <View style={styles.statusSpinner} />
        : <View style={styles.statusCheck} />
      }
    </View>
  )
}

// ── Time grouping ─────────────────────────────────────────────────────────────

type ListItem =
  | { type: 'header'; label: string }
  | { type: 'session'; session: Session }

function groupByTime(sessions: Session[], activeId: string | null): ListItem[] {
  const now  = Date.now()
  const day  = 86400000
  const buckets: Record<string, Session[]> = { Today: [], Yesterday: [], 'Last week': [], 'This month': [], Older: [] }

  for (const s of sessions) {
    const diff = now - s.updatedAt
    if (diff < day)        buckets['Today'].push(s)
    else if (diff < 2*day) buckets['Yesterday'].push(s)
    else if (diff < 7*day) buckets['Last week'].push(s)
    else if (diff < 30*day) buckets['This month'].push(s)
    else                   buckets['Older'].push(s)
  }

  // Sort: active session first within its bucket
  const result: ListItem[] = []
  for (const [label, items] of Object.entries(buckets)) {
    if (!items.length) continue
    const sorted = [...items].sort((a, b) => {
      if (a.id === activeId) return -1
      if (b.id === activeId) return 1
      return b.updatedAt - a.updatedAt
    })
    result.push({ type: 'header', label })
    sorted.forEach(s => result.push({ type: 'session', session: s }))
  }
  return result
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
  header:           { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, backgroundColor: C.panel, borderBottomWidth: 1, borderBottomColor: C.border },
  headerBig:        { fontSize: 24, fontWeight: '800', color: C.text },
  filterRow:        { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel },
  filterTab:        { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: C.border2, backgroundColor: C.panel2 },
  filterTabActive:  { borderColor: C.accent + '55', backgroundColor: C.accent + '18' },
  filterText:       { fontSize: 13, color: C.muted2, fontWeight: '500' },
  filterTextActive: { color: C.accentL },
  filterCount:      { fontSize: 13, color: C.muted },
  filterCountActive: { color: C.accentL + 'bb' },
  listContent:      { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 100 },
  groupLabel:       { fontSize: 11, color: C.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.7, paddingHorizontal: 4, paddingTop: 16, paddingBottom: 8 },
  card:             { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.panel, borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  cardTitle:        { fontSize: 14, fontWeight: '500', color: C.text, lineHeight: 20, flex: 1 },
  cardMeta:         { fontSize: 11, color: C.muted, marginTop: 4 },
  cliBadge:         { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: 'rgba(34,197,94,0.35)', borderWidth: 1, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  cliBadgeText:     { fontSize: 9, color: '#22c55e', fontFamily: 'monospace', fontWeight: '600' },
  statusIcon:       { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  statusActive:     { borderColor: C.accentL, backgroundColor: C.accent + '18' },
  statusDone:       { borderColor: C.border2, borderStyle: 'dashed', backgroundColor: 'transparent' },
  statusSpinner:    { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: C.accentL, borderTopColor: 'transparent' },
  statusCheck:      { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border2 },
  fab:              { position: 'absolute', bottom: 20, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.accent, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 30, shadowColor: C.accent, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  fabIcon:          { fontSize: 20, color: '#fff', fontWeight: '300', lineHeight: 22 },
  fabText:          { fontSize: 15, fontWeight: '600', color: '#fff' },
  errorBanner:      { margin: 12, padding: 10, backgroundColor: C.red + '22', borderRadius: 8, borderWidth: 1, borderColor: C.red + '44' },
  errorText:        { color: C.red, fontSize: 12 },
  centred:          { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32, marginTop: 60 },
  offlineIcon:      { fontSize: 28, color: C.muted },
  offlineTitle:     { fontSize: 16, fontWeight: '600', color: C.textDim },
  offlineSub:       { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 20 },
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
