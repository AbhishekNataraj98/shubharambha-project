import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { colors } from '@/lib/theme'

type AppHeaderProps = {
  initials: string
}

export function AppHeader({ initials }: AppHeaderProps) {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  return (
    <View
      style={{
        paddingTop: insets.top + 8,
        paddingBottom: 20,
        paddingHorizontal: 16,
        backgroundColor: colors.brand,
        borderBottomWidth: 0,
      }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View
            className="h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
          >
            <Text className="text-lg font-bold text-white">S</Text>
          </View>
          <Text className="text-lg font-bold text-white">Shubharambha</Text>
        </View>
        <Pressable
          onPress={() => router.push('/profile' as never)}
          className="h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          <Text className="text-sm font-bold text-white">{initials}</Text>
        </Pressable>
      </View>
    </View>
  )
}
