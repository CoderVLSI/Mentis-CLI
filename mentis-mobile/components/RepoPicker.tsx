import { useEffect, useState } from 'react'
import {
  ActivityIndicator, FlatList, Modal, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { useSettings } from '../store'
import { listRepos, GithubRepo } from '../services/githubClient'
import { C } from '../constants/theme'

interface Props {
  visible:  boolean
  onClose:  () => void
}

export default function RepoPicker({ visible, onClose }: Props) {
  const settings = useSettings()
  const [repos, setRepos]       = useState<GithubRepo[]>([])
  const [loading, setLoading]   = useState(false)
  const [query, setQuery]       = useState('')
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    if (!visible || !settings.githubToken) return
    setLoading(true)
    setError(null)
    listRepos(settings.githubToken)
      .then(setRepos)
      .catch(() => setError('Could not load repos. Check your GitHub token.'))
      .finally(() => setLoading(false))
  }, [visible, settings.githubToken])

  const filtered = query
    ? repos.filter(r => r.full_name.toLowerCase().includes(query.toLowerCase()))
    : repos

  const select = (repo: GithubRepo) => {
    settings.save({ githubRepo: repo.full_name, githubBranch: repo.default_branch || 'main' })
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* Dim backdrop */}
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

      {/* Bottom sheet */}
      <View style={styles.sheet}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>Select repository</Text>
            <Text style={styles.sheetSub}>Choose a GitHub repo for this session</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search repositories…"
            placeholderTextColor={C.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Text style={styles.clearSearch}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* No token */}
        {!settings.githubToken && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No GitHub token configured.{'\n'}Add one in Settings → GitHub Connector.</Text>
          </View>
        )}

        {/* Loading */}
        {loading && <ActivityIndicator color={C.accent} style={{ marginTop: 32 }} />}

        {/* Error */}
        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Repo list */}
        {!loading && !error && settings.githubToken && (
          <FlatList
            data={filtered}
            keyExtractor={r => r.full_name}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {query ? 'No repos match your search.' : 'No repositories found.'}
              </Text>
            }
            renderItem={({ item: r }) => {
              const isSelected = settings.githubRepo === r.full_name
              return (
                <TouchableOpacity
                  style={[styles.repoRow, isSelected && styles.repoRowActive]}
                  onPress={() => select(r)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.repoName, isSelected && { color: C.accentL }]}>
                      {r.full_name}
                    </Text>
                    <Text style={styles.repoBranch}>Default branch: {r.default_branch || 'main'}</Text>
                    {r.description ? (
                      <Text style={styles.repoDesc} numberOfLines={1}>{r.description}</Text>
                    ) : null}
                  </View>
                  {isSelected && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              )
            }}
          />
        )}

        {/* Disconnect button if a repo is connected */}
        {settings.githubRepo ? (
          <TouchableOpacity
            style={styles.disconnectRow}
            onPress={() => { settings.save({ githubRepo: '', githubBranch: 'main' }); onClose() }}
          >
            <Text style={styles.disconnectText}>Disconnect repo</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop:       { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000aa' },
  sheet:          { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%', paddingBottom: 32 },
  handle:         { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetHeader:    { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  sheetTitle:     { fontSize: 16, fontWeight: '700', color: C.text },
  sheetSub:       { fontSize: 12, color: C.muted, marginTop: 2 },
  closeBtn:       { width: 28, height: 28, borderRadius: 14, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' },
  closeTxt:       { fontSize: 12, color: C.muted2 },
  searchRow:      { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, backgroundColor: C.panel2, borderRadius: 10, borderWidth: 1, borderColor: C.border2, paddingHorizontal: 10, gap: 6 },
  searchIcon:     { fontSize: 16, color: C.muted },
  searchInput:    { flex: 1, color: C.text, fontSize: 14, paddingVertical: 9 },
  clearSearch:    { fontSize: 12, color: C.muted, padding: 4 },
  list:           { flex: 1 },
  repoRow:        { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', alignItems: 'center' },
  repoRowActive:  { backgroundColor: C.accent + '14' },
  repoName:       { fontSize: 14, fontWeight: '600', color: C.text, fontFamily: 'Courier New' },
  repoBranch:     { fontSize: 11, color: C.muted, marginTop: 2 },
  repoDesc:       { fontSize: 11, color: C.muted2, marginTop: 2 },
  check:          { fontSize: 16, color: C.accentL, marginLeft: 10 },
  empty:          { padding: 32, alignItems: 'center' },
  emptyText:      { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 20 },
  errorText:      { fontSize: 12, color: C.red, textAlign: 'center', margin: 16 },
  disconnectRow:  { borderTopWidth: 1, borderTopColor: C.border, padding: 16, alignItems: 'center' },
  disconnectText: { fontSize: 13, color: C.red, fontWeight: '500' },
})
