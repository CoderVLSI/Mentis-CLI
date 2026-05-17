import { useCallback, useEffect, useRef, useState } from 'react'
import * as Speech from 'expo-speech'
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition'

const SENTENCE_RE = /[^.!?\n]+[.!?\n]+/g

function extractSentences(buf: string): { sentences: string[]; remaining: string } {
  const matches = buf.match(SENTENCE_RE) ?? []
  const consumed = matches.join('')
  return {
    sentences: matches.map(s => s.trim()).filter(Boolean),
    remaining: buf.slice(consumed.length),
  }
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, 'code block.')
    .replace(/`[^`\n]+`/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6} /g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[-*+] /gm, '')
    .replace(/^\d+\. /gm, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .trim()
}

interface UseVoiceOptions {
  onTranscript: (text: string) => void
}

export function useVoice({ onTranscript }: UseVoiceOptions) {
  const [voiceMode, setVoiceMode] = useState(false)
  const [speaking, setSpeaking]   = useState(false)
  const [listening, setListening] = useState(false)

  const voiceModeRef    = useRef(false)
  const isSpeakingRef   = useRef(false)
  const streamDoneRef   = useRef(false)
  const queueRef        = useRef<string[]>([])
  const sentenceBufRef  = useRef('')
  const onTranscriptRef = useRef(onTranscript)

  useEffect(() => { onTranscriptRef.current = onTranscript }, [onTranscript])

  // Reassigned every render so closures inside always see latest state/fns
  const flushRef = useRef<() => void>(() => {})

  const enqueue = (sentence: string) => {
    queueRef.current.push(sentence)
    if (!isSpeakingRef.current) flushRef.current()
  }

  const stopAll = useCallback(() => {
    Speech.stop()
    queueRef.current      = []
    isSpeakingRef.current = false
    setSpeaking(false)
  }, [])

  // autoStartMic only uses refs/imports, safe to call from stale closures
  const autoStartMic = async () => {
    if (!voiceModeRef.current) return
    try {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
      if (!granted || !voiceModeRef.current) return
      ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: false, continuous: false })
      setListening(true)
    } catch { /* ignore */ }
  }

  flushRef.current = () => {
    if (queueRef.current.length === 0) {
      isSpeakingRef.current = false
      setSpeaking(false)
      if (streamDoneRef.current && voiceModeRef.current) {
        streamDoneRef.current = false
        setTimeout(autoStartMic, 400)
      }
      return
    }
    const sentence = queueRef.current.shift()!
    isSpeakingRef.current = true
    setSpeaking(true)
    Speech.speak(stripMarkdown(sentence), {
      language: 'en-US',
      rate: 1.05,
      onDone:    () => flushRef.current(),
      onError:   () => flushRef.current(),
      onStopped: () => { /* barge-in stopped it — don't continue queue */ },
    })
  }

  const toggleVoice = useCallback(() => {
    const next = !voiceModeRef.current
    voiceModeRef.current = next
    setVoiceMode(next)
    if (!next) {
      stopAll()
      streamDoneRef.current  = false
      sentenceBufRef.current = ''
      try { ExpoSpeechRecognitionModule.stop() } catch { /* ignore */ }
      setListening(false)
    }
  }, [stopAll])

  const onStreamChunk = useCallback((chunk: string) => {
    if (!voiceModeRef.current) return
    sentenceBufRef.current += chunk
    const { sentences, remaining } = extractSentences(sentenceBufRef.current)
    sentenceBufRef.current = remaining
    sentences.forEach(enqueue)
  }, [])

  const onStreamDone = useCallback(() => {
    if (!voiceModeRef.current) return
    if (sentenceBufRef.current.trim()) {
      enqueue(sentenceBufRef.current.trim())
      sentenceBufRef.current = ''
    }
    if (queueRef.current.length === 0 && !isSpeakingRef.current) {
      setTimeout(autoStartMic, 400)
    } else {
      streamDoneRef.current = true
    }
  }, [])

  const onMicPress = useCallback(async () => {
    if (listening) {
      try { ExpoSpeechRecognitionModule.stop() } catch { /* ignore */ }
      setListening(false)
    } else {
      stopAll()
      streamDoneRef.current = false
      await autoStartMic()
    }
  }, [listening, stopAll])

  useSpeechRecognitionEvent('result', (event) => {
    if (event.isFinal) {
      const transcript = event.results[event.results.length - 1]?.transcript ?? ''
      setListening(false)
      if (transcript.trim()) {
        stopAll()
        streamDoneRef.current  = false
        sentenceBufRef.current = ''
        onTranscriptRef.current(transcript.trim())
      }
    }
  })
  useSpeechRecognitionEvent('end',   () => setListening(false))
  useSpeechRecognitionEvent('error', () => setListening(false))

  return {
    voiceMode,
    toggleVoice,
    speaking,
    stopSpeaking: stopAll,
    listening,
    onMicPress,
    onStreamChunk,
    onStreamDone,
  }
}
