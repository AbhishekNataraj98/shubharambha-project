import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useSessionState } from '@/lib/auth-state'
import { KeyboardSafeView } from '@/lib/keyboardSafe'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Logo from '@/components/shared/Logo'

const roles = ['customer', 'contractor', 'worker', 'supplier'] as const
type Role = (typeof roles)[number]
const contractorSpecialisations = ['Residential', 'Commercial', 'Foundation', 'Plastering', 'Waterproofing', 'Interior'] as const
const workerTrades = ['Mason', 'Plumber', 'Carpenter', 'Electrician', 'Painter'] as const
type WorkerTrade = (typeof workerTrades)[number]

const BRAND = '#D85A30'
const BG = '#FFF8F5'
const FG = '#1A1A1A'
const MUTED = '#7A6F66'
const BORDER = '#E0D5CC'

export default function RegisterScreen() {
  const router = useRouter()
  const { fromOtp } = useLocalSearchParams<{ fromOtp?: string }>()
  const insets = useSafeAreaInsets()
  const { user, profile, loading: authLoading, refreshProfile } = useSessionState()
  const [waitingForSession, setWaitingForSession] = useState(fromOtp === '1')
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [pincode, setPincode] = useState('')
  const [role, setRole] = useState<Role>('customer')
  const [yearsExperience, setYearsExperience] = useState('')
  const [contractorSpecialisation, setContractorSpecialisation] = useState<string[]>([])
  const [bio, setBio] = useState('')
  const [workerTrade, setWorkerTrade] = useState<WorkerTrade | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = useMemo(
    () =>
      name.trim().length >= 2 &&
      city.trim().length >= 2 &&
      pincode.trim().length >= 6 &&
      (role !== 'worker' || Boolean(workerTrade)),
    [city, name, pincode, role, workerTrade]
  )
  const step = !role ? 1 : !canSubmit ? 2 : 3

  useEffect(() => {
    if (fromOtp !== '1') {
      setWaitingForSession(false)
      return
    }
    let cancelled = false
    let retries = 0

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      if (data.session?.user) {
        setWaitingForSession(false)
        return
      }
      retries += 1
      if (retries >= 12) {
        setWaitingForSession(false)
        return
      }
      setTimeout(() => {
        void checkSession()
      }, 250)
    }

    void checkSession()
    return () => {
      cancelled = true
    }
  }, [fromOtp])

  if (authLoading || waitingForSession) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top', 'left', 'right']}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#D85A30" />
        </View>
      </SafeAreaView>
    )
  }

  if (!user) return <Redirect href={'/(auth)/login' as any} />
  if (profile) return <Redirect href={'/(app)/(tabs)' as any} />

  const submit = async () => {
    if (!canSubmit) {
      Alert.alert('Invalid details', 'Please fill all required fields')
      return
    }
    setSubmitting(true)
    try {
      const parsedYears = Number.parseInt(yearsExperience || '0', 10)
      const safeYears = Number.isFinite(parsedYears) ? Math.max(0, Math.min(60, parsedYears)) : 0

      const { error } = await supabase.from('users').insert({
        id: user.id,
        phone_number: user.phone ?? '',
        name: name.trim(),
        role,
        city: city.trim(),
        pincode: pincode.trim(),
        bio: bio.trim() ? bio.trim() : null,
        is_verified: true,
      })
      if (error) {
        Alert.alert('Failed', error.message)
        return
      }

      if (role === 'contractor') {
        const { error: contractorError } = await supabase.from('contractor_profiles').insert({
          user_id: user.id,
          years_experience: safeYears,
          specialization: contractorSpecialisation,
        } as any)
        if (contractorError) {
          Alert.alert('Failed', contractorError.message)
          return
        }
      }

      if (role === 'worker') {
        const { error: workerError } = await supabase.from('worker_profiles').insert({
          user_id: user.id,
          skill_tags: workerTrade ? [workerTrade] : [],
          years_experience: safeYears,
        } as any)
        if (workerError) {
          Alert.alert('Failed', workerError.message)
          return
        }
      }

      await refreshProfile()
      Alert.alert('Success', 'Profile created')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <SafeAreaView style={styles.safe} edges={[]}>
        <KeyboardSafeView includeTopSafeArea iosHeaderOffset={8}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.topHeaderContainer}>
            <View style={styles.topHeader}>
              <Pressable
                onPress={async () => {
                  try {
                    await supabase.auth.signOut()
                  } catch {
                    // If network is flaky, still allow navigating back to login entry.
                  } finally {
                    router.replace('/(auth)/login')
                  }
                }}
                style={styles.backButton}
                accessibilityLabel="Back to login"
              >
                <Text style={styles.backButtonText}>‹</Text>
              </Pressable>
              <View style={styles.brandWrap}>
                <View style={styles.brandIcon}>
                  <Logo size={16} color="white" />
                </View>
                <Text style={styles.brandText}>Shubharambha</Text>
              </View>
              <View style={{ width: 36 }} />
            </View>
          </View>

          <View style={styles.stepRow}>
            {[1, 2, 3].map((index) => {
              const active = index <= step
              return (
                <View key={index} style={styles.stepCol}>
                  <View style={[styles.stepDot, active ? styles.stepDotActive : styles.stepDotInactive]}>
                    <Text style={styles.stepDotText}>{index}</Text>
                  </View>
                  <Text style={[styles.stepLabel, active ? styles.stepLabelActive : styles.stepLabelInactive]}>
                    {index === 1 ? 'Role' : index === 2 ? 'Details' : 'Complete'}
                  </Text>
                </View>
              )
            })}
          </View>

          <Text style={styles.title}>Create your profile</Text>
          <Text style={styles.subtitle}>Tell us about yourself to get started</Text>

          <Text style={styles.sectionLabel}>What is your role?</Text>
          {roles.map((item) => {
            const active = role === item
            const title = item.charAt(0).toUpperCase() + item.slice(1)
            const desc =
              item === 'customer'
                ? 'Building / renovating my home'
                : item === 'contractor'
                  ? 'I manage construction projects'
                  : item === 'worker'
                    ? 'Skilled tradesperson'
                    : 'I sell building materials'
            return (
              <Pressable
                key={item}
                onPress={() => {
                  setRole(item)
                  if (item !== 'worker') setWorkerTrade(null)
                  if (item !== 'contractor') {
                    setYearsExperience('')
                    setContractorSpecialisation([])
                    setBio('')
                  }
                }}
                style={[styles.roleCard, active ? styles.roleCardActive : styles.roleCardInactive]}
              >
                <View style={[styles.roleIcon, active ? styles.roleIconActive : styles.roleIconInactive]}>
                  <Text style={styles.roleIconText}>
                    {item === 'customer' ? '🏠' : item === 'contractor' ? '🏗' : item === 'worker' ? '👷' : '📦'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.roleTitle}>{title}</Text>
                  <Text style={styles.roleDesc}>{desc}</Text>
                </View>
                {active ? (
                  <View style={styles.selectedDot}>
                    <Text style={styles.selectedDotText}>✓</Text>
                  </View>
                ) : null}
              </Pressable>
            )
          })}

          {role === 'worker' ? (
            <View style={styles.detailsCard}>
              <Text style={styles.detailsTitle}>Worker Details</Text>
              <Text style={styles.fieldLabel}>Select your trade *</Text>
              <View style={styles.tradeRow}>
                {workerTrades.map((trade) => {
                  const selected = workerTrade === trade
                  return (
                    <Pressable
                      key={trade}
                      onPress={() => setWorkerTrade(trade)}
                      style={[styles.tradePill, selected ? styles.tradePillActive : styles.tradePillInactive]}
                    >
                      <Text style={[styles.tradePillText, selected ? styles.tradePillTextActive : styles.tradePillTextInactive]}>
                        {trade}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          ) : null}

          {role === 'contractor' ? (
            <View style={styles.detailsCard}>
              <Text style={styles.detailsTitle}>Contractor Details</Text>
              <Text style={styles.fieldLabel}>Years of Experience</Text>
              <TextInput
                keyboardType="number-pad"
                value={yearsExperience}
                onChangeText={(value) => setYearsExperience(value.replace(/\D/g, '').slice(0, 2))}
                placeholder="0-60"
                placeholderTextColor="#A8A29E"
                style={styles.input}
              />
              <Text style={styles.fieldLabel}>Specialisations</Text>
              <View style={styles.tradeRow}>
                {contractorSpecialisations.map((item) => {
                  const selected = contractorSpecialisation.includes(item)
                  return (
                    <Pressable
                      key={item}
                      onPress={() =>
                        setContractorSpecialisation((prev) =>
                          prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
                        )
                      }
                      style={[styles.tradePill, selected ? styles.tradePillActive : styles.tradePillInactive]}
                    >
                      <Text style={[styles.tradePillText, selected ? styles.tradePillTextActive : styles.tradePillTextInactive]}>
                        {item}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              <Text style={styles.fieldLabel}>About You</Text>
              <TextInput
                value={bio}
                onChangeText={setBio}
                placeholder="Tell customers about your work"
                placeholderTextColor="#A8A29E"
                style={[styles.input, styles.textArea]}
                multiline
                maxLength={300}
                textAlignVertical="top"
              />
            </View>
          ) : null}

          <View style={styles.detailsCard}>
            <Text style={styles.detailsTitle}>Basic Details</Text>

            <Text style={styles.fieldLabel}>Full Name *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor="#A8A29E"
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>City *</Text>
            <TextInput
              value={city}
              onChangeText={setCity}
              placeholder="City"
              placeholderTextColor="#A8A29E"
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>Pincode *</Text>
            <TextInput
              keyboardType="number-pad"
              value={pincode}
              onChangeText={(value) => setPincode(value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6 digits"
              placeholderTextColor="#A8A29E"
              style={styles.input}
            />
          </View>

          <Pressable
            onPress={() => void submit()}
            disabled={!canSubmit || submitting}
            style={[styles.submitButton, (!canSubmit || submitting) && styles.submitButtonDisabled]}
          >
            <Text style={styles.submitButtonText}>{submitting ? 'Creating profile...' : 'Create Profile'}</Text>
          </Pressable>
        </ScrollView>
        </KeyboardSafeView>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  safe: { flex: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 36 },
  topHeaderContainer: {
    marginHorizontal: -18,
    marginTop: -8,
    marginBottom: 14,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: BRAND,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,74,10,0.45)',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  backButtonText: { color: '#FFFFFF', fontSize: 24, lineHeight: 24, fontWeight: '600' },
  brandWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  stepRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  stepCol: { alignItems: 'center', flex: 1 },
  stepDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: BRAND },
  stepDotInactive: { backgroundColor: BORDER },
  stepDotText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  stepLabel: { marginTop: 6, fontSize: 11, fontWeight: '600' },
  stepLabelActive: { color: BRAND },
  stepLabelInactive: { color: '#9CA3AF' },
  title: { fontSize: 28, fontWeight: '800', color: FG, textAlign: 'center' },
  subtitle: { marginTop: 6, marginBottom: 20, fontSize: 14, color: MUTED, textAlign: 'center' },
  sectionLabel: { marginBottom: 10, fontSize: 13, fontWeight: '700', color: FG },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 2,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    minHeight: 68,
  },
  roleCardActive: { borderColor: BRAND, backgroundColor: '#FFF8F5' },
  roleCardInactive: { borderColor: BORDER },
  roleIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  roleIconActive: { backgroundColor: BRAND },
  roleIconInactive: { backgroundColor: BORDER },
  roleIconText: { fontSize: 19 },
  roleTitle: { fontSize: 14, fontWeight: '700', color: FG },
  roleDesc: { marginTop: 2, fontSize: 11, color: MUTED },
  selectedDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  selectedDotText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  detailsCard: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderTopWidth: 4,
    borderTopColor: BRAND,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F2EDE8',
  },
  detailsTitle: { fontSize: 13, fontWeight: '700', color: FG, marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: FG, marginBottom: 6, marginTop: 2 },
  input: {
    height: 46,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: BORDER,
    paddingHorizontal: 12,
    fontSize: 14,
    color: FG,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  submitButton: {
    marginTop: 16,
    height: 48,
    borderRadius: 12,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: { backgroundColor: '#D6D3D1' },
  submitButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  tradeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  tradePill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  tradePillActive: { backgroundColor: BRAND, borderColor: BRAND },
  tradePillInactive: { backgroundColor: '#FFFFFF', borderColor: BORDER },
  tradePillText: { fontSize: 12, fontWeight: '600' },
  tradePillTextActive: { color: '#FFFFFF' },
  tradePillTextInactive: { color: MUTED },
  textArea: { height: 96, paddingTop: 10 },
})
