import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { ToolEvent } from '../store'
import { C } from '../constants/theme'

interface Props {
  tool:      ToolEvent
  onApprove?: (id: string, approved: boolean) => void
}

const TOOL_ICONS: Record<string, string> = {
  read_file:    '📄',
  write_file:   '✏️',
  edit_file:    '🔧',
  bash:         '⚡',
  list_files:   '📁',
  search:       '🔍',
  web_search:   '🌐',
  default:      '🔩',
}

export default function ToolCard({ tool, onApprove }: Props) {
  const icon   = TOOL_ICONS[tool.name] ?? TOOL_ICONS.default
  const isDone = tool.status === 'done' || tool.status === 'approved' || tool.status === 'denied'

  const statusColor =
    tool.status === 'approved' ? C.green  :
    tool.status === 'denied'   ? C.red    :
    tool.status === 'done'     ? C.muted2 : C.yellow

  const statusLabel =
    tool.status === 'approved' ? '✓ approved' :
    tool.status === 'denied'   ? '✗ denied'   :
    tool.status === 'done'     ? '✓ done'      : '⏳ waiting'

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={styles.name}>{tool.name}</Text>
        <View style={[styles.statusBadge, { borderColor: statusColor + '55', backgroundColor: statusColor + '18' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Key args preview */}
      {tool.args && (
        <View style={styles.argsBox}>
          {Object.entries(tool.args).slice(0, 2).map(([k, v]) => (
            <Text key={k} style={styles.argLine} numberOfLines={1}>
              <Text style={styles.argKey}>{k}: </Text>
              <Text style={styles.argVal}>{String(v).slice(0, 80)}</Text>
            </Text>
          ))}
        </View>
      )}

      {/* Result preview */}
      {tool.result && isDone && (
        <Text style={styles.result} numberOfLines={2}>{tool.result.slice(0, 120)}</Text>
      )}

      {/* Approval buttons */}
      {tool.needsApproval && tool.status === 'pending' && onApprove && (
        <View style={styles.approvalRow}>
          <TouchableOpacity style={[styles.approvalBtn, styles.denyBtn]} onPress={() => onApprove(tool.id, false)}>
            <Text style={[styles.approvalText, { color: C.red }]}>Deny</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.approvalBtn, styles.allowBtn]} onPress={() => onApprove(tool.id, true)}>
            <Text style={[styles.approvalText, { color: C.green }]}>Allow</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card:        { marginHorizontal: 12, marginBottom: 8, backgroundColor: C.panel2, borderWidth: 1, borderColor: C.border2, borderRadius: 10, padding: 10 },
  header:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon:        { fontSize: 14 },
  name:        { flex: 1, fontSize: 12, fontFamily: 'Courier New', color: C.textDim, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  statusText:  { fontSize: 10, fontWeight: '600' },
  argsBox:     { marginTop: 6, gap: 2 },
  argLine:     { fontSize: 11 },
  argKey:      { color: C.muted2, fontFamily: 'Courier New' },
  argVal:      { color: C.textDim, fontFamily: 'Courier New' },
  result:      { marginTop: 6, fontSize: 11, color: C.muted, fontFamily: 'Courier New', lineHeight: 16 },
  approvalRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  approvalBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  denyBtn:     { borderColor: C.red  + '55', backgroundColor: C.red  + '18' },
  allowBtn:    { borderColor: C.green + '55', backgroundColor: C.green + '18' },
  approvalText: { fontSize: 13, fontWeight: '600' },
})
