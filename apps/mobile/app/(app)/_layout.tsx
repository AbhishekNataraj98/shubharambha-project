import { Redirect, Stack, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useSessionState } from '@/lib/auth-state'
import { apiPost, apiPostMarkAllNotificationsRead } from '@/lib/api'
import { getMobileNotificationTarget } from '@/lib/notificationTarget'
import { supabase } from '@/lib/supabase'
import Logo from '@/components/shared/Logo'
import { SafeAreaView } from 'react-native-safe-area-context'

function emojiForType(type: string): string {
  if (type === 'payment_pending') return '💰'
  if (type === 'payment_confirmed') return '✅'
  if (type === 'payment_declined') return '❌'
  if (type === 'project_invite') return '🏗'
  if (type === 'update_posted' || type === 'update_liked' || type === 'update_commented' || type === 'update_replied') return '📷'
  return '🔔'
}

export default function AppLayout() {
  const router = useRouter()
  const { loading, user, profile } = useSessionState()
  const [unreadCount, setUnreadCount] = useState(0)
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false)
  const [recentNotifications, setRecentNotifications] = useState<
    Array<{
      id: string
      title: string
      body: string
      type: string
      is_read: boolean
      project_id: string | null
      payment_id: string | null
      update_id: string | null
      created_at: string
    }>
  >([])
  const channelSuffixRef = useRef(Math.random().toString(36).slice(2))

  const loadUnreadCount = useCallback(async () => {
    if (!user?.id) {
      setUnreadCount(0)
      return
    }
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
    setUnreadCount(count ?? 0)
  }, [user?.id])

  const loadRecentNotifications = useCallback(async () => {
    if (!user?.id) {
      setRecentNotifications([])
      return
    }
    const { data } = await supabase
      .from('notifications')
      .select('id,title,body,type,is_read,project_id,payment_id,update_id,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)
    setRecentNotifications((data ?? []) as typeof recentNotifications)
  }, [user?.id])

  useEffect(() => {
    void loadUnreadCount()
    void loadRecentNotifications()
  }, [loadRecentNotifications, loadUnreadCount])

  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`header-notifications-${user.id}-${channelSuffixRef.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => {
          void loadUnreadCount()
          void loadRecentNotifications()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadRecentNotifications, loadUnreadCount, user?.id])

  const relativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  const onOpenNotificationItem = async (item: (typeof recentNotifications)[number]) => {
    try {
      if (!item.is_read) {
        await apiPost<{ success?: boolean }>('/api/notifications/mark-read', { notification_id: item.id })
        setUnreadCount((prev) => Math.max(0, prev - 1))
        setRecentNotifications((prev) =>
          prev.map((row) => (row.id === item.id ? { ...row, is_read: true } : row))
        )
      }
    } catch {
      // Navigate even if mark-read fails.
    }
    setNotificationMenuOpen(false)
    const target = getMobileNotificationTarget(item)
    if (target.kind === 'profile-invitations') {
      router.push({ pathname: '/(app)/(tabs)/profile', params: { section: 'invitations' } })
      return
    }
    if (target.kind !== 'project') return
    router.push({
      pathname: '/projects/[id]',
      params: { id: target.id, tab: target.tab, paymentId: target.paymentId, updateId: target.updateId },
    })
  }

  const markAllRead = async () => {
    try {
      await apiPostMarkAllNotificationsRead()
      setUnreadCount(0)
      setRecentNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })))
    } catch {
      // Keep menu functional even if mark-all-read fails.
    }
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#D85A30" />
        </View>
      </SafeAreaView>
    )
  }

  if (!user) return <Redirect href={'/(auth)/login' as any} />
  if (!profile) return <Redirect href={'/(auth)/register' as any} />
  return (
    <>
      <Stack
        screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#2C2C2A' },
        headerShadowVisible: false,
        headerTitleAlign: 'left',
        headerLeftContainerStyle: {
          paddingLeft: 6,
        },
        headerLeft: () => (
          <Pressable
            onPress={() => router.push('/(app)/(tabs)/profile')}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.14)',
            }}
            hitSlop={8}
            accessibilityLabel="Profile"
            android_ripple={{ color: 'rgba(255,255,255,0.12)', borderless: true }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 20, backgroundColor: 'transparent' }}>👤</Text>
          </Pressable>
        ),
        headerTitle: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                backgroundColor: 'rgba(255,255,255,0.22)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Logo size={16} color="white" />
            </View>
            <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '800' }}>Shubharambha</Text>
          </View>
        ),
        headerTintColor: '#FFFFFF',
        headerRightContainerStyle: {
          paddingRight: 6,
        },
        headerRight: () => (
          <>
            <Pressable
              onPress={() => setNotificationMenuOpen((prev) => !prev)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255,255,255,0.14)',
              }}
              hitSlop={8}
              accessibilityLabel="Notifications"
              android_ripple={{ color: 'rgba(255,255,255,0.12)', borderless: false }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 19, backgroundColor: 'transparent' }}>🔔</Text>
              {unreadCount > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    minWidth: 16,
                    height: 16,
                    paddingHorizontal: 4,
                    borderRadius: 8,
                    backgroundColor: '#DC2626',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </>
        ),
        }}
      />
      <Modal
        visible={notificationMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNotificationMenuOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)' }}
          onPress={() => setNotificationMenuOpen(false)}
        >
          <View
            style={{
              marginTop: 86,
              marginRight: 10,
              marginLeft: 46,
              borderRadius: 14,
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: '#E5E7EB',
              maxHeight: 420,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: '#F2EDE8',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ fontWeight: '700', color: '#111827' }}>Notifications</Text>
              <TouchableOpacity onPress={() => void markAllRead()} style={{ minHeight: 32, justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#D85A30' }}>Mark all read</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={{ maxHeight: 320 }}
              contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 10 }}
            >
              {recentNotifications.length === 0 ? (
                <Text style={{ color: '#6B7280', fontSize: 13, paddingVertical: 16, textAlign: 'center' }}>
                  No notifications yet
                </Text>
              ) : (
                recentNotifications.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => void onOpenNotificationItem(item)}
                    style={{
                      marginBottom: 10,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: item.is_read ? '#F2EDE8' : '#FED7AA',
                      borderLeftWidth: item.is_read ? 1 : 4,
                      borderLeftColor: item.is_read ? '#F2EDE8' : '#D85A30',
                      backgroundColor: item.is_read ? '#FFFFFF' : '#FBF0EB',
                      padding: 12,
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          backgroundColor: '#F2EDE8',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 20 }}>{emojiForType(item.type)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>{item.title}</Text>
                        <Text style={{ marginTop: 4, fontSize: 13, color: '#6B7280' }} numberOfLines={2}>
                          {item.body}
                        </Text>
                        <Text style={{ marginTop: 6, fontSize: 11, color: '#9CA3AF' }}>{relativeTime(item.created_at)}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <View style={{ borderTopWidth: 1, borderTopColor: '#F2EDE8', paddingHorizontal: 12, paddingVertical: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  setNotificationMenuOpen(false)
                  router.push('/(app)/notifications')
                }}
                style={{ minHeight: 40, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#D85A30', fontWeight: '700' }}>See more</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  )
}
