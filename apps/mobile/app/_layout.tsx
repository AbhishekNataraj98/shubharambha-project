import { useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { View, ActivityIndicator } from 'react-native'

export default function RootLayout() {
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    let mounted = true
    // Wait for auth hydration once; group layouts handle redirects.
    void supabase.auth.getSession().finally(() => {
      if (mounted) setInitialized(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // no-op: individual route-group layouts decide navigation
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  if (!initialized) {
    return (
      <View style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFF8F5',
      }}>
        <ActivityIndicator size="large" color="#D85A30" />
      </View>
    )
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  )
}
