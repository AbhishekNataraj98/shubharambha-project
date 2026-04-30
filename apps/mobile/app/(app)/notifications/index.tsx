import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { apiPost, apiPostMarkAllNotificationsRead } from '@/lib/api'
import { getMobileNotificationTarget } from '@/lib/notificationTarget'
import { notificationGroupLabel, relativeTime } from '@/lib/utils'
import { useSessionState } from '@/lib/auth-state'
import { SafeAreaView } from 'react-native-safe-area-context'

type NotificationRow = {
  id: string
  title: string
  body: string
  type: string
  is_read: boolean
  project_id: string | null
  payment_id: string | null
  update_id: string | null
  created_at: string
}

function emojiForType(type: string): string {
  if (type === 'payment_pending') return '💰'
  if (type === 'payment_confirmed') return '✅'
  if (type === 'payment_declined') return '❌'
  if (type === 'project_invite') return '🏗'
  if (type === 'update_posted' || type === 'update_liked' || type === 'update_commented' || type === 'update_replied') return '📷'
  return '🔔'
}

export default function NotificationsScreen() {
  const router = useRouter()
  const { user, loading: authLoading } = useSessionState()
  const channelSuffixRef = useRef(Math.random().toString(36).slice(2))
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    const { data, error } = await supabase
      .from('notifications')
      .select('id,title,body,type,is_read,project_id,payment_id,update_id,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) Alert.alert('Notifications', error.message)
    setRows((data ?? []) as NotificationRow[])
    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!user?.id) return
    const channelName = `notifications-user-${user.id}-${channelSuffixRef.current}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as NotificationRow
            setRows((prev) => {
              const exists = prev.some((item) => item.id === row.id)
              return exists ? prev : [row, ...prev]
            })
            Alert.alert(row.title, row.body)
            return
          }
          // Keep read state and ordering in sync when notifications are updated elsewhere.
          void load()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load, user?.id])

  const onRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const markAllRead = async () => {
    try {
      await apiPostMarkAllNotificationsRead()
      setRows((prev) => prev.map((r) => ({ ...r, is_read: true })))
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed')
    }
  }

  const onPressItem = async (item: NotificationRow) => {
    try {
      await apiPost<{ success?: boolean }>('/api/notifications/mark-read', { notification_id: item.id })
      setRows((prev) => prev.map((r) => (r.id === item.id ? { ...r, is_read: true } : r)))
    } catch {
      // still navigate
    }
    const target = getMobileNotificationTarget(item)
    if (target.kind === 'profile-invitations') {
      router.push({ pathname: '/(app)/(tabs)/profile', params: { section: 'invitations' } })
      return
    }
    if (target.kind !== 'project') return
    router.push({
      pathname: '/projects/[id]',
      params: {
        id: target.id,
        tab: target.tab,
        paymentId: target.paymentId,
        updateId: target.updateId,
      },
    })
  }

  if (authLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F2EDE8' }} edges={['left', 'right', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#D85A30" />
        </View>
      </SafeAreaView>
    )
  }

  if (!user) return <Redirect href="/(auth)/login" />

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F2EDE8' }} edges={['left', 'right', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#D85A30" />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F2EDE8' }} edges={['left', 'right', 'bottom']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: '#F2EDE8',
          backgroundColor: '#FFFFFF',
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>Notifications</Text>
        <TouchableOpacity onPress={() => void markAllRead()} style={{ minHeight: 48, justifyContent: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#D85A30' }}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#D85A30" />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 }}
        ListEmptyComponent={
          <View style={{ paddingTop: 64, alignItems: 'center' }}>
            <Text style={{ fontSize: 40 }}>🔔</Text>
            <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '600', color: '#4B5563' }}>{"You're all caught up!"}</Text>
            <Text style={{ marginTop: 6, fontSize: 13, color: '#9CA3AF' }}>No new notifications</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const prev = rows[index - 1]
          const showDate = !prev || notificationGroupLabel(prev.created_at) !== notificationGroupLabel(item.created_at)
          return (
            <View>
              {showDate ? (
                <Text style={{ marginVertical: 8, fontSize: 11, fontWeight: '700', color: '#9CA3AF' }}>{notificationGroupLabel(item.created_at)}</Text>
              ) : null}
              <TouchableOpacity
                onPress={() => void onPressItem(item)}
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
                    <Text style={{ marginTop: 4, fontSize: 13, color: '#6B7280' }}>{item.body}</Text>
                    <Text style={{ marginTop: 6, fontSize: 11, color: '#9CA3AF' }}>{relativeTime(item.created_at)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          )
        }}
      />
    </SafeAreaView>
  )
}
