import { StyleSheet, Text, View } from 'react-native'
import { Message } from '../store'
import { C } from '../constants/theme'

export default function ChatBubble({ message: m }: { message: Message }) {
  const isUser = m.role === 'user'
  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      {!isUser && <View style={styles.avatar}><Text style={styles.avatarText}>M</Text></View>}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.text, isUser && styles.textUser]}>{m.content}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row:              { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 },
  rowUser:          { justifyContent: 'flex-end' },
  avatar:           { width: 26, height: 26, borderRadius: 8, backgroundColor: C.accent + '33', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  avatarText:       { fontSize: 11, fontWeight: '700', color: C.accentL },
  bubble:           { maxWidth: '80%', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser:       { backgroundColor: C.accent, borderBottomRightRadius: 4 },
  bubbleAssistant:  { backgroundColor: C.panel2, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: C.border },
  text:             { fontSize: 14, color: C.text, lineHeight: 21 },
  textUser:         { color: '#fff' },
})
