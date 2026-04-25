import { useState } from 'react'
import {
  Alert, KeyboardAvoidingView, Platform, SafeAreaView,
  ScrollView, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native'
import { useSettings } from '../../store'
import { checkHealth } from '../../services/mentisClient'
import { C } from '../../constants/theme'

const CLAUDE_MODELS = ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001']

export default function SettingsScreen() {
  const settings = useSettings()
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)

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
                        onPress={() => settings.save({ model: m, provider: 'anthropic' })}
                      >
                        <Text style={[styles.chipText, settings.model === m && styles.chipTextActive]}>
                          {m.replace('claude-', '').replace('-4-7', ' Opus').replace('-4-6', ' Sonnet').replace('-4-5-20251001', ' Haiku')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </Field>
              </Section>

              <Section title="Ollama (Local)">
                <Row label="Use Ollama" hint="Connect to local Ollama instance">
                  <Switch
                    value={settings.provider === 'ollama'}
                    onValueChange={v => settings.save({ provider: v ? 'ollama' : 'anthropic' })}
                    trackColor={{ false: C.border2, true: C.accent + '88' }}
                    thumbColor={settings.provider === 'ollama' ? C.accent : C.muted}
                  />
                </Row>
                {settings.provider === 'ollama' && (
                  <>
                    <Field label="Ollama URL" hint="Must be reachable from this device">
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
                    <Field label="Model name">
                      <TextInput
                        style={styles.input}
                        value={settings.model}
                        onChangeText={v => settings.save({ model: v })}
                        placeholder="llama3"
                        placeholderTextColor={C.muted}
                        autoCapitalize="none"
                      />
                    </Field>
                  </>
                )}
              </Section>
            </>
          )}

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
  aboutRow:      { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  aboutKey:      { fontSize: 12, color: C.muted, width: 60 },
  aboutVal:      { fontSize: 12, color: C.textDim, flex: 1, textAlign: 'right' },
})
