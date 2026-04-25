import { Tabs } from 'expo-router'
import { View, StyleSheet } from 'react-native'
import { C } from '../../constants/theme'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown:       false,
        tabBarStyle:       styles.tabBar,
        tabBarActiveTintColor:   C.accent,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle:  styles.label,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title:    'Chat',
          tabBarIcon: ({ color }) => <TabIcon color={color} path="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{
          title:    'History',
          tabBarIcon: ({ color }) => <TabIcon color={color} path="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8" />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title:    'Settings',
          tabBarIcon: ({ color }) => <TabIcon color={color} path="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />,
        }}
      />
    </Tabs>
  )
}

// Minimal SVG-path icon using React Native View shapes
function TabIcon({ color, path }: { color: string; path: string }) {
  // placeholder icon box — swap for @expo/vector-icons if desired
  return (
    <View style={[styles.iconBox, { borderColor: color, opacity: color === C.accent ? 1 : 0.5 }]} />
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor:  C.panel,
    borderTopColor:   C.border,
    borderTopWidth:   1,
    height:           56,
    paddingBottom:    6,
  },
  label: {
    fontSize:     10,
    fontWeight:   '500',
  },
  iconBox: {
    width:        18,
    height:       18,
    borderRadius: 3,
    borderWidth:  1.5,
  },
})
