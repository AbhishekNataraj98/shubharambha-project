import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { apiGet } from '@/lib/api'
import { starText } from '@/lib/utils'
import { useSessionState } from '@/lib/auth-state'
import { SafeAreaView } from 'react-native-safe-area-context'
import { KeyboardSafeView } from '@/lib/keyboardSafe'
import { colors, initialsFromName } from '@/lib/theme'

const PROFILE_OPTIONS = ['Contractor', 'Mason', 'Plumber', 'Carpenter', 'Electrician', 'Painter'] as const

type ContractorSearchItem = {
  id: string
  name: string
  city: string | null
  profile_kind: 'contractor' | 'worker'
  trade: string | null
  avg_rating: number
  total_reviews: number
  projects_completed: number
  specialisations: string[]
  years_experience: number
}

const PROFILE_NAV_DEBOUNCE_MS = 600

export default function SearchTab() {
  const router = useRouter()
  const lastProfileNavAtRef = useRef(0)
  const params = useLocalSearchParams<{ city?: string; projectDraft?: string }>()
  const { profile } = useSessionState()
  const [city, setCity] = useState('')
  const [profileType, setProfileType] = useState<(typeof PROFILE_OPTIONS)[number]>('Contractor')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [contractors, setContractors] = useState<ContractorSearchItem[]>([])

  const projectDraftMode = params.projectDraft === 'true'

  useEffect(() => {
    const c = params.city
    if (typeof c === 'string' && c.trim()) setCity(c.trim())
  }, [params.city])

  const fetchContractors = useCallback(async () => {
    if (!city.trim()) {
      setContractors([])
      return
    }
    setLoading(true)
    try {
      const q = new URLSearchParams({ city: city.trim() })
      q.set('profileType', profileType.toLowerCase())
      const data = await apiGet<ContractorSearchItem[]>(`/api/contractors/search?${q.toString()}`)
      setContractors(Array.isArray(data) ? data : [])
    } catch {
      setContractors([])
    } finally {
      setLoading(false)
    }
  }, [city, profileType])

  useEffect(() => {
    void fetchContractors()
  }, [fetchContractors])

  const filteredContractors = useMemo(() => contractors, [contractors])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchContractors()
    setRefreshing(false)
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <KeyboardSafeView includeTopSafeArea={false}>
      <View style={{ flex: 1 }}>
      {projectDraftMode ? (
        <View style={{ backgroundColor: colors.brand, paddingVertical: 12, paddingHorizontal: 16 }}>
          <Text style={{ textAlign: 'center', fontWeight: '700', color: '#FFFFFF' }}>Select a contractor for your project</Text>
        </View>
      ) : null}
      <FlatList
        style={{ flex: 1 }}
        data={filteredContractors}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.brand} />}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.foreground }}>Find Contractors</Text>
            <Text style={{ marginTop: 6, fontSize: 14, color: colors.muted }}>Discover trusted professionals for your project</Text>
            <TextInput
              value={city}
              onChangeText={(t) => {
                setCity(t)
                if (!t.trim()) setContractors([])
              }}
              placeholder="Search by city"
              placeholderTextColor={colors.mutedLight}
              style={{
                marginTop: 16,
                borderWidth: 2,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 14,
                fontSize: 15,
                color: colors.foreground,
              }}
            />
            <Text style={{ marginTop: 14, fontSize: 13, fontWeight: '600', color: colors.foreground }}>Profile type</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 8 }}>
              {PROFILE_OPTIONS.map((pill) => {
                const on = profileType === pill
                return (
                  <TouchableOpacity
                    key={pill}
                    onPress={() => setProfileType(pill)}
                    style={{
                      minHeight: 48,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      backgroundColor: on ? colors.brand : '#FFFFFF',
                      borderWidth: on ? 0 : 1,
                      borderColor: colors.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: on ? '#FFFFFF' : colors.muted }}>{pill}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            {loading ? (
              <View style={{ paddingVertical: 16 }}>
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : null}
          </View>
        }
        contentContainerStyle={{ paddingBottom: 32 }}
        renderItem={({ item: c }) => (
          <View style={{ marginHorizontal: 16, marginBottom: 12, borderRadius: 16, backgroundColor: '#FFFFFF', padding: 16, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: '#FFEDD5',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontWeight: '800', color: colors.brand }}>{initialsFromName(c.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.foreground }}>{c.name}</Text>
                <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>{c.city ?? '—'}</Text>
                <Text style={{ fontSize: 12, color: '#374151', marginTop: 4, fontWeight: '600' }}>
                  {c.profile_kind === 'contractor' ? 'Contractor' : c.trade ?? 'Worker'}
                </Text>
                <Text style={{ fontSize: 12, color: '#B45309', marginTop: 4 }}>
                  {starText(c.avg_rating)} {c.avg_rating.toFixed(1)} · {c.total_reviews} reviews
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {c.specialisations.slice(0, 2).map((s) => (
                    <View key={s} style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#F3F4F6' }}>
                      <Text style={{ fontSize: 11, color: '#4B5563' }}>{s}</Text>
                    </View>
                  ))}
                </View>
                <Text style={{ marginTop: 8, fontSize: 12, color: colors.muted }}>{c.projects_completed} projects completed</Text>
                <TouchableOpacity
                  onPress={() => {
                    const now = Date.now()
                    if (now - lastProfileNavAtRef.current < PROFILE_NAV_DEBOUNCE_MS) return
                    lastProfileNavAtRef.current = now
                    // navigate merges with an existing contractor screen when possible (avoids duplicate stack entries)
                    router.navigate({
                      pathname: '/contractors/[id]',
                      params: {
                        id: String(c.id),
                        ...(projectDraftMode ? { projectDraft: 'true' } : {}),
                      },
                    })
                  }}
                  style={{
                    marginTop: 12,
                    minHeight: 48,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: colors.brand,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  <Text style={{ fontWeight: '700', color: colors.brand }}>View Profile</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          !loading && city.trim() ? (
            <View style={{ padding: 24 }}>
              <Text style={{ textAlign: 'center', color: colors.muted }}>
                {`No ${profileType} found in this city. Try nearby city.`}
              </Text>
            </View>
          ) : !city.trim() ? (
            <View style={{ padding: 24 }}>
              <Text style={{ textAlign: 'center', color: colors.muted }}>Enter a city to search.</Text>
            </View>
          ) : null
        }
      />
      </View>
      </KeyboardSafeView>
    </SafeAreaView>
  )
}
