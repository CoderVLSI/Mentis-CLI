import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { C } from '../constants/theme'

export default function ThinkingDot() {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current]

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay((2 - i) * 150),
        ])
      )
    )
    anims.forEach(a => a.start())
    return () => anims.forEach(a => a.stop())
  }, [])

  return (
    <View style={styles.row}>
      <View style={styles.avatar}/>
      <View style={styles.bubble}>
        {dots.map((dot, i) => (
          <Animated.View key={i} style={[styles.dot, { opacity: dot }]} />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12, paddingHorizontal: 0 },
  avatar: { width: 26, height: 26, borderRadius: 8, backgroundColor: C.accent + '33' },
  bubble: { flexDirection: 'row', gap: 5, backgroundColor: C.panel2, borderRadius: 14, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 14 },
  dot:    { width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent },
})
