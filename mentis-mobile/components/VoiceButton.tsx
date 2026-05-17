import React, { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition'
import { C } from '../constants/theme'

interface Props {
  onTranscript: (text: string) => void
  disabled?:    boolean
}

export default function VoiceButton({ onTranscript, disabled }: Props) {
  const [listening, setListening] = useState(false)
  const pulse    = useRef(new Animated.Value(1)).current
  const loopRef  = useRef<Animated.CompositeAnimation | null>(null)

  // Pulse ring animation while mic is active
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

  useSpeechRecognitionEvent('result', (event) => {
    if (event.isFinal) {
      const transcript = event.results[event.results.length - 1]?.transcript ?? ''
      if (transcript.trim()) {
        onTranscript(transcript.trim())
        setListening(false)
      }
    }
  })
  useSpeechRecognitionEvent('end',   () => setListening(false))
  useSpeechRecognitionEvent('error', () => setListening(false))

  const toggle = async () => {
    if (disabled) return
    if (listening) {
      ExpoSpeechRecognitionModule.stop()
      setListening(false)
    } else {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
      if (!granted) return
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: false,
        continuous: false,
      })
      setListening(true)
    }
  }

  return (
    <TouchableOpacity style={styles.btn} onPress={toggle} disabled={disabled}>
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
