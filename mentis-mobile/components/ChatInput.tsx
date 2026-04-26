import { useRef, useState } from 'react'
import {
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native'
import { C } from '../constants/theme'

const SLASH_COMMANDS = [
  { cmd: '/plan',   desc: 'Switch to PLAN mode'   },
  { cmd: '/build',  desc: 'Switch to BUILD mode'  },
  { cmd: '/clear',  desc: 'Clear chat history'    },
  { cmd: '/status', desc: 'Show session info'     },
]

interface Props {
  onSend:       (text: string) => void
  onCancel:     () => void
  streaming:    boolean
  githubRepo?:  string    // connected repo — shown as chip
  onRepoPick?:  () => void  // opens repo picker sheet
}

export default function ChatInput({ onSend, onCancel, streaming, githubRepo, onRepoPick }: Props) {
  const [text, setText]       = useState('')
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

      {/* Repo chips row — shown whenever GitHub is configured */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContent}
      >
        {/* + button always shown */}
        <TouchableOpacity style={styles.addBtn} onPress={onRepoPick}>
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>

        {/* Connected repo chip */}
        {githubRepo ? (
          <TouchableOpacity style={styles.repoChip} onPress={onRepoPick}>
            <Text style={styles.repoChipIcon}>⬡</Text>
            <Text style={styles.repoChipText} numberOfLines={1}>
              {githubRepo}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.noRepoChip} onPress={onRepoPick}>
            <Text style={styles.noRepoText}>Connect GitHub repo</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Text input row */}
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={handleChange}
          placeholder="Describe what you want to build…"
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

  chipsScroll:    { flexGrow: 0 },
  chipsContent:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },

  addBtn:         { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: C.border2, alignItems: 'center', justifyContent: 'center', backgroundColor: C.panel2 },
  addBtnText:     { fontSize: 18, color: C.muted2, lineHeight: 22, fontWeight: '300' },

  repoChip:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: C.accent + '44', backgroundColor: C.accent + '14' },
  repoChipIcon:   { fontSize: 11, color: C.accentL },
  repoChipText:   { fontSize: 12, color: C.accentL, fontFamily: 'Courier New', maxWidth: 220 },

  noRepoChip:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: C.border2, borderStyle: 'dashed' },
  noRepoText:     { fontSize: 12, color: C.muted },

  inputRow:       { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 10 },
  input:          { flex: 1, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.border2, borderRadius: 14, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, color: C.text, fontSize: 14, maxHeight: 120, lineHeight: 20 },
  btn:            { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
  sendBtn:        { backgroundColor: C.accent },
  stopBtn:        { backgroundColor: C.red + 'cc' },
  btnDisabled:    { opacity: 0.3 },
  sendArrow:      { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 22 },
  stopIcon:       { width: 12, height: 12, borderRadius: 2, backgroundColor: '#fff' },
})
