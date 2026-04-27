import { useRef, useState } from 'react'
import {
  Alert, Image, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { C } from '../constants/theme'

export interface ImageAttachment {
  base64:    string
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  name:      string
  uri:       string   // local URI for preview
}

const SLASH_COMMANDS = [
  { cmd: '/plan',   desc: 'Switch to PLAN mode'   },
  { cmd: '/build',  desc: 'Switch to BUILD mode'  },
  { cmd: '/clear',  desc: 'Clear chat history'    },
  { cmd: '/status', desc: 'Show session info'     },
]

interface Props {
  onSend:       (text: string, images?: ImageAttachment[]) => void
  onCancel:     () => void
  streaming:    boolean
  githubRepo?:  string
  onRepoPick?:  () => void
}

export default function ChatInput({ onSend, onCancel, streaming, githubRepo, onRepoPick }: Props) {
  const [text, setText]               = useState('')
  const [suggestions, setSuggestions] = useState<typeof SLASH_COMMANDS>([])
  const [attachments, setAttachments] = useState<ImageAttachment[]>([])
  const inputRef = useRef<TextInput>(null)

  const handleChange = (val: string) => {
    setText(val)
    if (val.startsWith('/')) {
      setSuggestions(SLASH_COMMANDS.filter(c => c.cmd.startsWith(val.toLowerCase())))
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
    if (!t && attachments.length === 0) return
    if (streaming) return
    setText('')
    setSuggestions([])
    const imgs = attachments.length ? [...attachments] : undefined
    setAttachments([])
    onSend(t || '(see attached image)', imgs)
  }

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to attach images.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.85,
      base64: true,
      exif: false,
    })
    if (result.canceled) return
    const newAttachments: ImageAttachment[] = result.assets
      .filter(a => a.base64)
      .map(a => {
        const ext = (a.fileName ?? a.uri).split('.').pop()?.toLowerCase() ?? 'jpg'
        const typeMap: Record<string, ImageAttachment['mediaType']> = {
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
          gif: 'image/gif',  webp: 'image/webp',
        }
        return {
          base64:    a.base64!,
          mediaType: typeMap[ext] ?? 'image/jpeg',
          name:      a.fileName ?? `image_${Date.now()}.jpg`,
          uri:       a.uri,
        }
      })
    setAttachments(prev => [...prev, ...newAttachments])
    inputRef.current?.focus()
  }

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx))
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

      {/* Image preview strip */}
      {attachments.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.previewScroll}
          contentContainerStyle={styles.previewContent}
        >
          {attachments.map((att, i) => (
            <View key={i} style={styles.previewItem}>
              <Image source={{ uri: att.uri }} style={styles.previewImg} resizeMode="cover" />
              <TouchableOpacity style={styles.previewRemove} onPress={() => removeAttachment(i)}>
                <Text style={styles.previewRemoveTxt}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.previewName} numberOfLines={1}>{att.name}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Repo chips row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContent}
      >
        <TouchableOpacity style={styles.addBtn} onPress={onRepoPick}>
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>

        {githubRepo ? (
          <TouchableOpacity style={styles.repoChip} onPress={onRepoPick}>
            <Text style={styles.repoChipIcon}>⬡</Text>
            <Text style={styles.repoChipText} numberOfLines={1}>{githubRepo}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.noRepoChip} onPress={onRepoPick}>
            <Text style={styles.noRepoText}>Connect GitHub repo</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Text input row */}
      <View style={styles.inputRow}>
        {/* Image attach button */}
        <TouchableOpacity
          style={[styles.attachBtn, attachments.length > 0 && styles.attachBtnActive]}
          onPress={pickImage}
          disabled={streaming}
        >
          <Text style={styles.attachIcon}>🖼</Text>
          {attachments.length > 0 && (
            <View style={styles.attachBadge}>
              <Text style={styles.attachBadgeTxt}>{attachments.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={handleChange}
          placeholder={attachments.length ? 'Add a message… or just send the image' : 'Describe what you want to build…'}
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
            style={[styles.btn, styles.sendBtn, (!text.trim() && attachments.length === 0) && styles.btnDisabled]}
            onPress={submit}
            disabled={!text.trim() && attachments.length === 0}
          >
            <Text style={styles.sendArrow}>↑</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper:          { borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.panel },

  suggestions:      { borderBottomWidth: 1, borderBottomColor: C.border },
  suggestionRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  suggestionCmd:    { fontFamily: 'Courier New', fontSize: 13, color: C.accentL, width: 70 },
  suggestionDesc:   { fontSize: 12, color: C.muted2 },

  previewScroll:    { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: C.border },
  previewContent:   { flexDirection: 'row', padding: 10, gap: 8 },
  previewItem:      { width: 72, position: 'relative' },
  previewImg:       { width: 72, height: 72, borderRadius: 8, borderWidth: 1, borderColor: C.border2 },
  previewRemove:    { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center' },
  previewRemoveTxt: { fontSize: 9, color: '#fff', fontWeight: '700' },
  previewName:      { fontSize: 9, color: C.muted, marginTop: 3, textAlign: 'center' },

  chipsScroll:      { flexGrow: 0 },
  chipsContent:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },

  addBtn:           { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: C.border2, alignItems: 'center', justifyContent: 'center', backgroundColor: C.panel2 },
  addBtnText:       { fontSize: 18, color: C.muted2, lineHeight: 22, fontWeight: '300' },

  repoChip:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: C.accent + '44', backgroundColor: C.accent + '14' },
  repoChipIcon:     { fontSize: 11, color: C.accentL },
  repoChipText:     { fontSize: 12, color: C.accentL, fontFamily: 'Courier New', maxWidth: 220 },

  noRepoChip:       { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: C.border2, borderStyle: 'dashed' },
  noRepoText:       { fontSize: 12, color: C.muted },

  inputRow:         { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 10, paddingTop: 4, paddingBottom: 10 },

  attachBtn:        { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 1, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.border2 },
  attachBtnActive:  { borderColor: C.accent + '66', backgroundColor: C.accent + '18' },
  attachIcon:       { fontSize: 16 },
  attachBadge:      { position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: 7, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  attachBadgeTxt:   { fontSize: 8, color: '#fff', fontWeight: '700' },

  input:            { flex: 1, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.border2, borderRadius: 14, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, color: C.text, fontSize: 14, maxHeight: 120, lineHeight: 20 },
  btn:              { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
  sendBtn:          { backgroundColor: C.accent },
  stopBtn:          { backgroundColor: C.red + 'cc' },
  btnDisabled:      { opacity: 0.3 },
  sendArrow:        { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 22 },
  stopIcon:         { width: 12, height: 12, borderRadius: 2, backgroundColor: '#fff' },
})
