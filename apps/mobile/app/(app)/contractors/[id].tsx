import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { apiGet, apiPost } from '@/lib/api'
import { PROJECT_DRAFT_STORAGE_KEY, type ProjectDraft } from '@/lib/projectDraft'
import { getInitials, relativeMonths, starText } from '@/lib/utils'
import { useSessionState } from '@/lib/auth-state'
import { SafeAreaView } from 'react-native-safe-area-context'

type CompletedProject = {
  id: string
  name: string
  city: string
  status: string
  thumbnail: string | null
}

type ReviewRow = {
  id: string
  rating: number
  comment: string | null
  created_at: string
  project_id: string
  reviewer_id: string
  reviewer_name: string
}

type ContractorApiResponse = {
  id: string
  role: 'contractor' | 'worker'
  name: string
  city: string | null
  phone_number: string | null
  bio: string | null
  years_experience: number
  trade: string | null
  specialisations: string[]
  service_cities: string[]
  avg_rating: number
  review_count: number
  projects_completed: number
  completed_projects: CompletedProject[]
  reviews: ReviewRow[]
}

const BRAND = '#E8590C'

export default function ContractorProfileScreen() {
  const router = useRouter()
  const { id, projectId } = useLocalSearchParams<{ id: string; projectId?: string }>()
  const { user, profile, loading: authLoading } = useSessionState()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ContractorApiResponse | null>(null)
  const [inviting, setInviting] = useState(false)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [quality, setQuality] = useState(5)
  const [responseScore, setResponseScore] = useState(5)
  const [behavior, setBehavior] = useState(5)
  const [timeliness, setTimeliness] = useState(5)
  const [workmanship, setWorkmanship] = useState(5)
  const [reviewComment, setReviewComment] = useState('')

  const showInviteBar = profile?.role === 'customer'
  const contractorId = Array.isArray(id) ? id[0] : id
  const reviewProjectId = Array.isArray(projectId) ? projectId[0] : projectId

  const load = useCallback(async () => {
    if (!contractorId) return
    setLoading(true)
    try {
      const json = await apiGet<ContractorApiResponse>(`/api/contractors/${encodeURIComponent(contractorId)}`)
      setData(json)
    } catch (e) {
      Alert.alert('Profile', e instanceof Error ? e.message : 'Failed to load')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [contractorId])

  useEffect(() => {
    void load()
  }, [load])

  const sendInvite = async () => {
    if (!data || !user) return
    Alert.alert(
      'Send invite?',
      `Do you want to invite ${data.name} for work?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Invite',
          onPress: () => {
            void (async () => {
              setInviting(true)
              try {
                const raw = await AsyncStorage.getItem(PROJECT_DRAFT_STORAGE_KEY)
                const draft = raw
                  ? (JSON.parse(raw) as ProjectDraft)
                  : ({
                      project_name: `Work with ${data.name}`,
                      address: 'Address to be updated',
                      city: data.city ?? 'City',
                      pincode: '000000',
                    } as ProjectDraft)
                const payload = await apiPost<{ success?: boolean; error?: string; projectId?: string }>('/api/invitations/send', {
                  contractor_id: data.id,
                  project_name: draft.project_name,
                  address: draft.address,
                  city: draft.city,
                  pincode: draft.pincode,
                  project_type: draft.project_type,
                  estimated_budget: draft.estimated_budget,
                  start_date: draft.start_date,
                })
                if (!payload.success) throw new Error(payload.error ?? 'Failed to send')
                await AsyncStorage.removeItem(PROJECT_DRAFT_STORAGE_KEY)
                Alert.alert('Invitation sent!', 'The worker/contractor will be notified.')
                router.replace('/(app)/(tabs)')
              } catch (e) {
                Alert.alert('Invite', e instanceof Error ? e.message : 'Failed')
              } finally {
                setInviting(false)
              }
            })()
          },
        },
      ]
    )
  }

  const submitReview = async () => {
    if (!data || !reviewProjectId) {
      Alert.alert('Missing project', 'Open this profile from invitations sent to add review.')
      return
    }
    try {
      setReviewSubmitting(true)
      await apiPost('/api/reviews/create', {
        project_id: reviewProjectId,
        reviewee_id: data.id,
        quality,
        response: responseScore,
        behavior,
        timeliness,
        workmanship,
        comment: reviewComment,
      })
      Alert.alert('Thanks!', 'Review submitted successfully.')
      setReviewComment('')
      await load()
    } catch (e) {
      Alert.alert('Review', e instanceof Error ? e.message : 'Unable to submit review')
    } finally {
      setReviewSubmitting(false)
    }
  }

  if (authLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FAFAFA' }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BRAND} />
        </View>
      </SafeAreaView>
    )
  }

  if (!user) return <Redirect href="/(auth)/login" />
  if (!contractorId) return null

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FAFAFA' }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BRAND} />
        </View>
      </SafeAreaView>
    )
  }

  if (!data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FAFAFA' }} edges={['top']}>
        <View style={{ padding: 16 }}>
          <Text>Contractor not found</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAFAFA' }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: showInviteBar ? 120 : 32 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, backgroundColor: BRAND }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                borderWidth: 3,
                borderColor: '#FFFFFF',
                backgroundColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 28, fontWeight: '800', color: '#FFFFFF' }}>{getInitials(data.name)}</Text>
            </View>
            <View style={{ flex: 1, paddingBottom: 4 }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#FFFFFF' }}>{data.name}</Text>
              <Text style={{ marginTop: 4, fontSize: 14, color: 'rgba(255,255,255,0.9)' }}>
                {data.city ?? '—'} · {data.years_experience} years
              </Text>
              <Text style={{ marginTop: 4, fontSize: 13, color: 'rgba(255,255,255,0.95)', fontWeight: '700' }}>
                {data.role === 'contractor' ? 'Contractor' : data.trade ?? 'Worker'}
              </Text>
              <Text style={{ marginTop: 3, fontSize: 13, color: 'rgba(255,255,255,0.95)' }}>
                {data.phone_number ?? 'Phone not available'}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
                {starText(data.avg_rating)} {data.avg_rating.toFixed(1)} ({data.review_count})
              </Text>
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
          {data.specialisations.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {data.specialisations.map((s) => (
                <View key={s} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: BRAND }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>{s}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {data.bio ? (
            <View style={{ marginBottom: 20, borderRadius: 12, backgroundColor: '#FFFFFF', padding: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 8 }}>About</Text>
              <Text style={{ fontSize: 14, color: '#6B7280', lineHeight: 20 }}>{data.bio}</Text>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
            <StatCard label="Projects" value={String(data.projects_completed)} />
            <StatCard label="Rating" value={data.avg_rating.toFixed(1)} />
            <StatCard label="Cities" value={String(data.service_cities.length)} />
          </View>

          <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 12 }}>Completed Projects</Text>
          {data.completed_projects.length === 0 ? (
            <Text style={{ color: '#6B7280', marginBottom: 20 }}>No completed projects yet</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
              {data.completed_projects.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => router.push({ pathname: '/projects/[id]', params: { id: p.id } })}
                  style={{ width: '48%', borderRadius: 12, backgroundColor: '#FFFFFF', overflow: 'hidden', borderWidth: 1, borderColor: '#F3F4F6' }}
                >
                  {p.thumbnail ? (
                    <Image source={{ uri: p.thumbnail }} style={{ width: '100%', height: 100 }} resizeMode="cover" />
                  ) : (
                    <View style={{ height: 100, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#9CA3AF' }}>—</Text>
                    </View>
                  )}
                  <View style={{ padding: 10 }}>
                    <Text numberOfLines={2} style={{ fontWeight: '700', color: '#111827' }}>
                      {p.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{p.city}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 12 }}>Reviews ({data.review_count})</Text>
          {data.reviews.length === 0 ? (
            <Text style={{ color: '#6B7280' }}>No reviews yet</Text>
          ) : (
            data.reviews.map((r) => (
              <View key={r.id} style={{ marginBottom: 12, borderRadius: 12, backgroundColor: '#FFFFFF', padding: 14, borderWidth: 1, borderColor: '#F3F4F6' }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>{getInitials(r.reviewer_name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: '#111827' }}>{r.reviewer_name}</Text>
                    <Text style={{ fontSize: 12, color: '#B45309', marginTop: 2 }}>{starText(Number(r.rating))}</Text>
                    <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>{relativeMonths(r.created_at)}</Text>
                    {r.comment ? <Text style={{ marginTop: 8, fontSize: 14, color: '#4B5563' }}>{r.comment}</Text> : null}
                  </View>
                </View>
              </View>
            ))
          )}

          {profile?.role === 'customer' && reviewProjectId ? (
            <View style={{ marginTop: 20, borderRadius: 12, backgroundColor: '#FFFFFF', padding: 14, borderWidth: 1, borderColor: '#F3F4F6' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }}>Rate this professional</Text>
              <ScoreRow label="Quality of work" value={quality} onChange={setQuality} />
              <ScoreRow label="Response time" value={responseScore} onChange={setResponseScore} />
              <ScoreRow label="Behavior" value={behavior} onChange={setBehavior} />
              <ScoreRow label="Timeliness" value={timeliness} onChange={setTimeliness} />
              <ScoreRow label="Workmanship" value={workmanship} onChange={setWorkmanship} />
              <TextInput
                value={reviewComment}
                onChangeText={setReviewComment}
                placeholder="Additional comments (optional)"
                style={{ marginTop: 8, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, color: '#374151' }}
              />
              <TouchableOpacity
                onPress={() => void submitReview()}
                disabled={reviewSubmitting}
                style={{ marginTop: 10, minHeight: 44, borderRadius: 10, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', opacity: reviewSubmitting ? 0.7 : 1 }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{reviewSubmitting ? 'Submitting...' : 'Submit Review'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {showInviteBar ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: 16,
            backgroundColor: '#FFFFFF',
            borderTopWidth: 1,
            borderTopColor: '#E5E7EB',
          }}
        >
          <TouchableOpacity
            onPress={() => void sendInvite()}
            disabled={inviting}
            style={{ minHeight: 52, borderRadius: 14, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>{inviting ? 'Sending…' : `Invite ${data.name}`}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  )
}

function ScoreRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ fontSize: 12, color: '#4B5563' }}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => onChange(n)}>
            <Text style={{ fontSize: 18, color: n <= value ? '#E8590C' : '#D1D5DB' }}>★</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, borderRadius: 12, backgroundColor: '#FFFFFF', padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6' }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: BRAND }}>{value}</Text>
      <Text style={{ marginTop: 6, fontSize: 11, fontWeight: '600', color: '#6B7280', textAlign: 'center' }}>{label}</Text>
    </View>
  )
}
