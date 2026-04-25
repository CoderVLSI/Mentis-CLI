import { StyleSheet, Text, View, TouchableOpacity } from 'react-native'
import Markdown from 'react-native-markdown-display'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { Message } from '../store'
import { C } from '../constants/theme'

interface Props { message: Message; isStreaming?: boolean }

export default function ChatBubble({ message: m, isStreaming }: Props) {
  const isUser = m.role === 'user'

  const copyContent = async () => {
    await Clipboard.setStringAsync(m.content)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  }

  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>M</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}
        onLongPress={copyContent}
        activeOpacity={0.85}
      >
        {isUser ? (
          <Text style={styles.userText}>{m.content}</Text>
        ) : (
          <>
            <Markdown style={markdownStyles}>{m.content || ' '}</Markdown>
            {isStreaming && (
              <View style={styles.cursor} />
            )}
          </>
        )}
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  row:             { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 14, paddingHorizontal: 12 },
  rowUser:         { justifyContent: 'flex-end' },
  avatar:          { width: 26, height: 26, borderRadius: 8, backgroundColor: C.accent + '33', alignItems: 'center', justifyContent: 'center', marginBottom: 2, flexShrink: 0 },
  avatarText:      { fontSize: 11, fontWeight: '700', color: C.accentL },
  bubble:          { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser:      { backgroundColor: C.accent, borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: C.panel2, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: C.border },
  userText:        { fontSize: 14, color: '#fff', lineHeight: 21 },
  cursor:          { width: 8, height: 15, backgroundColor: C.accent, borderRadius: 2, marginTop: 2 },
})

const markdownStyles = StyleSheet.create({
  body:           { color: C.text, fontSize: 14, lineHeight: 22 },
  heading1:       { color: C.text, fontSize: 18, fontWeight: '700', marginVertical: 8 },
  heading2:       { color: C.text, fontSize: 16, fontWeight: '600', marginVertical: 6 },
  heading3:       { color: C.text, fontSize: 15, fontWeight: '600', marginVertical: 4 },
  paragraph:      { color: C.text, fontSize: 14, lineHeight: 22, marginVertical: 3 },
  strong:         { color: '#f0f0f0', fontWeight: '700' },
  em:             { color: C.accentL, fontStyle: 'italic' },
  link:           { color: C.accentL },
  blockquote:     { borderLeftWidth: 3, borderLeftColor: C.border2, paddingLeft: 10, opacity: 0.8 },
  code_inline:    { backgroundColor: '#1a1a1a', color: C.accentL, fontFamily: 'Courier New', fontSize: 12, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  fence:          { backgroundColor: '#111', borderWidth: 1, borderColor: C.border2, borderRadius: 8, padding: 12, marginVertical: 6 },
  code_block:     { backgroundColor: '#111', fontFamily: 'Courier New', fontSize: 12, color: '#e8e8e8' },
  bullet_list:    { marginVertical: 3 },
  ordered_list:   { marginVertical: 3 },
  list_item:      { flexDirection: 'row', marginVertical: 2 },
  bullet_list_icon: { color: C.muted2, marginRight: 6, marginTop: 3 },
  hr:             { borderBottomColor: C.border, borderBottomWidth: 1, marginVertical: 10 },
  table:          { borderWidth: 1, borderColor: C.border, marginVertical: 6 },
  th:             { backgroundColor: C.panel2, padding: 8, color: C.text, fontWeight: '600' },
  td:             { padding: 8, color: C.textDim, borderTopWidth: 1, borderTopColor: C.border },
})
