import { useRef, useState } from 'react'
import {
  StyleSheet, Text, TextInput,
  TouchableOpacity, View, Platform,
} from 'react-native'
import { C } from '../constants/theme'

interface Props {
  onSend:    (text: string) => void
  onCancel:  () => void
  streaming: boolean
}

export default function ChatInput({ onSend, onCancel, streaming }: Props) {
  const [text, setText]  = useState('')
  const inputRef         = useRef<TextInput>(null)

  const submit = () => {
    const t = text.trim()
    if (!t || streaming) return
    onSend(t)
    setText('')
  }

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Ask anything…"
          placeholderTextColor={C.muted}
          multiline
          maxLength={4000}
          returnKeyType={Platform.OS === 'ios' ? 'send' : 'default'}
          onSubmitEditing={Platform.OS === 'ios' ? submit : undefined}
          blurOnSubmit={false}
          editable={!streaming}
        />

        {streaming ? (
          <TouchableOpacity style={[styles.btn, styles.stopBtn]} onPress={onCancel}>
            <View style={styles.stopIcon} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.btn, styles.sendBtn, !text.trim() && styles.btnDisabled]}
            onPress={submit}
            disabled={!text.trim()}
          >
            <Text style={styles.sendArrow}>↑</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.hint}>
        {streaming ? 'Generating…  tap ■ to stop' : 'Shift+Enter for new line'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container:  { borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.panel, paddingHorizontal: 12, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 20 : 12 },
  inputRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input:      { flex: 1, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.border2, borderRadius: 14, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, color: C.text, fontSize: 14, maxHeight: 140, lineHeight: 20 },
  btn:        { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
  sendBtn:    { backgroundColor: C.accent },
  stopBtn:    { backgroundColor: C.red + 'cc' },
  btnDisabled: { opacity: 0.35 },
  sendArrow:  { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 20 },
  stopIcon:   { width: 12, height: 12, borderRadius: 2, backgroundColor: '#fff' },
  hint:       { fontSize: 10, color: C.muted, textAlign: 'center', marginTop: 6 },
})
