import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Animated, Dimensions, Modal, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity,
  TouchableWithoutFeedback, View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useChat, useSettings, Session } from '../store'
import * as mentisClient from '../services/mentisClient'
import { C, F } from '../constants/theme'

const DRAWER_W = Dimensions.get('window').width * 0.78

type Panel = 'sessions' | 'search' | 'mcp' | 'hooks'

interface Props {
  visible:   boolean
  onClose:   () => void
  onNewChat: () => void
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function relTime(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 1)  return 'now'
  if (m < 60) return `${m}m`
  if (h < 24) return `${h}h`
  if (d < 7)  return `${d}d`
  return `${Math.floor(d / 7)}w`
}

function groupSessions(sessions: Session[]): Record<string, Session[]> {
  const now = Date.now()
  const g: Record<string, Session[]> = {
    Today: [], Yesterday: [], 'This week': [], Older: [],
  }
  for (const s of sessions) {
    const d = Math.floor((now - s.updatedAt) / 86400000)
    if (d < 1)      g.Today.push(s)
    else if (d < 2) g.Yesterday.push(s)
    else if (d < 7) g['This week'].push(s)
    else            g.Older.push(s)
  }
  return g
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DrawerNav({ visible, onClose, onNewChat }: Props) {
  const chat     = useChat()
  const settings = useSettings()
  const insets   = useSafeAreaInsets()

  const [panel, setPanel]   = useState<Panel>('sessions')
  const [query, setQuery]   = useState('')
  const [mounted, setMounted] = useState(false)

  const slideX   = useRef(new Animated.Value(-DRAWER_W)).current
  const backdropA = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      setMounted(true)
      Animated.parallel([
        Animated.spring(slideX, {
          toValue: 0, useNativeDriver: true,
          damping: 22, stiffness: 200, mass: 0.8,
        }),
        Animated.timing(backdropA, {
          toValue: 1, duration: 220, useNativeDriver: true,
        }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(slideX,    { toValue: -DRAWER_W, duration: 210, useNativeDriver: true }),
        Animated.timing(backdropA, { toValue: 0,         duration: 210, useNativeDriver: true }),
      ]).start(() => setMounted(false))
    }
  }, [visible])

  const groups = useMemo(() => groupSessions(chat.sessions), [chat.sessions])

  const searchResults = useMemo(
    () => chat.sessions.filter(s => s.title.toLowerCase().includes(query.toLowerCase())),
    [chat.sessions, query],
  )

  const openSession = async (id: string) => {
    if (settings.syncMode !== 'desktop') return
    try {
      const history = await mentisClient.getHistory(settings.desktopHost, id)
      chat.setFeed(history)
      chat.setActiveSession(id)
      onClose()
    } catch {
      Alert.alert('Error', 'Could not load session')
    }
  }

  const deleteSession = (id: string, title: string) => {
    Alert.alert(`Delete "${title}"?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            if (settings.syncMode === 'desktop')
              await mentisClient.deleteSession(settings.desktopHost, id)
          } catch { /* ignore */ }
          chat.setSessions(chat.sessions.filter(s => s.id !== id))
          if (chat.activeSession === id) { chat.setActiveSession(null); chat.setFeed([]) }
        },
      },
    ])
  }

  const handleClear = () => {
    Alert.alert('Clear chat?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => { chat.clearChat(); onClose() } },
    ])
  }

  if (!mounted) return null

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropA }]}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={{ flex: 1 }} />
        </TouchableWithoutFeedback>
      </Animated.View>

      {/* Drawer */}
      <Animated.View style={[
        styles.drawer,
        { transform: [{ translateX: slideX }], paddingTop: insets.top, paddingBottom: insets.bottom + 8 },
      ]}>

        {/* ── Logo ─────────────────────────────────────────────────────── */}
        <View style={styles.logoRow}>
          <View style={styles.logoBox}>
            <Text style={styles.logoLetter}>M</Text>
          </View>
          <Text style={styles.logoName}>mentis</Text>
          <Text style={styles.logoSub}>mobile</Text>
        </View>

        {/* ── New chat ──────────────────────────────────────────────────── */}
        <View style={styles.newChatWrap}>
          <TouchableOpacity
            style={styles.newChatBtn}
            onPress={() => { onNewChat(); onClose() }}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={styles.newChatText}>New chat</Text>
          </TouchableOpacity>
        </View>

        {/* ── Nav tabs ──────────────────────────────────────────────────── */}
        <View style={styles.navTabs}>
          <NavTab id="sessions" label="Sessions"  icon="chatbubbles-outline"  active={panel === 'sessions'} onPress={setPanel} />
          <NavTab id="search"   label="Search"    icon="search-outline"       active={panel === 'search'}   onPress={setPanel} />
          <NavTab id="mcp"      label="MCP"        icon="server-outline"       active={panel === 'mcp'}      onPress={setPanel} />
          <NavTab id="hooks"    label="Hooks"      icon="git-branch-outline"  active={panel === 'hooks'}    onPress={setPanel} />
        </View>

        <View style={styles.divider} />

        {/* ── Panel content ─────────────────────────────────────────────── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: 4 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {panel === 'sessions' && (
            <SessionsPanel
              groups={groups}
              activeId={chat.activeSession}
              onOpen={openSession}
              onDelete={deleteSession}
              syncMode={settings.syncMode}
            />
          )}

          {panel === 'search' && (
            <SearchPanel
              query={query}
              onQueryChange={setQuery}
              results={searchResults}
              activeId={chat.activeSession}
              onOpen={openSession}
              syncMode={settings.syncMode}
            />
          )}

          {panel === 'mcp' && <McpPanel syncMode={settings.syncMode} />}
          {panel === 'hooks' && <HooksPanel syncMode={settings.syncMode} />}
        </ScrollView>

        {/* ── Bottom ────────────────────────────────────────────────────── */}
        <View style={styles.bottomSection}>
          {/* Mode toggle */}
          <TouchableOpacity
            style={[
              styles.modeBtn,
              chat.mode === 'PLAN' ? styles.modePlan : styles.modeBuild,
            ]}
            onPress={() => chat.setMode(chat.mode === 'PLAN' ? 'BUILD' : 'PLAN')}
            activeOpacity={0.8}
          >
            <Text style={[
              styles.modeBtnText,
              { color: chat.mode === 'PLAN' ? C.accentL : C.green },
            ]}>
              {chat.mode === 'PLAN' ? '◆' : '▶'}  {chat.mode} MODE
            </Text>
          </TouchableOpacity>

          {/* Sync row */}
          <View style={styles.syncRow}>
            <Ionicons
              name={settings.syncMode === 'desktop' ? 'desktop-outline' : 'phone-portrait-outline'}
              size={11}
              color={C.muted}
            />
            <Text style={styles.syncText} numberOfLines={1}>
              {settings.syncMode === 'desktop' ? settings.desktopHost : 'Standalone mode'}
            </Text>
          </View>

          {/* Actions row */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
              <Ionicons name="trash-outline" size={12} color={C.red} style={{ opacity: 0.7 }} />
              <Text style={styles.clearBtnText}>Clear</Text>
            </TouchableOpacity>
            <Text style={styles.version}>v1.0.0</Text>
          </View>
        </View>
      </Animated.View>
    </Modal>
  )
}

// ── Nav tab ────────────────────────────────────────────────────────────────────

function NavTab({
  id, label, icon, active, onPress,
}: {
  id: Panel; label: string; icon: React.ComponentProps<typeof Ionicons>['name']
  active: boolean; onPress: (id: Panel) => void
}) {
  return (
    <TouchableOpacity
      style={[styles.navTab, active && styles.navTabActive]}
      onPress={() => onPress(id)}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={13} color={active ? C.textDim : C.muted} />
      <Text style={[styles.navTabLabel, active && styles.navTabLabelActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

// ── Sessions panel ─────────────────────────────────────────────────────────────

function SessionsPanel({
  groups, activeId, onOpen, onDelete, syncMode,
}: {
  groups:   Record<string, Session[]>
  activeId: string | null
  onOpen:   (id: string) => void
  onDelete: (id: string, title: string) => void
  syncMode: string
}) {
  if (syncMode !== 'desktop') {
    return (
      <DesktopOnlyHint
        icon="desktop-outline"
        title="Sessions from your PC"
        sub="Enable Desktop Sync in Settings to see and switch between sessions."
      />
    )
  }

  const isEmpty = Object.values(groups).every(g => g.length === 0)
  if (isEmpty) {
    return <View style={styles.emptyHint}><Text style={styles.emptyText}>No chats yet</Text></View>
  }

  return (
    <>
      <Text style={styles.groupHeader}>CHATS</Text>
      {Object.entries(groups).map(([label, items]) =>
        items.length === 0 ? null : (
          <View key={label}>
            <Text style={styles.groupLabel}>{label}</Text>
            {items.map(s => (
              <SessionRow
                key={s.id}
                session={s}
                active={s.id === activeId}
                onPress={() => onOpen(s.id)}
                onLongPress={() => onDelete(s.id, s.title)}
              />
            ))}
          </View>
        )
      )}
    </>
  )
}

function SessionRow({
  session: s, active, onPress, onLongPress,
}: {
  session: Session; active: boolean
  onPress: () => void; onLongPress: () => void
}) {
  return (
    <TouchableOpacity
      style={[styles.sessionRow, active && styles.sessionRowActive]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.7}
    >
      <Ionicons name="chatbubble-outline" size={11} color={C.muted} style={{ marginTop: 1 }} />
      <Text style={[styles.sessionTitle, active && styles.sessionTitleActive]} numberOfLines={1}>
        {s.title}
      </Text>
      <Text style={styles.sessionTime}>{relTime(s.updatedAt)}</Text>
    </TouchableOpacity>
  )
}

// ── Search panel ───────────────────────────────────────────────────────────────

function SearchPanel({
  query, onQueryChange, results, activeId, onOpen, syncMode,
}: {
  query: string; onQueryChange: (q: string) => void
  results: Session[]; activeId: string | null
  onOpen: (id: string) => void; syncMode: string
}) {
  if (syncMode !== 'desktop') {
    return (
      <DesktopOnlyHint
        icon="search-outline"
        title="Search sessions"
        sub="Enable Desktop Sync in Settings to search through chat history."
      />
    )
  }

  return (
    <View style={{ paddingTop: 4 }}>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={13} color={C.muted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search chats…"
          placeholderTextColor={C.muted}
          autoFocus
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => onQueryChange('')}>
            <Ionicons name="close-circle" size={14} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>
      {results.map(s => (
        <TouchableOpacity
          key={s.id}
          style={[styles.sessionRow, s.id === activeId && styles.sessionRowActive]}
          onPress={() => onOpen(s.id)}
          activeOpacity={0.7}
        >
          <Ionicons name="chatbubble-outline" size={11} color={C.muted} style={{ marginTop: 1 }} />
          <Text style={[styles.sessionTitle, s.id === activeId && styles.sessionTitleActive]} numberOfLines={1}>
            {s.title}
          </Text>
        </TouchableOpacity>
      ))}
      {query.length > 0 && results.length === 0 && (
        <View style={styles.emptyHint}>
          <Text style={styles.emptyText}>No results for "{query}"</Text>
        </View>
      )}
    </View>
  )
}

// ── MCP panel ──────────────────────────────────────────────────────────────────

function McpPanel({ syncMode }: { syncMode: string }) {
  if (syncMode !== 'desktop') {
    return (
      <DesktopOnlyHint
        icon="server-outline"
        title="MCP Servers"
        sub={'Configure MCP servers via the CLI:\n$ mentis /mcp'}
      />
    )
  }
  return (
    <View style={{ padding: 8 }}>
      <Text style={styles.groupHeader}>MCP SERVERS</Text>
      <View style={styles.infoCard}>
        <View style={styles.infoCardDot} />
        <View style={{ flex: 1 }}>
          <Text style={styles.infoCardTitle}>Managed by desktop</Text>
          <Text style={styles.infoCardSub}>MCP servers are configured in{'\n'}~/.mentis/settings.json</Text>
        </View>
      </View>
    </View>
  )
}

// ── Hooks panel ────────────────────────────────────────────────────────────────

const HOOK_COLORS: Record<string, string> = {
  SessionStart: '#60a5fa',
  PreToolUse:   C.yellow,
  PostToolUse:  C.green,
  Stop:         C.red,
}

function HooksPanel({ syncMode }: { syncMode: string }) {
  const hooks = [
    { name: 'SessionStart', color: HOOK_COLORS.SessionStart },
    { name: 'PreToolUse',   color: HOOK_COLORS.PreToolUse   },
    { name: 'PostToolUse',  color: HOOK_COLORS.PostToolUse  },
    { name: 'Stop',         color: HOOK_COLORS.Stop         },
  ]

  if (syncMode !== 'desktop') {
    return (
      <DesktopOnlyHint
        icon="git-branch-outline"
        title="Hooks"
        sub={'Configure hooks in:\n~/.mentis/settings.json'}
      />
    )
  }

  return (
    <View style={{ padding: 8 }}>
      <Text style={styles.groupHeader}>HOOK TYPES</Text>
      {hooks.map(h => (
        <View key={h.name} style={styles.hookRow}>
          <View style={[styles.hookDot, { backgroundColor: h.color }]} />
          <Text style={[styles.hookName, { color: h.color }]}>{h.name}</Text>
        </View>
      ))}
      <Text style={styles.hooksNote}>Edit ~/.mentis/settings.json to configure hooks</Text>
    </View>
  )
}

// ── Shared: desktop-only hint ──────────────────────────────────────────────────

function DesktopOnlyHint({ icon, title, sub }: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  title: string
  sub: string
}) {
  return (
    <View style={styles.desktopHint}>
      <Ionicons name={icon} size={22} color={C.muted} style={{ marginBottom: 8 }} />
      <Text style={styles.desktopHintTitle}>{title}</Text>
      <Text style={styles.desktopHintSub}>{sub}</Text>
    </View>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    opacity: 0.6,
  },
  drawer: {
    position:        'absolute',
    top:             0,
    left:            0,
    bottom:          0,
    width:           DRAWER_W,
    backgroundColor: '#0a0a0a',
    borderRightWidth: 1,
    borderRightColor: C.border,
    flexDirection:   'column',
  },

  // Logo
  logoRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  logoBox:   { width: 20, height: 20, borderRadius: 5, backgroundColor: C.accent + '33', alignItems: 'center', justifyContent: 'center' },
  logoLetter: { fontSize: 10, fontWeight: '800', color: C.accentL },
  logoName:  { fontSize: 12, fontWeight: '600', color: C.textDim },
  logoSub:   { fontSize: 10, color: C.muted },

  // New chat
  newChatWrap: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 4 },
  newChatBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9, backgroundColor: C.accent },
  newChatText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Nav tabs
  navTabs:        { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 4, gap: 2 },
  navTab:         { flex: 1, flexDirection: 'column', alignItems: 'center', gap: 3, paddingVertical: 7, paddingHorizontal: 4, borderRadius: 8 },
  navTabActive:   { backgroundColor: 'rgba(255,255,255,0.06)' },
  navTabLabel:    { fontSize: 9, color: C.muted, fontWeight: '500', textAlign: 'center' },
  navTabLabelActive: { color: C.textDim },

  divider: { height: 1, backgroundColor: C.border, marginHorizontal: 14, marginVertical: 2, opacity: 0.5 },

  // Sessions
  groupHeader: { fontSize: 9, fontWeight: '600', color: C.muted, letterSpacing: 1, paddingHorizontal: 10, paddingVertical: 6, textTransform: 'uppercase' },
  groupLabel:  { fontSize: 9, color: C.muted + '99', paddingHorizontal: 10, paddingVertical: 3 },
  sessionRow:         { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 8, marginHorizontal: 4, borderRadius: 8 },
  sessionRowActive:   { backgroundColor: C.accent + '18' },
  sessionTitle:       { flex: 1, fontSize: 11, color: C.muted2 },
  sessionTitleActive: { color: C.textDim },
  sessionTime:        { fontSize: 9, color: C.muted, opacity: 0.6 },

  // Search
  searchBox:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 8, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: C.panel2, borderRadius: 9, borderWidth: 1, borderColor: C.border2 },
  searchInput: { flex: 1, fontSize: 12, color: C.text },

  // Empty / hints
  emptyHint:  { alignItems: 'center', paddingVertical: 20 },
  emptyText:  { fontSize: 11, color: C.muted, textAlign: 'center' },

  // MCP / Info card
  infoCard:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: C.panel, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 10, marginBottom: 6 },
  infoCardDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green, marginTop: 3 },
  infoCardTitle: { fontSize: 11, color: C.textDim, fontWeight: '500', marginBottom: 2 },
  infoCardSub:   { fontSize: 10, color: C.muted, fontFamily: F.mono, lineHeight: 15 },

  // Hooks
  hookRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 4, borderRadius: 7, marginBottom: 2 },
  hookDot:   { width: 6, height: 6, borderRadius: 3 },
  hookName:  { fontSize: 11, fontFamily: F.mono, fontWeight: '600' },
  hooksNote: { fontSize: 10, color: C.muted, fontFamily: F.mono, marginTop: 10, lineHeight: 16, paddingHorizontal: 4 },

  // Desktop only hint
  desktopHint:      { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 24, gap: 4 },
  desktopHintTitle: { fontSize: 12, fontWeight: '600', color: C.textDim, marginBottom: 4 },
  desktopHintSub:   { fontSize: 11, color: C.muted, textAlign: 'center', lineHeight: 17, fontFamily: F.mono },

  // Bottom
  bottomSection: { borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 10, paddingTop: 10, gap: 6 },
  modeBtn:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  modePlan:      { borderColor: C.accent + '44', backgroundColor: C.accent + '12' },
  modeBuild:     { borderColor: '#166534', backgroundColor: '#0f2d1a' },
  modeBtnText:   { fontSize: 11, fontFamily: F.mono, fontWeight: '700', letterSpacing: 0.5 },
  syncRow:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  syncText:      { fontSize: 10, color: C.muted, flex: 1, fontFamily: F.mono },
  actionsRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clearBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 7 },
  clearBtnText:  { fontSize: 11, color: C.red, opacity: 0.7 },
  version:       { fontSize: 10, color: C.muted, fontFamily: F.mono, paddingRight: 4 },
})
