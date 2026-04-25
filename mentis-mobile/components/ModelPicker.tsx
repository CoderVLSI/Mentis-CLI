import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSettings } from '../store'
import { C } from '../constants/theme'

const CLAUDE_MODELS = [
  { id: 'claude-opus-4-7',          label: 'Opus 4.7',    hint: 'Most capable' },
  { id: 'claude-sonnet-4-6',        label: 'Sonnet 4.6',  hint: 'Balanced' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5',  hint: 'Fast & light' },
]

interface Props {
  visible:  boolean
  onClose:  () => void
}

export default function ModelPicker({ visible, onClose }: Props) {
  const settings = useSettings()

  const selectModel = (model: string, provider: 'anthropic' | 'ollama') => {
    settings.save({ model, provider })
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />

        {/* Provider toggle */}
        <View style={styles.providerRow}>
          {(['anthropic', 'ollama'] as const).map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.providerBtn, settings.provider === p && styles.providerActive]}
              onPress={() => settings.save({ provider: p })}
            >
              <Text style={[styles.providerText, settings.provider === p && styles.providerTextActive]}>
                {p === 'anthropic' ? '☁ Anthropic' : '⬡ Ollama'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionLabel}>
            {settings.provider === 'anthropic' ? 'Claude Models' : 'Ollama Models'}
          </Text>

          {settings.provider === 'anthropic'
            ? CLAUDE_MODELS.map(m => (
                <ModelRow
                  key={m.id}
                  id={m.id}
                  label={m.label}
                  hint={m.hint}
                  active={settings.model === m.id}
                  onSelect={() => selectModel(m.id, 'anthropic')}
                />
              ))
            : (
                <View style={styles.ollamaHint}>
                  <Text style={styles.ollamaHintText}>
                    Type your Ollama model name in Settings.{'\n'}
                    e.g. llama3, mistral, codellama
                  </Text>
                </View>
              )
          }
        </ScrollView>

        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  )
}

function ModelRow({ id, label, hint, active, onSelect }: {
  id: string; label: string; hint: string; active: boolean; onSelect: () => void
}) {
  return (
    <TouchableOpacity style={[styles.modelRow, active && styles.modelRowActive]} onPress={onSelect}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.modelLabel, active && styles.modelLabelActive]}>{label}</Text>
        <Text style={styles.modelHint}>{hint}</Text>
      </View>
      {active && <Text style={{ color: C.accent, fontSize: 16 }}>✓</Text>}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  backdrop:          { flex: 1, backgroundColor: '#000a' },
  sheet:             { backgroundColor: C.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 36, maxHeight: '70%' },
  handle:            { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border2, alignSelf: 'center', marginBottom: 16 },
  providerRow:       { flexDirection: 'row', gap: 8, marginBottom: 16 },
  providerBtn:       { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  providerActive:    { borderColor: C.accent + '66', backgroundColor: C.accent + '18' },
  providerText:      { fontSize: 13, color: C.muted, fontWeight: '500' },
  providerTextActive: { color: C.accentL, fontWeight: '600' },
  sectionLabel:      { fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  modelRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  modelRowActive:    { backgroundColor: C.accent + '15' },
  modelLabel:        { fontSize: 14, color: C.textDim, fontWeight: '500' },
  modelLabelActive:  { color: C.text },
  modelHint:         { fontSize: 11, color: C.muted, marginTop: 2 },
  ollamaHint:        { padding: 16, backgroundColor: C.panel2, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  ollamaHintText:    { fontSize: 13, color: C.muted, lineHeight: 20 },
  closeBtn:          { marginTop: 12, backgroundColor: C.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  closeBtnText:      { color: '#fff', fontSize: 15, fontWeight: '600' },
})
