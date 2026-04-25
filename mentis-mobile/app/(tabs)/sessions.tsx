import { useEffect, useState, useCallback } from 'react'
import {
  Alert, FlatList, StyleSheet, Text,
  TouchableOpacity, View, SafeAreaView, RefreshControl,
} from 'react-native'
import { useChat, useSettings } from '../../store'
import * as client from '../../services/mentisClient'
import { C } from '../../constants/theme'

export default function SessionsScreen() {
  const { sessions, setSessions, activeSession, setActiveSession, setFeed } = useChat()
  const settings  = useSettings()
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const load = useCallback(async () => {
    if (settings.syncMode !== 'desktop') return
    setRefreshing(true)
    try {
      const list = await client.listSessions(settings.desktopHost)
      setSessions(list)
      setError(null)
    } catch (e) {
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
    } catch (e) {
      Alert.alert('Error', 'Could not load session')
    }
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
            onLongPress={() => deleteSession(s.id, s.title)}
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
  root:        { flex: 1, backgroundColor: C.bg },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel },
  headerTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  headerBtn:   { backgroundColor: C.accent + '22', borderWidth: 1, borderColor: C.accent + '44', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  headerBtnText: { color: C.accentL, fontSize: 13, fontWeight: '600' },
  row:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  rowActive:   { backgroundColor: C.accent + '0d' },
  rowTitle:    { fontSize: 14, fontWeight: '500', color: C.text, marginBottom: 3 },
  rowMeta:     { fontSize: 11, color: C.muted },
  activeDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent },
  errorBanner: { margin: 12, padding: 10, backgroundColor: C.red + '22', borderRadius: 8, borderWidth: 1, borderColor: C.red + '44' },
  errorText:   { color: C.red, fontSize: 12 },
  centred:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  offlineIcon: { fontSize: 28, color: C.muted },
  offlineTitle: { fontSize: 16, fontWeight: '600', color: C.textDim },
  offlineSub:  { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 20 },
})
