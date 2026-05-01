import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
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
const SORT_OPTIONS = ['Top rated', 'Most experienced'] as const

type ContractorSearchItem = {
  id: string
  name: string
  city: string | null
  profile_photo_url: string | null
  profile_images: string[]
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
  const [sortBy, setSortBy] = useState<(typeof SORT_OPTIONS)[number]>('Top rated')
  const [sortMenuOpen, setSortMenuOpen] = useState(false)

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

  const filteredContractors = useMemo(() => {
    const list = [...contractors]
    if (sortBy === 'Top rated') {
      list.sort((a, b) => b.avg_rating - a.avg_rating || b.total_reviews - a.total_reviews)
    } else {
      list.sort((a, b) => b.years_experience - a.years_experience || b.avg_rating - a.avg_rating)
    }
    return list
  }, [contractors, sortBy])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchContractors()
    setRefreshing(false)
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F2EDE8' }} edges={[]}>
      <KeyboardSafeView includeTopSafeArea={false}>
        <View style={{ flex: 1 }}>
          <FlatList
            style={{ flex: 1 }}
            data={filteredContractors}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.brand} />}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 100 }}
            ListHeaderComponent={
              <>
                <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: '#2C2C2A' }}>Find professionals</Text>
                  <Text style={{ fontSize: 13, color: '#78716C', marginTop: 4 }}>
                    Discover trusted professionals near you
                  </Text>
                </View>

                {projectDraftMode ? (
                  <View
                    style={{
                      marginHorizontal: 16,
                      marginTop: 12,
                      borderRadius: 16,
                      backgroundColor: '#D85A30',
                      padding: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: 'rgba(255,255,255,0.2)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <View style={{ alignItems: 'center' }}>
                        <View
                          style={{
                            width: 0,
                            height: 0,
                            borderLeftWidth: 9,
                            borderRightWidth: 9,
                            borderBottomWidth: 8,
                            borderLeftColor: 'transparent',
                            borderRightColor: 'transparent',
                            borderBottomColor: '#FFFFFF',
                          }}
                        />
                        <View style={{ width: 14, height: 9, backgroundColor: '#FFFFFF' }} />
                      </View>
                    </View>
                    <View>
                      <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
                        Select a contractor for your project
                      </Text>
                      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 }}>
                        Tap a profile below to send invitation
                      </Text>
                    </View>
                  </View>
                ) : null}

                <View style={{ marginHorizontal: 16, marginTop: 14 }}>
                  <View style={{ position: 'relative' }}>
                    <View style={{ position: 'absolute', left: 14, top: 14, zIndex: 1 }}>
                      <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#D85A30' }} />
                      <View
                        style={{
                          width: 8,
                          height: 2,
                          backgroundColor: '#D85A30',
                          marginTop: 2,
                          marginLeft: 8,
                          transform: [{ rotate: '45deg' }],
                        }}
                      />
                    </View>
                    <TextInput
                      value={city}
                      onChangeText={(t) => {
                        setCity(t)
                        if (!t.trim()) setContractors([])
                      }}
                      placeholder="Search by city..."
                      placeholderTextColor={colors.mutedLight}
                      style={{
                        paddingLeft: 42,
                        paddingRight: 16,
                        paddingVertical: 14,
                        borderRadius: 16,
                        borderWidth: 1.5,
                        borderColor: '#E7E5E4',
                        backgroundColor: '#EDE8E3',
                        fontSize: 15,
                        color: '#2C2C2A',
                      }}
                    />
                  </View>
                </View>

                <View style={{ marginHorizontal: 16, marginTop: 12 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#78716C' }}>Professional type</Text>
                    <TouchableOpacity
                      onPress={() => setSortMenuOpen(true)}
                      style={{
                        backgroundColor: '#FBF0EB',
                        borderWidth: 1,
                        borderColor: '#F5DDD4',
                        borderRadius: 20,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        minHeight: 32,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#D85A30' }}>{`Sort: ${sortBy} ▾`}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {PROFILE_OPTIONS.map((pill) => {
                      const on = profileType === pill
                      return (
                        <TouchableOpacity
                          key={pill}
                          onPress={() => setProfileType(pill)}
                          style={{
                            backgroundColor: on ? '#D85A30' : '#FFFFFF',
                            borderWidth: 1,
                            borderColor: on ? '#D85A30' : '#E7E5E4',
                            borderRadius: 20,
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                            minHeight: 34,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '600', color: on ? '#FFFFFF' : '#78716C' }}>{pill}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>

                <View
                  style={{
                    marginHorizontal: 16,
                    marginTop: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  {city.trim() ? (
                    <Text style={{ fontSize: 12, color: '#78716C' }}>{`${filteredContractors.length} professionals found`}</Text>
                  ) : (
                    <View />
                  )}
                  {loading ? <ActivityIndicator size="small" color="#D85A30" /> : null}
                </View>

                {filteredContractors.length > 0 && !loading ? (
                  <View style={{ marginTop: 16 }}>
                    <View
                      style={{
                        paddingHorizontal: 16,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 10,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#2C2C2A' }}>Top rated</Text>
                      <Text style={{ fontSize: 12, color: '#D85A30' }}>{`${filteredContractors.length} found`}</Text>
                    </View>
                    <ScrollView
                      horizontal
                      nestedScrollEnabled
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4, gap: 12 }}
                    >
                      {filteredContractors.slice(0, 3).map((item) => (
                        <TouchableOpacity
                          key={`featured-${item.id}`}
                          onPress={() => {
                            const now = Date.now()
                            if (now - lastProfileNavAtRef.current < PROFILE_NAV_DEBOUNCE_MS) return
                            lastProfileNavAtRef.current = now
                            router.navigate({
                              pathname: '/contractors/[id]',
                              params: {
                                id: String(item.id),
                                ...(projectDraftMode ? { projectDraft: 'true' } : {}),
                              },
                            })
                          }}
                          style={{
                            width: 148,
                            borderRadius: 16,
                            backgroundColor: '#FFFFFF',
                            borderWidth: 0.5,
                            borderColor: '#EDE8E3',
                            overflow: 'hidden',
                          }}
                        >
                          <View style={{ height: 90, backgroundColor: '#EDE8E3', position: 'relative' }}>
                            {item.profile_images[0] ? (
                              <Image
                                source={{ uri: item.profile_images[0] }}
                                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                                resizeMode="cover"
                              />
                            ) : item.profile_photo_url ? (
                              <Image
                                source={{ uri: item.profile_photo_url }}
                                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                                resizeMode="cover"
                              />
                            ) : (
                              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.15 }}>
                                <View style={{ alignItems: 'center' }}>
                                  <View
                                    style={{
                                      width: 0,
                                      height: 0,
                                      borderLeftWidth: 12,
                                      borderRightWidth: 12,
                                      borderBottomWidth: 10,
                                      borderLeftColor: 'transparent',
                                      borderRightColor: 'transparent',
                                      borderBottomColor: '#2C2C2A',
                                    }}
                                  />
                                  <View style={{ width: 20, height: 12, backgroundColor: '#2C2C2A' }} />
                                </View>
                              </View>
                            )}
                            <View
                              style={{
                                position: 'absolute',
                                bottom: 6,
                                right: 6,
                                backgroundColor: 'rgba(0,0,0,0.55)',
                                borderRadius: 10,
                                paddingHorizontal: 6,
                                paddingVertical: 3,
                              }}
                            >
                              <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '600' }}>{`★ ${item.avg_rating.toFixed(1)}`}</Text>
                            </View>
                            <View
                              style={{
                                position: 'absolute',
                                top: 6,
                                left: 6,
                                width: 26,
                                height: 26,
                                borderRadius: 13,
                                borderWidth: 2,
                                borderColor: '#FFFFFF',
                                backgroundColor: '#D85A30',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden',
                              }}
                            >
                              {item.profile_photo_url ? (
                                <Image source={{ uri: item.profile_photo_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                              ) : (
                                <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFFFFF' }}>{initialsFromName(item.name)}</Text>
                              )}
                            </View>
                          </View>
                          <View style={{ padding: 10 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#2C2C2A' }} numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text style={{ fontSize: 10, color: '#78716C', marginTop: 2 }} numberOfLines={1}>
                              {item.city ?? '—'}
                            </Text>
                            <View
                              style={{
                                marginTop: 6,
                                backgroundColor: '#FBF0EB',
                                borderRadius: 10,
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                alignSelf: 'flex-start',
                              }}
                            >
                              <Text style={{ fontSize: 10, color: '#D85A30', fontWeight: '600' }} numberOfLines={1}>
                                {item.specialisations[0] || item.trade || item.profile_kind}
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {filteredContractors.length > 0 && !loading ? (
                  <View style={{ paddingHorizontal: 16, marginTop: 20, marginBottom: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#2C2C2A' }}>All professionals</Text>
                  </View>
                ) : null}
              </>
            }
            renderItem={({ item: c }) => {
              const hasPhotos = Boolean(c.profile_images.length > 0 || c.profile_photo_url)
              const heroImage = c.profile_images[0] || c.profile_photo_url
              return (
                <TouchableOpacity
                  onPress={() => {
                    const now = Date.now()
                    if (now - lastProfileNavAtRef.current < PROFILE_NAV_DEBOUNCE_MS) return
                    lastProfileNavAtRef.current = now
                    router.navigate({
                      pathname: '/contractors/[id]',
                      params: {
                        id: String(c.id),
                        ...(projectDraftMode ? { projectDraft: 'true' } : {}),
                      },
                    })
                  }}
                  style={{
                    marginHorizontal: 16,
                    marginBottom: 16,
                    borderRadius: 20,
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1,
                    borderColor: '#EDE8E3',
                    overflow: 'hidden',
                  }}
                  activeOpacity={0.95}
                >
                  <View style={{ position: 'relative', height: hasPhotos ? 144 : 80, backgroundColor: '#EDE8E3' }}>
                    {heroImage ? (
                      <Image
                        source={{ uri: heroImage }}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.2 }}>
                        <View style={{ alignItems: 'center' }}>
                          <View
                            style={{
                              width: 0,
                              height: 0,
                              borderLeftWidth: 14,
                              borderRightWidth: 14,
                              borderBottomWidth: 12,
                              borderLeftColor: 'transparent',
                              borderRightColor: 'transparent',
                              borderBottomColor: '#2C2C2A',
                            }}
                          />
                          <View style={{ width: 24, height: 14, backgroundColor: '#2C2C2A' }} />
                        </View>
                      </View>
                    )}
                    {heroImage ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} /> : null}

                    <View
                      style={{
                        position: 'absolute',
                        top: heroImage ? 10 : 8,
                        left: heroImage ? undefined : 12,
                        bottom: heroImage ? 12 : undefined,
                        width: heroImage ? undefined : 36,
                        height: heroImage ? undefined : 36,
                        right: heroImage ? undefined : undefined,
                      }}
                    >
                      <View
                        style={{
                          width: heroImage ? 44 : 36,
                          height: heroImage ? 44 : 36,
                          borderRadius: heroImage ? 12 : 10,
                          backgroundColor: '#D85A30',
                          borderWidth: 2,
                          borderColor: 'rgba(255,255,255,0.4)',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        {c.profile_photo_url ? (
                          <Image source={{ uri: c.profile_photo_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        ) : (
                          <Text style={{ fontSize: heroImage ? 15 : 12, fontWeight: '700', color: '#FFFFFF' }}>{initialsFromName(c.name)}</Text>
                        )}
                      </View>
                    </View>

                    {heroImage ? (
                      <View style={{ position: 'absolute', bottom: 12, left: 66, right: 12 }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
                          {c.name}
                        </Text>
                        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                          {c.city ?? '—'}
                        </Text>
                      </View>
                    ) : null}

                    {c.avg_rating >= 4.5 ? (
                      <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: '#D85A30', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>⭐ Top rated</Text>
                      </View>
                    ) : c.projects_completed >= 10 ? (
                      <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '600' }}>{`${c.projects_completed} projects`}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={{ padding: 14 }}>
                    {!heroImage ? (
                      <View style={{ marginBottom: 8 }}>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#2C2C2A' }}>{c.name}</Text>
                        <Text style={{ fontSize: 12, color: '#78716C', marginTop: 2 }}>{c.city ?? '—'}</Text>
                      </View>
                    ) : null}

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: '#F59E0B', fontSize: 13 }}>{starText(c.avg_rating)}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#2C2C2A' }}>{c.avg_rating.toFixed(1)}</Text>
                        <Text style={{ fontSize: 12, color: '#78716C' }}>{`(${c.total_reviews})`}</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: '#78716C' }}>{`${c.years_experience} yrs`}</Text>
                    </View>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {c.specialisations.slice(0, 3).map((s) => (
                        <View key={s} style={{ backgroundColor: '#FBF0EB', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}>
                          <Text style={{ fontSize: 11, color: '#D85A30', fontWeight: '600' }}>{s}</Text>
                        </View>
                      ))}
                      {c.specialisations.length > 3 ? (
                        <View style={{ backgroundColor: '#EDE8E3', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}>
                          <Text style={{ fontSize: 11, color: '#78716C' }}>{`+${c.specialisations.length - 3} more`}</Text>
                        </View>
                      ) : null}
                      {c.profile_kind === 'worker' && c.trade ? (
                        <View style={{ backgroundColor: '#F0FDF4', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}>
                          <Text style={{ fontSize: 11, color: '#166534', fontWeight: '600' }}>{c.trade}</Text>
                        </View>
                      ) : null}
                    </View>

                    {c.profile_images.length > 0 ? (
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                        {c.profile_images.slice(0, 3).map((img, idx) => (
                          <Image key={`${c.id}-strip-${idx}`} source={{ uri: img }} style={{ width: 72, height: 52, borderRadius: 10 }} resizeMode="cover" />
                        ))}
                        {c.profile_images.length > 3 ? (
                          <View style={{ width: 72, height: 52, borderRadius: 10, backgroundColor: '#EDE8E3', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 12, color: '#78716C', fontWeight: '600' }}>{`+${c.profile_images.length - 3}`}</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}

                    <View style={{ marginTop: 12, marginBottom: 12, height: 0.5, backgroundColor: '#EDE8E3' }} />

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', gap: 20 }}>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ fontSize: 15, fontWeight: '800', color: '#D85A30' }}>{c.projects_completed}</Text>
                          <Text style={{ fontSize: 10, color: '#78716C', marginTop: 2 }}>Projects</Text>
                        </View>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ fontSize: 15, fontWeight: '800', color: '#D85A30' }}>{c.total_reviews}</Text>
                          <Text style={{ fontSize: 10, color: '#78716C', marginTop: 2 }}>Reviews</Text>
                        </View>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ fontSize: 15, fontWeight: '800', color: '#D85A30' }}>{`${c.years_experience}+`}</Text>
                          <Text style={{ fontSize: 10, color: '#78716C', marginTop: 2 }}>Yrs exp</Text>
                        </View>
                      </View>
                      <View
                        style={{
                          backgroundColor: projectDraftMode ? '#D85A30' : '#FBF0EB',
                          borderRadius: 12,
                          paddingHorizontal: 16,
                          paddingVertical: 10,
                          borderWidth: projectDraftMode ? 0 : 1,
                          borderColor: '#F5DDD4',
                        }}
                      >
                        <Text style={{ color: projectDraftMode ? '#FFFFFF' : '#D85A30', fontSize: 13, fontWeight: '700' }}>
                          {projectDraftMode ? 'Invite' : 'View profile'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              )
            }}
            ListEmptyComponent={
              !loading && city.trim() ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <View style={{ opacity: 0.2, alignItems: 'center' }}>
                    <View
                      style={{
                        width: 0,
                        height: 0,
                        borderLeftWidth: 20,
                        borderRightWidth: 20,
                        borderBottomWidth: 18,
                        borderLeftColor: 'transparent',
                        borderRightColor: 'transparent',
                        borderBottomColor: '#2C2C2A',
                      }}
                    />
                    <View style={{ width: 34, height: 20, backgroundColor: '#2C2C2A' }} />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#2C2C2A', marginTop: 16 }}>{`No ${profileType} found`}</Text>
                  <Text style={{ fontSize: 13, color: '#78716C', marginTop: 6, textAlign: 'center' }}>
                    Try searching a nearby city like Secunderabad
                  </Text>
                </View>
              ) : !city.trim() ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <View style={{ opacity: 0.2, alignItems: 'center' }}>
                    <View
                      style={{
                        width: 0,
                        height: 0,
                        borderLeftWidth: 20,
                        borderRightWidth: 20,
                        borderBottomWidth: 18,
                        borderLeftColor: 'transparent',
                        borderRightColor: 'transparent',
                        borderBottomColor: '#2C2C2A',
                      }}
                    />
                    <View style={{ width: 34, height: 20, backgroundColor: '#2C2C2A' }} />
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#78716C', marginTop: 16, textAlign: 'center' }}>
                    Search a city to find professionals
                  </Text>
                  <Text style={{ fontSize: 13, color: '#A8A29E', marginTop: 6 }}>
                    Mason, plumber, contractor and more
                  </Text>
                </View>
              ) : null
            }
          />
      <Modal visible={sortMenuOpen} transparent animationType="fade" onRequestClose={() => setSortMenuOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'flex-start', paddingTop: 110, paddingHorizontal: 16 }}
          onPress={() => setSortMenuOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              alignSelf: 'flex-end',
              width: 190,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#F3E8DE',
              backgroundColor: '#FFFFFF',
              padding: 8,
            }}
          >
            {SORT_OPTIONS.map((option) => {
              const active = sortBy === option
              return (
                <TouchableOpacity
                  key={option}
                  onPress={() => {
                    setSortBy(option)
                    setSortMenuOpen(false)
                  }}
                  style={{
                    minHeight: 40,
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    backgroundColor: active ? '#FFF4ED' : '#FFFFFF',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: active ? colors.brand : colors.foreground }}>{option}</Text>
                </TouchableOpacity>
              )
            })}
          </Pressable>
        </Pressable>
      </Modal>
        </View>
      </KeyboardSafeView>
    </SafeAreaView>
  )
}
