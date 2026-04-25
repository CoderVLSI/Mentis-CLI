import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useSettings } from '../store'
import { C } from '../constants/theme'

export default function RootLayout() {
  const loadSettings = useSettings(s => s.load)

  useEffect(() => { loadSettings() }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" backgroundColor={C.bg} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />
    </GestureHandlerRootView>
  )
}
