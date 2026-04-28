import { useState } from 'react'
import {
  Alert, KeyboardAvoidingView, Platform, SafeAreaView,
  ScrollView, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native'
import { useSettings, Provider } from '../../store'
import { checkHealth } from '../../services/mentisClient'
import { verifyToken, listRepos, GithubRepo } from '../../services/githubClient'
import { PROVIDERS, DEFAULT_MODEL } from '../../services/providersConfig'
import { C } from '../../constants/theme'

export default function SettingsScreen() {
  const settings = useSettings()
  const [testing, setTesting]         = useState(false)
  const [testResult, setTestResult]   = useState<boolean | null>(null)
  const [ghVerifying, setGhVerifying] = useState(false)
  const [ghUser, setGhUser]           = useState<string | null>(null)
  const [repos, setRepos]             = useState<GithubRepo[]>([])
  const [showRepos, setShowRepos]     = useState(false)

  const isDesktop = settings.syncMode === 'desktop'

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    const ok = await checkHealth(settings.desktopHost)
    setTestResult(ok)
    setTesting(false)
    if (!ok) Alert.alert('Connection failed', `Could not reach ${settings.desktopHost}.\n\nMake sure:\n• Mentis Desktop is running\n• You're on the same Wi-Fi\n• The IP address is correct`)
  }

  const verifyGithub = async () => {
    if (!settings.githubToken) {
      Alert.alert('No token', 'Enter a GitHub Personal Access Token first.')
      return
    }
    setGhVerifying(true)
    setGhUser(null)
    const info = await verifyToken(settings.githubToken)
    if (info) {
      setGhUser(info.name || info.login)
      const repoList = await listRepos(settings.githubToken).catch(() => [])
      setRepos(repoList)
      setShowRepos(true)
    } else {
      Alert.alert('Token invalid', 'Could not authenticate with GitHub. Check your PAT has "repo" scope.')
    }
    setGhVerifying(false)
  }

  const provDef = PROVIDERS.find(p => p.id === settings.provider)

  // Get key field name and placeholder for current provider
  type ProviderInfo = { keyField: keyof typeof settings; placeholder: string; hint: string }
  const providerInfo: Partial<Record<Provider, ProviderInfo>> = {
    anthropic:  { keyField: 'anthropicKey',  placeholder: 'sk-ant-api03-…',  hint: 'console.anthropic.com' },
    openai:     { keyField: 'openaiKey',     placeholder: 'sk-…',            hint: 'platform.openai.com/api-keys' },
    gemini:     { keyField: 'geminiKey',     placeholder: 'AIza…',           hint: 'aistudio.google.com/apikey' },
    grok:       { keyField: 'grokKey',       placeholder: 'xai-…',           hint: 'console.x.ai' },
    kimi:       { keyField: 'kimiKey',       placeholder: 'sk-…',            hint: 'platform.moonshot.cn' },
    glm:        { keyField: 'glmKey',        placeholder: '…',               hint: 'open.bigmodel.cn (GLM-4 Flash is free)' },
    openrouter: { keyField: 'openrouterKey', placeholder: 'sk-or-v1-…',      hint: 'openrouter.ai/settings/keys (free account ok)' },
  }

  const pInfo = providerInfo[settings.provider as Provider]

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Sync mode toggle */}
          <Section title="Sync Mode">
            <Row
              label="Desktop Sync"
              hint={isDesktop ? 'Using your PC as AI backend' : 'Phone connects directly to AI APIs'}
            >
              <Switch
                value={isDesktop}
                onValueChange={val => { settings.save({ syncMode: val ? 'desktop' : 'standalone' }); setTestResult(null) }}
                trackColor={{ false: C.border2, true: C.accent + '88' }}
                thumbColor={isDesktop ? C.accent : C.muted}
              />
            </Row>
          </Section>

          {isDesktop ? (
            /* ── Desktop connection ──────────────────────────────────────── */
            <Section title="Desktop Connection">
              <Field label="Desktop IP : Port" hint="Find in Mentis Desktop → Settings">
                <TextInput
                  style={styles.input}
                  value={settings.desktopHost}
                  onChangeText={v => settings.save({ desktopHost: v })}
                  placeholder="192.168.1.x:3747"
                  placeholderTextColor={C.muted}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </Field>
              <Field label="Pairing Token" hint="6-char code shown in Desktop → Settings → Sync">
                <TextInput
                  style={styles.input}
                  value={settings.syncToken}
                  onChangeText={v => settings.save({ syncToken: v.toUpperCase().slice(0, 6) })}
                  placeholder="ABC123"
                  placeholderTextColor={C.muted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={6}
                />
              </Field>
              <TouchableOpacity
                style={[styles.btn, testing && styles.btnDisabled]}
                onPress={testConnection}
                disabled={testing}
              >
                <Text style={styles.btnText}>
                  {testing ? 'Testing…' : testResult === true ? '✓ Connected' : testResult === false ? '✗ Failed — tap to retry' : 'Test Connection'}
                </Text>
              </TouchableOpacity>
              {testResult === true && (
                <View style={styles.successBanner}>
                  <Text style={styles.successText}>Connected to Mentis Desktop</Text>
                </View>
              )}
            </Section>
          ) : (
            /* ── Standalone mode ─────────────────────────────────────────── */
            <>
              {/* Provider chips */}
              <Section title="Provider">
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    {PROVIDERS.filter(p => p.id !== 'ollama').map(p => {
                      const active = settings.provider === p.id
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[
                            styles.provChip,
                            active && { borderColor: p.color + 'aa', backgroundColor: p.color + '22' },
                          ]}
                          onPress={() => settings.save({
                            provider: p.id as Provider,
                            model: DEFAULT_MODEL[p.id] ?? '',
                          })}
                        >
                          <Text style={[styles.provIcon, { color: active ? p.color : C.muted }]}>{p.icon}</Text>
                          <Text style={[styles.provLabel, { color: active ? p.color : C.muted }]}>{p.label}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </ScrollView>

                {/* Ollama row */}
                <TouchableOpacity
                  style={[styles.ollamaRow, settings.provider === 'ollama' && styles.ollamaRowActive]}
                  onPress={() => settings.save({ provider: 'ollama', model: settings.ollamaUrl ? settings.model : 'llama3' })}
                >
                  <Text style={[styles.provIcon, { color: settings.provider === 'ollama' ? C.muted2 : C.muted }]}>⬇</Text>
                  <Text style={[styles.provLabel, { color: settings.provider === 'ollama' ? C.textDim : C.muted }]}>Ollama (local)</Text>
                  {settings.provider === 'ollama' && <Text style={{ color: C.muted, fontSize: 12, marginLeft: 'auto' }}>selected</Text>}
                </TouchableOpacity>
              </Section>

              {/* Provider API key */}
              {settings.provider !== 'ollama' && pInfo && (
                <Section title={`${provDef?.label ?? 'Provider'} API Key`}>
                  <Field label="API Key" hint={pInfo.hint}>
                    <TextInput
                      style={styles.input}
                      value={(settings[pInfo.keyField] as string) ?? ''}
                      onChangeText={v => settings.save({ [pInfo.keyField]: v } as Partial<typeof settings>)}
                      placeholder={pInfo.placeholder}
                      placeholderTextColor={C.muted}
                      secureTextEntry
                      autoCapitalize="none"
                    />
                  </Field>
                </Section>
              )}

              {/* Ollama URL */}
              {settings.provider === 'ollama' && (
                <Section title="Ollama">
                  <Field label="Server URL" hint="Default: http://localhost:11434/v1">
                    <TextInput
                      style={styles.input}
                      value={settings.ollamaUrl}
                      onChangeText={v => settings.save({ ollamaUrl: v })}
                      placeholder="http://192.168.1.x:11434/v1"
                      placeholderTextColor={C.muted}
                      autoCapitalize="none"
                      keyboardType="url"
                    />
                  </Field>
                </Section>
              )}

              {/* Selected model display */}
              <Section title="Active Model">
                <View style={styles.modelDisplay}>
                  <Text style={styles.modelDisplayIcon}>{provDef?.icon ?? '◈'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modelDisplayName} numberOfLines={1}>{settings.model || '(none selected)'}</Text>
                    <Text style={styles.modelDisplayHint}>Tap the model button in the chat header to change</Text>
                  </View>
                </View>
              </Section>
            </>
          )}

          {/* GitHub connector */}
          <Section title="GitHub Connector">
            <Field label="Personal Access Token" hint="github.com/settings/tokens — repo scope required">
              <TextInput
                style={styles.input}
                value={settings.githubToken}
                onChangeText={v => { settings.save({ githubToken: v }); setGhUser(null); setShowRepos(false) }}
                placeholder="ghp_…"
                placeholderTextColor={C.muted}
                secureTextEntry
                autoCapitalize="none"
              />
            </Field>

            <TouchableOpacity
              style={[styles.btn, ghVerifying && styles.btnDisabled]}
              onPress={verifyGithub}
              disabled={ghVerifying}
            >
              <Text style={styles.btnText}>
                {ghVerifying ? 'Connecting…' : ghUser ? `✓ ${ghUser} — tap to refresh` : 'Connect GitHub'}
              </Text>
            </TouchableOpacity>

            {showRepos && repos.length > 0 && (
              <Field label="Select repository">
                <ScrollView style={styles.repoList} nestedScrollEnabled>
                  {repos.map(r => (
                    <TouchableOpacity
                      key={r.full_name}
                      style={[styles.repoItem, settings.githubRepo === r.full_name && styles.repoItemActive]}
                      onPress={() => settings.save({ githubRepo: r.full_name })}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.repoName, settings.githubRepo === r.full_name && { color: C.accentL }]}>
                          {r.full_name}
                        </Text>
                        {r.description && <Text style={styles.repoDesc} numberOfLines={1}>{r.description}</Text>}
                      </View>
                      {settings.githubRepo === r.full_name && <Text style={styles.repoCheck}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </Field>
            )}

            {settings.githubRepo ? (
              <Field label="Branch">
                <TextInput
                  style={styles.input}
                  value={settings.githubBranch}
                  onChangeText={v => settings.save({ githubBranch: v })}
                  placeholder="main"
                  placeholderTextColor={C.muted}
                  autoCapitalize="none"
                />
              </Field>
            ) : null}

            {settings.githubRepo ? (
              <View style={styles.connectedBanner}>
                <Text style={styles.connectedText}>
                  ⬡ {settings.githubRepo} · {settings.githubBranch || 'main'}
                </Text>
                <TouchableOpacity onPress={() => settings.save({ githubRepo: '', githubBranch: 'main' })}>
                  <Text style={styles.disconnectText}>disconnect</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </Section>

          {/* About */}
          <Section title="About">
            {[
              ['App',      'Mentis Mobile v1.0.0'],
              ['Provider', `${provDef?.label ?? settings.provider} · ${settings.model || '—'}`],
              ['Sync',     settings.syncMode === 'desktop' ? `Desktop @ ${settings.desktopHost}` : 'Standalone'],
            ].map(([k, v]) => (
              <View key={k} style={styles.aboutRow}>
                <Text style={styles.aboutKey}>{k}</Text>
                <Text style={styles.aboutVal} numberOfLines={1}>{v}</Text>
              </View>
            ))}
          </Section>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint && <Text style={styles.fieldHint}>{hint}</Text>}
      </View>
      {children}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.bg },
  header:        { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel },
  headerTitle:   { fontSize: 16, fontWeight: '700', color: C.text },
  scroll:        { padding: 16, gap: 20 },
  section:       { gap: 10 },
  sectionTitle:  { fontSize: 11, fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  field:         { gap: 6 },
  fieldLabel:    { fontSize: 13, fontWeight: '500', color: C.textDim },
  fieldHint:     { fontSize: 11, color: C.muted },
  input:         { backgroundColor: C.panel2, borderWidth: 1, borderColor: C.border2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 13, fontFamily: 'Courier New' },
  switchRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  btn:           { backgroundColor: C.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnDisabled:   { opacity: 0.6 },
  btnText:       { color: '#fff', fontSize: 14, fontWeight: '600' },
  successBanner: { backgroundColor: C.green + '22', borderWidth: 1, borderColor: C.green + '44', borderRadius: 8, padding: 10 },
  successText:   { color: C.green, fontSize: 12, textAlign: 'center' },

  chipRow:       { flexDirection: 'row', gap: 8 },
  provChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: C.border2, backgroundColor: C.panel2 },
  provIcon:      { fontSize: 13 },
  provLabel:     { fontSize: 12, fontWeight: '600' },
  ollamaRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border2, backgroundColor: C.panel2, marginTop: 4 },
  ollamaRowActive: { borderColor: C.border, backgroundColor: C.panel },

  modelDisplay:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.panel2, borderRadius: 10, borderWidth: 1, borderColor: C.border2, paddingHorizontal: 14, paddingVertical: 12 },
  modelDisplayIcon:  { fontSize: 18, color: C.accent },
  modelDisplayName:  { fontSize: 13, color: C.text, fontFamily: 'Courier New' },
  modelDisplayHint:  { fontSize: 11, color: C.muted, marginTop: 2 },

  aboutRow:        { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  aboutKey:        { fontSize: 12, color: C.muted, width: 64 },
  aboutVal:        { fontSize: 12, color: C.textDim, flex: 1, textAlign: 'right' },
  repoList:        { maxHeight: 200, borderWidth: 1, borderColor: C.border2, borderRadius: 10, backgroundColor: C.panel2 },
  repoItem:        { padding: 12, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', alignItems: 'center' },
  repoItemActive:  { backgroundColor: C.accent + '18' },
  repoName:        { fontSize: 13, color: C.textDim, fontFamily: 'Courier New' },
  repoDesc:        { fontSize: 11, color: C.muted, marginTop: 2 },
  repoCheck:       { fontSize: 14, color: C.accentL, marginLeft: 8 },
  connectedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.accent + '18', borderWidth: 1, borderColor: C.accent + '33', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  connectedText:   { fontSize: 12, color: C.accentL, flex: 1 },
  disconnectText:  { fontSize: 11, color: C.muted, textDecorationLine: 'underline' },
})
