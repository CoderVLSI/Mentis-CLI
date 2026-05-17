import * as Speech from 'expo-speech'

// Strip markdown so the TTS engine doesn't read raw syntax out loud
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

export function speak(text: string, onDone?: () => void): void {
  Speech.stop()
  const plain = stripMarkdown(text)
  if (!plain) { onDone?.(); return }
  Speech.speak(plain, {
    language: 'en-US',
    pitch: 1.0,
    rate: 1.05,
    onDone,
    onStopped: onDone,
    onError: onDone,
  })
}

export const stopSpeaking = (): void => { Speech.stop() }
export const isSpeaking   = (): Promise<boolean> => Speech.isSpeakingAsync()
