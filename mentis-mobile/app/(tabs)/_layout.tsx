import { Tabs } from 'expo-router'
import { StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { C } from '../../constants/theme'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown:             false,
        tabBarStyle:             styles.tabBar,
        tabBarActiveTintColor:   C.accent,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle:        styles.label,
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
  tabBar: {
    backgroundColor: C.panel,
    borderTopColor:  C.border,
    borderTopWidth:  1,
    height:          56,
    paddingBottom:   6,
  },
  label: {
    fontSize:   10,
    fontWeight: '500',
  },
})
