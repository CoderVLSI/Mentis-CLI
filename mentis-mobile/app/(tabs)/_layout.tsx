import { Tabs } from 'expo-router'
import { StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { C } from '../../constants/theme'

export default function TabLayout() {
  const insets = useSafeAreaInsets()

  return (
    <Tabs
      screenOptions={{
        headerShown:             false,
        tabBarActiveTintColor:   C.accent,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle:        styles.label,
        tabBarStyle: {
          backgroundColor: C.panel,
          borderTopColor:  C.border,
          borderTopWidth:  1,
          // Add system nav bar height so tab bar sits above it on Android edge-to-edge
          height:          56 + insets.bottom,
          paddingBottom:   insets.bottom + 4,
          paddingTop:      4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{
          title: 'History',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'time' : 'time-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'settings' : 'settings-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  label: {
    fontSize:   10,
    fontWeight: '500',
  },
})
