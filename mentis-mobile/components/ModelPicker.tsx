import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator, FlatList, Modal, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { useSettings } from '../store'
import { PROVIDERS, ProviderDef, ProviderModel, DEFAULT_MODEL } from '../services/providersConfig'
import { C } from '../constants/theme'

// ── Ollama local model fetcher ────────────────────────────────────────────────

async function fetchOllamaModels(ollamaUrl: string): Promise<ProviderModel[]> {
  try {
    const base = ollamaUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '')
    const resp = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) })
    const data = await resp.json()
    return ((data.models ?? []) as Array<{ name: string }>)
      .map(m => ({ id: m.name, label: m.name }))
      .sort((a, b) => a.label.localeCompare(b.label))
  } catch {
    return []
  }
}

// ── OpenRouter free-model fetcher ─────────────────────────────────────────────

async function fetchFreeORModels(apiKey?: string): Promise<ProviderModel[]> {
  try {
    const headers: Record<string, string> = {
      'HTTP-Referer': 'https://mentis.app',
      'X-Title':      'Mentis Mobile',
    }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    const resp = await fetch('https://openrouter.ai/api/v1/models', { headers })
    const data = await resp.json()
    return ((data.data ?? []) as Array<{
      id: string; name?: string; description?: string
      pricing?: { prompt?: string | number }
    }>)
      .filter(m => m.pricing?.prompt === '0' || m.pricing?.prompt === 0)
      .map(m => ({
        id:    m.id,
        label: m.name ?? m.id,
        hint:  (m.description ?? '').slice(0, 70),
        free:  true,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  } catch {
    return []
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean
  onClose: () => void
}

export default function ModelPicker({ visible, onClose }: Props) {
  const settings = useSettings()

  const [tab,         setTab]         = useState(settings.provider)
  const [orModels,    setOrModels]    = useState<ProviderModel[]>([])
  const [orLoading,   setOrLoading]   = useState(false)
  const [orError,     setOrError]     = useState(false)
  const [query,       setQuery]       = useState('')
  const [ollamaModel, setOllamaModel] = useState(settings.model)
  const [olModels,    setOlModels]    = useState<ProviderModel[]>([])
  const [olLoading,   setOlLoading]   = useState(false)
  const [olFetched,   setOlFetched]   = useState(false)
  const fetchedRef = useRef(false)

  // Reset to current provider on open
  useEffect(() => {
    if (visible) {
      setTab(settings.provider)
      setQuery('')
      fetchedRef.current = false
      setOlFetched(false)
    }
  }, [visible])

  // Fetch OpenRouter free models when OR tab is active
  useEffect(() => {
    if (tab !== 'openrouter' || fetchedRef.current) return
    fetchedRef.current = true
    setOrLoading(true)
    setOrError(false)
    fetchFreeORModels(settings.openrouterKey)
      .then(models => {
        setOrModels(models)
        setOrError(models.length === 0)
      })
      .finally(() => setOrLoading(false))
  }, [tab, settings.openrouterKey])

  // Auto-detect Ollama models when Ollama tab is active
  useEffect(() => {
    if (tab !== 'ollama' || olFetched) return
    setOlFetched(true)
    setOlLoading(true)
    fetchOllamaModels(settings.ollamaUrl || 'http://localhost:11434/v1')
      .then(models => setOlModels(models))
      .finally(() => setOlLoading(false))
  }, [tab, olFetched, settings.ollamaUrl])

  const provDef = PROVIDERS.find(p => p.id === tab) as ProviderDef

  const modelList: ProviderModel[] = tab === 'openrouter'
    ? (query
        ? orModels.filter(m => m.label.toLowerCase().includes(query.toLowerCase()) || m.id.toLowerCase().includes(query.toLowerCase()))
        : orModels)
    : provDef?.models ?? []

  const selectModel = (model: string) => {
    settings.save({ model, provider: tab as typeof settings.provider })
    onClose()
  }

  const applyOllama = () => {
    if (!ollamaModel.trim()) return
    settings.save({ model: ollamaModel.trim(), provider: 'ollama' })
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Title */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>Select Model</Text>
          <TouchableOpacity style={styles.closeX} onPress={onClose}>
            <Text style={styles.closeXTxt}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Provider tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabsContent}
        >
          {PROVIDERS.map(p => {
            const active = tab === p.id
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.tab, active && { borderColor: p.color + 'aa', backgroundColor: p.color + '22' }]}
                onPress={() => { setTab(p.id); setQuery('') }}
              >
                <Text style={[styles.tabIcon, { color: active ? p.color : C.muted }]}>{p.icon}</Text>
                <Text style={[styles.tabLabel, { color: active ? p.color : C.muted }]}>{p.label}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* Provider color bar */}
        <View style={[styles.colorBar, { backgroundColor: provDef?.color ?? C.accent }]} />

        {/* Content area */}
        {tab === 'ollama' ? (
          /* Ollama — auto-detect + manual fallback */
          <View style={{ flex: 1 }}>
            {/* Detected models */}
            {olLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={provDef?.color ?? C.accent} />
                <Text style={styles.loadingTxt}>Detecting Ollama models…</Text>
                <Text style={styles.ollamaHint}>{settings.ollamaUrl || 'http://localhost:11434/v1'}</Text>
              </View>
            ) : olModels.length > 0 ? (
              <FlatList
                data={olModels}
                keyExtractor={m => m.id}
                style={styles.list}
                ListHeaderComponent={
                  <View style={styles.ollamaDetectedHeader}>
                    <Text style={styles.sectionLabel}>Detected models</Text>
                    <TouchableOpacity onPress={() => { setOlFetched(false); setOlModels([]) }}>
                      <Text style={styles.retryTxt}>↺ refresh</Text>
                    </TouchableOpacity>
                  </View>
                }
                renderItem={({ item: m }) => (
                  <ModelCard
                    model={m}
                    active={settings.model === m.id && settings.provider === 'ollama'}
                    accentColor={provDef?.color ?? C.accent}
                    onSelect={() => selectModel(m.id)}
                  />
                )}
              />
            ) : (
              <View style={styles.center}>
                <Text style={styles.errorTxt}>No models found at{'\n'}{settings.ollamaUrl || 'http://localhost:11434/v1'}</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => { setOlFetched(false); setOlModels([]) }}
                >
                  <Text style={styles.retryTxt}>↺ Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Manual entry fallback */}
            <View style={styles.ollamaArea}>
              <Text style={styles.sectionLabel}>Or enter model name manually</Text>
              <View style={styles.ollamaRow}>
                <TextInput
                  style={[styles.ollamaInput, { flex: 1 }]}
                  value={ollamaModel}
                  onChangeText={setOllamaModel}
                  placeholder="llama3, mistral, phi3…"
                  placeholderTextColor={C.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity style={[styles.applyBtn, { backgroundColor: provDef?.color }]} onPress={applyOllama}>
                  <Text style={styles.applyBtnTxt}>Use</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : tab === 'openrouter' ? (
          /* OpenRouter — search + fetched list */
          <View style={styles.orArea}>
            <View style={styles.searchRow}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search free models…"
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

            {orLoading && (
              <View style={styles.center}>
                <ActivityIndicator color={C.accent} />
                <Text style={styles.loadingTxt}>Fetching free models…</Text>
              </View>
            )}

            {orError && !orLoading && (
              <View style={styles.center}>
                <Text style={styles.errorTxt}>Could not load models. Check OpenRouter key in Settings.</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => { fetchedRef.current = false; setOrModels([]); setOrError(false) }}
                >
                  <Text style={styles.retryTxt}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {!orLoading && !orError && (
              <FlatList
                data={modelList}
                keyExtractor={m => m.id}
                style={styles.list}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text style={styles.emptyTxt}>
                    {query ? 'No models match.' : 'No free models found.'}
                  </Text>
                }
                renderItem={({ item: m }) => (
                  <ModelCard
                    model={m}
                    active={settings.model === m.id && settings.provider === 'openrouter'}
                    accentColor={provDef?.color ?? C.accent}
                    onSelect={() => selectModel(m.id)}
                  />
                )}
              />
            )}
          </View>
        ) : (
          /* Static model list */
          <FlatList
            data={modelList}
            keyExtractor={m => m.id}
            style={styles.list}
            ListEmptyComponent={<Text style={styles.emptyTxt}>No models configured.</Text>}
            renderItem={({ item: m }) => (
              <ModelCard
                model={m}
                active={settings.model === m.id && settings.provider === tab}
                accentColor={provDef?.color ?? C.accent}
                onSelect={() => selectModel(m.id)}
              />
            )}
          />
        )}
        </View>
      </View>
    </Modal>
  )
}

// ── Model card ────────────────────────────────────────────────────────────────

function ModelCard({ model, active, accentColor, onSelect }: {
  model:       ProviderModel
  active:      boolean
  accentColor: string
  onSelect:    () => void
}) {
  return (
    <TouchableOpacity
      style={[styles.card, active && { borderColor: accentColor + '88', backgroundColor: accentColor + '14' }]}
      onPress={onSelect}
    >
      <View style={{ flex: 1 }}>
        <View style={styles.cardTitleRow}>
          <Text style={[styles.cardLabel, active && { color: accentColor }]} numberOfLines={1}>
            {model.label}
          </Text>
          {model.free && (
            <View style={[styles.freeBadge, { borderColor: accentColor + '66' }]}>
              <Text style={[styles.freeTxt, { color: accentColor }]}>FREE</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardId} numberOfLines={1}>{model.id}</Text>
        {model.hint ? <Text style={styles.cardHint} numberOfLines={2}>{model.hint}</Text> : null}
      </View>
      {active && <Text style={[styles.check, { color: accentColor }]}>✓</Text>}
    </TouchableOpacity>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay:       { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000c' },
  sheet:         { backgroundColor: C.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 36, height: '72%' },
  handle:        { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border2, alignSelf: 'center', marginTop: 10 },

  titleRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  title:         { flex: 1, fontSize: 17, fontWeight: '700', color: C.text },
  closeX:        { width: 28, height: 28, borderRadius: 14, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' },
  closeXTxt:     { fontSize: 12, color: C.muted2 },

  tabsScroll:    { flexGrow: 0 },
  tabsContent:   { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  tab:           { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: C.border2, backgroundColor: C.panel2 },
  tabIcon:       { fontSize: 13 },
  tabLabel:      { fontSize: 12, fontWeight: '600' },

  colorBar:      { height: 2, marginHorizontal: 12, borderRadius: 1, marginBottom: 4 },

  list:          { flex: 1 },
  card:          { marginHorizontal: 12, marginBottom: 6, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: C.border2, backgroundColor: C.panel2, flexDirection: 'row', alignItems: 'center' },
  cardTitleRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  cardLabel:     { fontSize: 14, fontWeight: '600', color: C.text, flex: 1 },
  cardId:        { fontSize: 11, color: C.muted, fontFamily: 'Courier New' },
  cardHint:      { fontSize: 11, color: C.muted2, marginTop: 3, lineHeight: 16 },
  freeBadge:     { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  freeTxt:       { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  check:         { fontSize: 16, marginLeft: 10 },

  emptyTxt:      { textAlign: 'center', color: C.muted, fontSize: 13, padding: 32 },

  /* OpenRouter */
  orArea:        { flex: 1 },
  searchRow:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginBottom: 8, backgroundColor: C.panel2, borderRadius: 10, borderWidth: 1, borderColor: C.border2, paddingHorizontal: 10, gap: 6 },
  searchIcon:    { fontSize: 16, color: C.muted },
  searchInput:   { flex: 1, color: C.text, fontSize: 14, paddingVertical: 9 },
  clearSearch:   { fontSize: 12, color: C.muted, padding: 4 },
  center:        { alignItems: 'center', paddingTop: 40, gap: 12 },
  loadingTxt:    { color: C.muted, fontSize: 13, marginTop: 8 },
  errorTxt:      { color: C.red, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
  retryBtn:      { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.border2 },
  retryTxt:      { color: C.textDim, fontSize: 13 },

  /* Ollama */
  ollamaArea:          { padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: C.border2 },
  ollamaRow:           { flexDirection: 'row', gap: 8, alignItems: 'center' },
  ollamaDetectedHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 },
  sectionLabel:        { fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  ollamaInput:         { backgroundColor: C.panel2, borderWidth: 1, borderColor: C.border2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 13, fontFamily: 'Courier New' },
  ollamaHint:          { fontSize: 11, color: C.muted, lineHeight: 18, textAlign: 'center' },
  applyBtn:            { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  applyBtnTxt:         { color: '#fff', fontSize: 13, fontWeight: '600' },
})
