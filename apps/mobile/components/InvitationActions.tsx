import { useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import { supabase } from '@/lib/supabase'
import { getResolvedApiBaseUrl } from '@/lib/getApiBaseUrl'
import { colors } from '@/lib/theme'

type InvitationActionsProps = {
  projectId: string
  onDone?: () => void
}

export function InvitationActions({ projectId, onDone }: InvitationActionsProps) {
  const [submitting, setSubmitting] = useState<'accept' | 'decline' | null>(null)

  const respond = async (action: 'accept' | 'decline') => {
    setSubmitting(action)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        Alert.alert('Session', 'Please sign in again.')
        return
      }
      const base = getResolvedApiBaseUrl()
      const response = await fetch(`${base}/api/invitations/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ project_id: projectId, action }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        Alert.alert('Could not update', payload.error ?? 'Try again.')
        return
      }
      onDone?.()
    } catch {
      Alert.alert('Network', 'Could not reach the server.')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <View className="mt-3 flex-row gap-2">
      <Pressable
        onPress={() => void respond('accept')}
        disabled={submitting !== null}
        className="flex-1 items-center justify-center rounded-md py-2"
        style={{ backgroundColor: colors.green, opacity: submitting !== null ? 0.65 : 1 }}
      >
        <Text className="text-xs font-semibold text-white">
          {submitting === 'accept' ? 'Accepting…' : 'Accept'}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => void respond('decline')}
        disabled={submitting !== null}
        className="flex-1 items-center justify-center rounded-md py-2"
        style={{ backgroundColor: colors.red, opacity: submitting !== null ? 0.65 : 1 }}
      >
        <Text className="text-xs font-semibold text-white">
          {submitting === 'decline' ? 'Declining…' : 'Decline'}
        </Text>
      </Pressable>
    </View>
  )
}
