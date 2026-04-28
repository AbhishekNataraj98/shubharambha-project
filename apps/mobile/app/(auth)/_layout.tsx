import { Redirect, Stack, usePathname } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useSessionState } from '@/lib/auth-state'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function AuthLayout() {
  const pathname = usePathname()
  const { loading, user, profile } = useSessionState()

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#E8590C" />
        </View>
      </SafeAreaView>
    )
  }

  if (user && profile) return <Redirect href={'/(app)/(tabs)' as any} />
  if (user && !profile && pathname !== '/register') return <Redirect href={'/(auth)/register' as any} />

  return <Stack screenOptions={{ headerShown: false }} />
}
