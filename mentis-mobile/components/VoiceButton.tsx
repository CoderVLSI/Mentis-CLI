import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { C } from '../constants/theme'

interface Props {
  listening: boolean
  onPress:   () => void
  disabled?: boolean
}

export default function VoiceButton({ listening, onPress, disabled }: Props) {
  const pulse   = useRef(new Animated.Value(1)).current
  const loopRef = useRef<Animated.CompositeAnimation | null>(null)

  useEffect(() => {
    if (listening) {
      loopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.55, duration: 650, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1,    duration: 650, useNativeDriver: true }),
        ])
      )
      loopRef.current.start()
    } else {
      loopRef.current?.stop()
      pulse.setValue(1)
    }
  }, [listening])

  return (
    <TouchableOpacity style={styles.btn} onPress={onPress} disabled={disabled}>
      {listening && (
        <Animated.View style={[styles.ring, { transform: [{ scale: pulse }] }]} />
      )}
      <Ionicons
        name={listening ? 'mic' : 'mic-outline'}
        size={18}
        color={listening ? '#ef4444' : C.muted2}
      />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  btn:  { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 38, height: 38, borderRadius: 19, backgroundColor: '#ef444428' },
})
