import { useRef, useState } from 'react'
import {
  FlatList, Keyboard, Platform, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { C } from '../constants/theme'

const SLASH_COMMANDS = [
  { cmd: '/plan',   desc: 'Switch to PLAN mode'   },
  { cmd: '/build',  desc: 'Switch to BUILD mode'  },
  { cmd: '/clear',  desc: 'Clear chat history'     },
  { cmd: '/status', desc: 'Show session info'      },
  { cmd: '/help',   desc: 'List commands'          },
]

interface Props {
  onSend:    (text: string) => void
  onCancel:  () => void
  streaming: boolean
}

export default function ChatInput({ onSend, onCancel, streaming }: Props) {
  const [text, setText]         = useState('')
  const [suggestions, setSuggestions] = useState<typeof SLASH_COMMANDS>([])
  const inputRef = useRef<TextInput>(null)

  const handleChange = (val: string) => {
    setText(val)
    if (val.startsWith('/')) {
      const filtered = SLASH_COMMANDS.filter(c => c.cmd.startsWith(val.toLowerCase()))
      setSuggestions(filtered)
    } else {
      setSuggestions([])
    }
  }

  const acceptSuggestion = (cmd: string) => {
    setText(cmd + ' ')
    setSuggestions([])
    inputRef.current?.focus()
  }

  const submit = () => {
    const t = text.trim()
    if (!t || streaming) return
    setText('')
    setSuggestions([])
    Keyboard.dismiss()
    onSend(t)
  }

  return (
    <View style={styles.wrapper}>
      {/* Slash command suggestions */}
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map(s => (
            <TouchableOpacity
              key={s.cmd}
              style={styles.suggestionRow}
              onPress={() => acceptSuggestion(s.cmd)}
            >
              <Text style={styles.suggestionCmd}>{s.cmd}</Text>
              <Text style={styles.suggestionDesc}>{s.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.container}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={handleChange}
          placeholder="Ask anything…  (/ for commands)"
          placeholderTextColor={C.muted}
          multiline
          maxLength={4000}
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
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper:        { borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.panel },
  suggestions:    { borderBottomWidth: 1, borderBottomColor: C.border },
  suggestionRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  suggestionCmd:  { fontFamily: 'Courier New', fontSize: 13, color: C.accentL, width: 70 },
  suggestionDesc: { fontSize: 12, color: C.muted2 },
  container:      { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 24 : 12 },
  input:          { flex: 1, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.border2, borderRadius: 14, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, color: C.text, fontSize: 14, maxHeight: 140, lineHeight: 20 },
  btn:            { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
  sendBtn:        { backgroundColor: C.accent },
  stopBtn:        { backgroundColor: C.red + 'cc' },
  btnDisabled:    { opacity: 0.3 },
  sendArrow:      { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 22 },
  stopIcon:       { width: 12, height: 12, borderRadius: 2, backgroundColor: '#fff' },
})
