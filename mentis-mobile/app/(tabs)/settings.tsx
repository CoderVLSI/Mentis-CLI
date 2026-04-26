import { useState } from 'react'
import {
  Alert, KeyboardAvoidingView, Platform, SafeAreaView,
  ScrollView, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native'
import { useSettings } from '../../store'
import { checkHealth } from '../../services/mentisClient'
import { verifyToken, listRepos, GithubRepo } from '../../services/githubClient'
import { C } from '../../constants/theme'

const CLAUDE_MODELS = ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']
const OR_MODELS = [
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-4-scout:free',
  'deepseek/deepseek-r1:free',
  'mistralai/mistral-7b-instruct:free',
  'microsoft/phi-4:free',
  'qwen/qwen3-30b-a3b:free',
]

export default function SettingsScreen() {
  const settings = useSettings()
  const [testing, setTesting]           = useState(false)
  const [testResult, setTestResult]     = useState<boolean | null>(null)
  const [ghVerifying, setGhVerifying]   = useState(false)
  const [ghUser, setGhUser]             = useState<string | null>(null)
  const [repos, setRepos]               = useState<GithubRepo[]>([])
  const [showRepos, setShowRepos]       = useState(false)

  const isDesktop = settings.syncMode === 'desktop'

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    const ok = await checkHealth(settings.desktopHost)
    setTestResult(ok)
    setTesting(false)
    if (!ok) Alert.alert('Connection failed', `Could not reach ${settings.desktopHost}.\n\nMake sure:\n• Mentis Desktop is running\n• You're on the same Wi-Fi\n• The IP address is correct`)
  }

  const toggleSyncMode = (val: boolean) => {
    settings.save({ syncMode: val ? 'desktop' : 'standalone' })
    setTestResult(null)
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

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Sync mode */}
          <Section title="Sync Mode">
            <Row label="Desktop Sync" hint={isDesktop ? 'Using your PC as AI backend' : 'Connecting directly to Anthropic'}>
              <Switch
                value={isDesktop}
                onValueChange={toggleSyncMode}
                trackColor={{ false: C.border2, true: C.accent + '88' }}
                thumbColor={isDesktop ? C.accent : C.muted}
              />
            </Row>
          </Section>

          {isDesktop ? (
            /* ── Desktop sync mode ─────────────────────────────────────────── */
            <Section title="Desktop Connection">
              <Field label="Desktop IP : Port" hint="Find in Mentis Desktop → Settings → About">
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
            /* ── Standalone mode ───────────────────────────────────────────── */
            <>
              {/* Provider selector */}
              <Section title="Provider">
                <View style={styles.chipRow}>
                  {(['anthropic', 'openrouter'] as const).map(p => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.chip, settings.provider === p && styles.chipActive]}
                      onPress={() => settings.save({ provider: p })}
                    >
                      <Text style={[styles.chipText, settings.provider === p && styles.chipTextActive]}>
                        {p === 'anthropic' ? 'Anthropic' : 'OpenRouter'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Section>

              {settings.provider === 'openrouter' ? (
                /* ── OpenRouter ──────────────────────────────────────────── */
                <Section title="OpenRouter" >
                  <Field label="API Key" hint="Free at openrouter.ai/settings/keys  ·  sk-or-v1-…">
                    <TextInput
                      style={styles.input}
                      value={settings.openrouterKey}
                      onChangeText={v => settings.save({ openrouterKey: v })}
                      placeholder="sk-or-v1-…"
                      placeholderTextColor={C.muted}
                      secureTextEntry
                      autoCapitalize="none"
                    />
                  </Field>
                  <Field label="Free model">
                    <View style={styles.chipRow}>
                      {OR_MODELS.map(m => (
                        <TouchableOpacity
                          key={m}
                          style={[styles.chip, settings.model === m && styles.chipActive]}
                          onPress={() => settings.save({ model: m })}
                        >
                          <Text style={[styles.chipText, settings.model === m && styles.chipTextActive]}>
                            {m.split('/')[1]?.replace(':free', '') ?? m}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </Field>
                </Section>
              ) : (
                /* ── Anthropic ───────────────────────────────────────────── */
                <Section title="Anthropic">
                  <Field label="API Key" hint="Get from console.anthropic.com">
                    <TextInput
                      style={styles.input}
                      value={settings.anthropicKey}
                      onChangeText={v => settings.save({ anthropicKey: v })}
                      placeholder="sk-ant-api03-…"
                      placeholderTextColor={C.muted}
                      secureTextEntry
                      autoCapitalize="none"
                    />
                  </Field>
                  <Field label="Model">
                    <View style={styles.chipRow}>
                      {CLAUDE_MODELS.map(m => (
                        <TouchableOpacity
                          key={m}
                          style={[styles.chip, settings.model === m && styles.chipActive]}
                          onPress={() => settings.save({ model: m })}
                        >
                          <Text style={[styles.chipText, settings.model === m && styles.chipTextActive]}>
                            {m.replace('claude-', '').replace('-4-7', ' Opus').replace('-4-6', ' Sonnet').replace('-4-5-20251001', ' Haiku')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </Field>
                </Section>
              )}
            </>
          )}

          {/* GitHub connector */}
          <Section title="GitHub Connector">
            <Field label="Personal Access Token" hint="github.com/settings/tokens — needs repo scope">
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
                {ghVerifying ? 'Connecting…' : ghUser ? `✓ ${ghUser} — tap to refresh repos` : 'Connect GitHub'}
              </Text>
            </TouchableOpacity>

            {showRepos && repos.length > 0 && (
              <Field label="Select repo">
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
                        {r.description && (
                          <Text style={styles.repoDesc} numberOfLines={1}>{r.description}</Text>
                        )}
                      </View>
                      {settings.githubRepo === r.full_name && (
                        <Text style={styles.repoCheck}>✓</Text>
                      )}
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
              ['App',     'Mentis Mobile v1.0.0'],
              ['Sync',    settings.syncMode === 'desktop' ? `Desktop @ ${settings.desktopHost}` : 'Standalone'],
              ['Session', 'Sessions sync via ~/.mentis/sessions/'],
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

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.bg },
  header:        { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel },
  headerTitle:   { fontSize: 16, fontWeight: '700', color: C.text },
  scroll:        { padding: 16, gap: 20 },
  section:       { gap: 12 },
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
  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:          { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: C.border2, backgroundColor: C.panel2 },
  chipActive:    { borderColor: C.accent + '66', backgroundColor: C.accent + '22' },
  chipText:      { fontSize: 12, color: C.muted },
  chipTextActive: { color: C.accentL, fontWeight: '600' },
  aboutRow:        { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  aboutKey:        { fontSize: 12, color: C.muted, width: 60 },
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
