import AsyncStorage from '@react-native-async-storage/async-storage'
import { useMemo, useState } from 'react'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { useSessionState } from '@/lib/auth-state'
import { KeyboardSafeView } from '@/lib/keyboardSafe'
import { PROJECT_DRAFT_STORAGE_KEY, type ProjectDraft } from '@/lib/projectDraft'
import { apiPost } from '@/lib/api'

const projectTypes = ['Residential', 'Commercial', 'Renovation'] as const

export default function NewProjectScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ inviteTo?: string; inviteToName?: string; inviteToCity?: string }>()
  const { loading, profile, user } = useSessionState()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [pincode, setPincode] = useState('')
  const [projectType, setProjectType] = useState<(typeof projectTypes)[number]>('Residential')
  const [budget, setBudget] = useState('')
  const [startDate, setStartDate] = useState('')
  const [showStartDatePicker, setShowStartDatePicker] = useState(false)
  const [sendingInvite, setSendingInvite] = useState(false)
  const invitedContractorId = Array.isArray(params.inviteTo) ? params.inviteTo[0] : params.inviteTo
  const invitedContractorName = Array.isArray(params.inviteToName) ? params.inviteToName[0] : params.inviteToName
  const isInviteMode = Boolean(invitedContractorId)

  const canContinue = useMemo(
    () =>
      name.trim().length > 1 &&
      address.trim().length > 4 &&
      city.trim().length > 1 &&
      /^\d{6}$/.test(pincode.trim()),
    [address, city, name, pincode]
  )

  const startDateValue = useMemo(() => {
    if (!startDate) return new Date()
    const parsed = new Date(startDate)
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed
  }, [startDate])

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color="#D85A30" />
      </View>
    )
  }

  if (!user) return <Redirect href="/(auth)/login" />
  if (!profile) return <Redirect href="/(auth)/register" />
  if (profile.role !== 'customer') return <Redirect href="/(app)/(tabs)" />

  const onFindContractor = async () => {
    if (!canContinue) return
    const draft: ProjectDraft = {
      project_name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      pincode: pincode.trim(),
      project_type: projectType,
      estimated_budget: budget.trim() ? Number(budget.replace(/\D/g, '')) : undefined,
      start_date: startDate.trim() || undefined,
    }
    await AsyncStorage.setItem(PROJECT_DRAFT_STORAGE_KEY, JSON.stringify(draft))
    router.push({ pathname: '/search', params: { projectDraft: 'true' } })
  }

  const onSendInvite = async () => {
    if (!canContinue || !invitedContractorId) return
    setSendingInvite(true)
    try {
      const payload = await apiPost<{ success?: boolean; error?: string }>('/api/invitations/send', {
        contractor_id: invitedContractorId,
        project_name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        pincode: pincode.trim(),
        project_type: projectType,
        estimated_budget: budget.trim() ? Number(budget.replace(/\D/g, '')) : undefined,
        start_date: startDate.trim() || undefined,
      })
      if (!payload.success) throw new Error(payload.error ?? 'Failed to send invite')
      await AsyncStorage.removeItem(PROJECT_DRAFT_STORAGE_KEY)
      router.replace('/(app)/(tabs)')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to send invite'
      Alert.alert('Invite', message)
    } finally {
      setSendingInvite(false)
    }
  }

  const onStartDateChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS !== 'ios') {
      setShowStartDatePicker(false)
    }
    if (selectedDate) {
      setStartDate(selectedDate.toISOString().slice(0, 10))
    }
  }

  const BRAND = '#D85A30'
  const FG = '#1A1A1A'
  const BORDER = '#E0D5CC'

  return (
    <KeyboardSafeView iosHeaderOffset={52} style={{ backgroundColor: '#FFFFFF' }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        onTouchStart={() => setShowStartDatePicker(false)}
      >
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#1A1A1A' }}>New Project</Text>
          <Text style={{ marginTop: 4, fontSize: 13, color: '#78716C' }}>
            {isInviteMode
              ? `Enter project details to send invite to ${invitedContractorName ?? 'selected contractor'}`
              : 'Enter project details to find professionals'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          <View style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#FBF0EB' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND }}>1. Details</Text>
          </View>
          <Text style={{ color: '#9CA3AF', alignSelf: 'center' }}>→</Text>
          <View style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: isInviteMode ? '#FBF0EB' : '#F2EDE8' }}>
            <Text style={{ fontSize: 13, color: isInviteMode ? BRAND : '#6B7280', fontWeight: isInviteMode ? '700' : '400' }}>
              {isInviteMode ? '2. Send Invite' : '2. Find Contractor'}
            </Text>
          </View>
        </View>

        <Field label="Building name *" value={name} onChangeText={setName} placeholder="Sharma Residence" onFocus={() => setShowStartDatePicker(false)} />
        <Field label="Address *" value={address} onChangeText={setAddress} placeholder="Street, area" multiline onFocus={() => setShowStartDatePicker(false)} />
        <Field label="City *" value={city} onChangeText={setCity} placeholder="City" onFocus={() => setShowStartDatePicker(false)} />
        <Field
          label="Pincode *"
          value={pincode}
          onChangeText={(t) => setPincode(t.replace(/\D/g, '').slice(0, 6))}
          placeholder="400001"
          keyboardType="number-pad"
          onFocus={() => setShowStartDatePicker(false)}
        />

        <Text style={{ fontSize: 14, fontWeight: '600', color: FG, marginBottom: 8 }}>Project type</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {projectTypes.map((type) => {
            const selected = projectType === type
            return (
              <TouchableOpacity
                key={type}
                onPress={() => {
                  setShowStartDatePicker(false)
                  setProjectType(type)
                }}
                style={{
                  minHeight: 48,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  backgroundColor: selected ? '#FBF0EB' : '#F2EDE8',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontWeight: '600', color: selected ? BRAND : '#374151' }}>{type}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <Field
          label="Estimated budget (optional)"
          value={budget}
          onChangeText={setBudget}
          placeholder="₹"
          keyboardType="numeric"
          onFocus={() => setShowStartDatePicker(false)}
        />

        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: FG, marginBottom: 6 }}>Expected start (optional)</Text>
          <TouchableOpacity
            onPress={() => setShowStartDatePicker(true)}
            activeOpacity={0.8}
            style={{
              minHeight: 48,
              borderWidth: 1,
              borderColor: BORDER,
              borderRadius: 12,
              paddingHorizontal: 12,
              justifyContent: 'center',
              backgroundColor: '#FFFFFF',
            }}
          >
            <Text style={{ fontSize: 15, color: startDate ? FG : '#9CA3AF' }}>
              {startDate || 'Select date'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => void (isInviteMode ? onSendInvite() : onFindContractor())}
          disabled={!canContinue || sendingInvite}
          style={{
            marginTop: 20,
            minHeight: 52,
            borderRadius: 14,
            backgroundColor: canContinue && !sendingInvite ? BRAND : '#D1D5DB',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>
            {isInviteMode ? (sendingInvite ? 'Sending Invite...' : 'Send Invite') : 'Find Contractor'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={showStartDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStartDatePicker(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.25)',
            justifyContent: 'center',
            paddingHorizontal: 16,
          }}
          onPress={() => setShowStartDatePicker(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 14,
              padding: 12,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <TouchableOpacity onPress={() => setShowStartDatePicker(false)} hitSlop={8}>
                <Text style={{ color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={{ fontWeight: '700', color: '#1A1A1A' }}>Select start date</Text>
              <TouchableOpacity onPress={() => setShowStartDatePicker(false)} hitSlop={8}>
                <Text style={{ color: '#D85A30', fontWeight: '700' }}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={startDateValue}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onStartDateChange}
              themeVariant="light"
              textColor="#111827"
              style={{ backgroundColor: '#FFFFFF' }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardSafeView>
  )
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  onFocus,
}: {
  label: string
  value: string
  onChangeText: (t: string) => void
  placeholder?: string
  multiline?: boolean
  keyboardType?: 'default' | 'number-pad' | 'numeric'
  onFocus?: () => void
}) {
  const FG = '#1A1A1A'
  const BORDER = '#E0D5CC'
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: FG, marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline={multiline}
        keyboardType={keyboardType ?? 'default'}
        onFocus={onFocus}
        style={{
          minHeight: multiline ? 88 : 48,
          borderWidth: 1,
          borderColor: BORDER,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 12,
          fontSize: 15,
          color: FG,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  )
}
