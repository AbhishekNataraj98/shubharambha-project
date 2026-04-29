import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { apiGet, apiPost } from '@/lib/api'
import { PROJECT_DRAFT_STORAGE_KEY, type ProjectDraft } from '@/lib/projectDraft'
import { KeyboardSafeView } from '@/lib/keyboardSafe'
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
  projects_ongoing: number
  completed_projects: CompletedProject[]
  ongoing_projects: CompletedProject[]
  invite_limit: number
  active_projects_with_customer: Array<{ id: string; name: string; status: string }>
  pending_invitations_with_professional: Array<{ id: string; subject: string; project_id: string | null }>
  has_pending_invitation: boolean
  invite_limit_reached: boolean
  invite_lock_message: string | null
  my_review_for_project: {
    id: string
    rating: number
    comment: string | null
    project_id: string
    reviewer_id: string
  } | null
  reviews: ReviewRow[]
}

const BRAND = '#E8590C'
/** Cream-orange band—much lighter than stack header (#E8590C) for clear separation */
const HERO_BG = '#FFFCF8'
const HERO_TOP_SHIMMER = '#FFF3E8'
const HERO_BOTTOM_RULE = '#FFEAD8'

function normalizeId(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

function parseStoredReview(comment: string | null, fallbackRating: number) {
  const parseScore = (label: string): number | null => {
    const match = comment?.match(new RegExp(`${label}:\\s*(\\d+(?:\\.\\d+)?)\\/5`, 'i'))
    if (!match) return null
    const value = Number(match[1])
    return Number.isFinite(value) ? Math.max(1, Math.min(5, Math.round(value))) : null
  }

  const fallback = Math.max(1, Math.min(5, Math.round(fallbackRating || 0)))
  const parsedComment = comment?.match(/Comment:\s*(.*)$/i)?.[1]?.trim() ?? ''

  return {
    quality: parseScore('Quality') ?? fallback,
    response: parseScore('Response') ?? fallback,
    behavior: parseScore('Behavior') ?? fallback,
    timeliness: parseScore('Timeliness') ?? fallback,
    workmanship: parseScore('Workmanship') ?? fallback,
    comment: parsedComment,
  }
}

export default function ContractorProfileScreen() {
  const router = useRouter()
  const { id, projectId } = useLocalSearchParams<{ id: string; projectId?: string }>()
  const { user, profile, loading: authLoading } = useSessionState()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ContractorApiResponse | null>(null)
  const [inviting, setInviting] = useState(false)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [quality, setQuality] = useState(0)
  const [responseScore, setResponseScore] = useState(0)
  const [behavior, setBehavior] = useState(0)
  const [timeliness, setTimeliness] = useState(0)
  const [workmanship, setWorkmanship] = useState(0)
  const [reviewComment, setReviewComment] = useState('')
  const [isEditingReview, setIsEditingReview] = useState(false)
  const [hasReviewLocked, setHasReviewLocked] = useState(false)
  const [showInviteLockedModal, setShowInviteLockedModal] = useState(false)

  const showInviteBar = profile?.role === 'customer'
  const contractorId = Array.isArray(id) ? id[0] : id
  const reviewProjectId = Array.isArray(projectId) ? projectId[0] : projectId
  const normalizedReviewProjectId = normalizeId(reviewProjectId)
  const normalizedUserId = normalizeId(user?.id)
  const hasExistingReviewForProject =
    Boolean(normalizedReviewProjectId && normalizedUserId) &&
    Boolean(data?.my_review_for_project) ||
    Boolean(
      data?.reviews.some(
        (review) =>
          normalizeId(review.reviewer_id) === normalizedUserId &&
          normalizeId(review.project_id) === normalizedReviewProjectId
      )
    )
  const existingReviewForProject =
    data?.my_review_for_project ??
    (normalizedReviewProjectId && normalizedUserId && data
      ? data.reviews.find(
          (review) =>
            normalizeId(review.reviewer_id) === normalizedUserId &&
            normalizeId(review.project_id) === normalizedReviewProjectId
        ) ?? null
      : null)
  const reviewLocked = hasExistingReviewForProject || hasReviewLocked

  const load = useCallback(async () => {
    if (!contractorId) return
    setLoading(true)
    try {
      const querySuffix = reviewProjectId ? `?projectId=${encodeURIComponent(reviewProjectId)}` : ''
      const json = await apiGet<ContractorApiResponse>(`/api/contractors/${encodeURIComponent(contractorId)}${querySuffix}`)
      setData(json)
    } catch (e) {
      Alert.alert('Profile', e instanceof Error ? e.message : 'Failed to load')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [contractorId, reviewProjectId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!existingReviewForProject) return
    const parsed = parseStoredReview(existingReviewForProject.comment, Number(existingReviewForProject.rating))
    setQuality(parsed.quality)
    setResponseScore(parsed.response)
    setBehavior(parsed.behavior)
    setTimeliness(parsed.timeliness)
    setWorkmanship(parsed.workmanship)
    setReviewComment(parsed.comment)
  }, [existingReviewForProject])

  useEffect(() => {
    setHasReviewLocked(hasExistingReviewForProject)
    if (hasExistingReviewForProject) setIsEditingReview(false)
  }, [hasExistingReviewForProject])

  const sendInvite = async () => {
    if (!data || !user) return
    if (data.invite_limit_reached) {
      setShowInviteLockedModal(true)
      return
    }
    if (!reviewProjectId) {
      router.push({
        pathname: '/projects/new',
        params: {
          inviteTo: data.id,
          inviteToName: data.name,
          inviteToCity: data.city ?? '',
        },
      })
      return
    }
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
    const alreadyReviewed = Boolean(
      data.reviews.some(
        (review) =>
          normalizeId(review.reviewer_id) === normalizedUserId &&
          normalizeId(review.project_id) === normalizedReviewProjectId
      )
    )
    if (alreadyReviewed && !isEditingReview) {
      setHasReviewLocked(true)
      Alert.alert('Review already submitted', 'Click Edit existing review to modify your previous review.')
      return
    }
    if (reviewLocked && !isEditingReview) {
      Alert.alert('Review already submitted', 'Click Edit existing review to modify your previous review.')
      return
    }
    if (quality < 1 || responseScore < 1 || behavior < 1 || timeliness < 1 || workmanship < 1) {
      Alert.alert('Rating required', 'Please select at least 1 star for every rating category.')
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
      setHasReviewLocked(true)
      setIsEditingReview(false)
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

  const activeCitiesCount = new Set((data.ongoing_projects ?? []).map((project) => (project.city ?? '').trim()).filter(Boolean)).size

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAFAFA' }} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerBackVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => {
                if (reviewProjectId) {
                  if (router.canGoBack()) {
                    router.back()
                    return
                  }
                  router.replace({ pathname: '/projects/[id]', params: { id: reviewProjectId } })
                  return
                }
                router.back()
              }}
              style={{ minHeight: 40, minWidth: 40, alignItems: 'center', justifyContent: 'center' }}
              accessibilityLabel="Back"
            >
              <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '700' }}>‹</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <KeyboardSafeView iosHeaderOffset={44}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: showInviteBar ? 120 : 32 }}
      >
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 20,
            backgroundColor: HERO_BG,
            borderTopWidth: 1,
            borderTopColor: HERO_TOP_SHIMMER,
            borderBottomWidth: 1,
            borderBottomColor: HERO_BOTTOM_RULE,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                borderWidth: 2,
                borderColor: 'rgba(232, 89, 12, 0.35)',
                backgroundColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 28, fontWeight: '800', color: BRAND }}>{getInitials(data.name)}</Text>
            </View>
            <View style={{ flex: 1, paddingBottom: 4 }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#111827' }}>{data.name}</Text>
              <Text style={{ marginTop: 4, fontSize: 14, color: '#57534E' }}>
                {data.city ?? '—'} · {data.years_experience} years
              </Text>
              <Text style={{ marginTop: 4, fontSize: 13, color: BRAND, fontWeight: '700' }}>
                {data.role === 'contractor' ? 'Contractor' : data.trade ?? 'Worker'}
              </Text>
              <Text style={{ marginTop: 3, fontSize: 13, color: '#6B7280' }}>
                {data.phone_number ?? 'Phone not available'}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 14, fontWeight: '700', color: '#111827' }}>
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
            <StatCard label="Completed Projects" value={String(data.projects_completed)} />
            <StatCard label="Ongoing" value={String(data.projects_ongoing ?? 0)} />
            <StatCard label="Rating" value={data.avg_rating.toFixed(1)} />
            <StatCard label="Cities" value={String(activeCitiesCount)} />
          </View>

          <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 12 }}>Projects</Text>
          <ProjectList
            projects={[...(data.ongoing_projects ?? []), ...data.completed_projects]}
            emptyText="No projects available right now"
            onPressProject={(project) => router.push({ pathname: '/projects/[id]/images', params: { id: project.id } })}
          />

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
              {reviewLocked ? (
                <Text style={{ marginTop: 6, fontSize: 12, color: '#6B7280' }}>
                  You already reviewed this professional for this project.
                </Text>
              ) : null}
              {reviewLocked && !isEditingReview ? (
                <TouchableOpacity
                  onPress={() => setIsEditingReview(true)}
                  style={{
                    marginTop: 8,
                    alignSelf: 'flex-start',
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: BRAND,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ color: BRAND, fontSize: 12, fontWeight: '700' }}>Edit existing review</Text>
                </TouchableOpacity>
              ) : null}
              <ScoreRow label="Quality of work" value={quality} onChange={setQuality} disabled={reviewLocked && !isEditingReview} />
              <ScoreRow label="Response time" value={responseScore} onChange={setResponseScore} disabled={reviewLocked && !isEditingReview} />
              <ScoreRow label="Behavior" value={behavior} onChange={setBehavior} disabled={reviewLocked && !isEditingReview} />
              <ScoreRow label="Timeliness" value={timeliness} onChange={setTimeliness} disabled={reviewLocked && !isEditingReview} />
              <ScoreRow label="Workmanship" value={workmanship} onChange={setWorkmanship} disabled={reviewLocked && !isEditingReview} />
              <TextInput
                value={reviewComment}
                onChangeText={setReviewComment}
                editable={!(reviewLocked && !isEditingReview)}
                placeholder="Additional comments (optional)"
                style={{
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  fontSize: 12,
                  color: '#374151',
                  backgroundColor: reviewLocked && !isEditingReview ? '#F9FAFB' : '#FFFFFF',
                }}
              />
              <TouchableOpacity
                onPress={() => void submitReview()}
                disabled={reviewSubmitting || (reviewLocked && !isEditingReview)}
                style={{
                  marginTop: 10,
                  minHeight: 44,
                  borderRadius: 10,
                  backgroundColor: BRAND,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: reviewSubmitting || (reviewLocked && !isEditingReview) ? 0.7 : 1,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                  {reviewSubmitting ? 'Submitting...' : reviewLocked ? (isEditingReview ? 'Update Review' : 'Review submitted') : 'Submit Review'}
                </Text>
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
            style={{
              minHeight: 52,
              borderRadius: 14,
              backgroundColor: data.invite_limit_reached ? '#9CA3AF' : BRAND,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>
              {inviting ? 'Sending…' : data.invite_limit_reached ? `Invite Locked` : `Invite ${data.name}`}
            </Text>
          </TouchableOpacity>
          <Text style={{ marginTop: 8, fontSize: 12, color: '#6B7280', textAlign: 'center' }}>
            {data.has_pending_invitation
              ? `Pending invitation with this ${data.role === 'worker' ? 'worker' : 'contractor'}`
              : `Active projects with this ${data.role === 'worker' ? 'worker' : 'contractor'}: ${data.active_projects_with_customer.length}/${data.invite_limit}`}
          </Text>
        </View>
      ) : null}
      {showInviteBar && data?.invite_limit_reached ? (
        <Modal visible={showInviteLockedModal} transparent animationType="fade" onRequestClose={() => setShowInviteLockedModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'center', paddingHorizontal: 22 }}>
            <View style={{ borderRadius: 20, backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
              <View style={{ padding: 18, backgroundColor: '#FFF7ED', borderBottomWidth: 1, borderBottomColor: '#FED7AA' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#9A3412', letterSpacing: 0.2 }}>INVITATION LIMIT REACHED</Text>
                <Text style={{ marginTop: 8, fontSize: 17, fontWeight: '800', color: '#111827', lineHeight: 24 }}>
                  {data.invite_lock_message ?? 'Active project limit reached. Complete one existing project to send a new invite.'}
                </Text>
              </View>

              <View style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#6B7280', marginBottom: 10 }}>
                  {data.has_pending_invitation
                    ? `PENDING INVITATIONS (${data.pending_invitations_with_professional.length})`
                    : `ACTIVE PROJECTS (${data.active_projects_with_customer.length}/${data.invite_limit})`}
                </Text>

                {data.has_pending_invitation
                  ? (data.pending_invitations_with_professional ?? []).map((invite) => (
                      <View
                        key={invite.id}
                        style={{
                          borderWidth: 1,
                          borderColor: '#FDE68A',
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          paddingVertical: 11,
                          marginBottom: 10,
                          backgroundColor: '#FFFBEB',
                        }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }} numberOfLines={2}>
                          {invite.subject.replace(/^Project invitation \[[^\]]+\]:\s*/i, '')}
                        </Text>
                        <Text style={{ marginTop: 4, fontSize: 12, fontWeight: '600', color: '#B45309' }}>
                          Awaiting contractor/worker response
                        </Text>
                      </View>
                    ))
                  : (data.active_projects_with_customer ?? []).length > 0
                    ? (data.active_projects_with_customer ?? []).map((project) => (
                    <Pressable
                      key={project.id}
                      onPress={() => {
                        setShowInviteLockedModal(false)
                        router.push({ pathname: '/projects/[id]', params: { id: project.id } })
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: '#E5E7EB',
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 11,
                        marginBottom: 10,
                        backgroundColor: '#F9FAFB',
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }} numberOfLines={1}>
                        {project.name}
                      </Text>
                      <Text style={{ marginTop: 4, fontSize: 12, fontWeight: '600', color: '#2563EB' }}>Open project details</Text>
                    </Pressable>
                    ))
                    : null}
                {!data.has_pending_invitation && (data.active_projects_with_customer ?? []).length === 0 ? (
                  <Text style={{ color: '#6B7280', fontSize: 13 }}>No active projects found.</Text>
                ) : null}
              </View>

              <View style={{ paddingHorizontal: 18, paddingBottom: 18, paddingTop: 6 }}>
                <TouchableOpacity
                  onPress={() => setShowInviteLockedModal(false)}
                  style={{
                    minHeight: 46,
                    borderRadius: 12,
                    backgroundColor: '#E8590C',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' }}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
      </KeyboardSafeView>
    </SafeAreaView>
  )
}

function ScoreRow({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View>
        <Text style={{ fontSize: 12, color: '#4B5563' }}>{label}</Text>
        {value === 0 ? <Text style={{ marginTop: 2, fontSize: 11, color: '#9CA3AF' }}>Not rated yet</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => onChange(n)} disabled={disabled}>
            <Text style={{ fontSize: 18, color: n <= value ? '#E8590C' : '#D1D5DB', opacity: disabled ? 0.6 : 1 }}>★</Text>
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

function ProjectList({
  projects,
  emptyText,
  onPressProject,
}: {
  projects: CompletedProject[]
  emptyText: string
  onPressProject: (project: CompletedProject) => void
}) {
  const [activeIndex, setActiveIndex] = useState(0)
  if (projects.length === 0) {
    return <Text style={{ color: '#6B7280', marginBottom: 20 }}>{emptyText}</Text>
  }

  return (
    <View
      style={{
        marginBottom: 24,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#FDE8D9',
        backgroundColor: '#FFF8F3',
        paddingVertical: 10,
        paddingLeft: 10,
      }}
    >
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={240}
        snapToAlignment="start"
        onMomentumScrollEnd={(event) => {
          const x = event.nativeEvent.contentOffset.x
          const idx = Math.round(x / 240)
          setActiveIndex(Math.max(0, Math.min(projects.length - 1, idx)))
        }}
        contentContainerStyle={{ paddingRight: 12, gap: 12, paddingBottom: 4 }}
      >
        {projects.map((project) => (
          <TouchableOpacity
            key={project.id}
            onPress={() => onPressProject(project)}
            style={{
              width: 228,
              borderRadius: 16,
              backgroundColor: '#FFFFFF',
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: '#F3F4F6',
              shadowColor: '#000',
              shadowOpacity: 0.08,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: 2,
            }}
          >
            <View
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                zIndex: 2,
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 3,
                backgroundColor: project.status === 'completed' ? '#ECFDF3' : '#EFF6FF',
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: project.status === 'completed' ? '#166534' : '#1D4ED8',
                }}
              >
                {project.status === 'completed' ? 'Completed' : 'Ongoing'}
              </Text>
            </View>
            {project.thumbnail ? (
              <View>
                <Image source={{ uri: project.thumbnail }} style={{ width: '100%', height: 132 }} resizeMode="cover" />
                <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 34, backgroundColor: 'rgba(0,0,0,0.28)', justifyContent: 'center', paddingHorizontal: 10 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>View Photos →</Text>
                </View>
              </View>
            ) : (
              <View style={{ height: 132, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 30 }}>🏗️</Text>
              </View>
            )}
            <View style={{ padding: 12 }}>
              <Text numberOfLines={2} style={{ fontWeight: '800', color: '#111827', fontSize: 14 }}>
                {project.name}
              </Text>
              <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 5 }}>{project.city}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {projects.length > 1 ? (
        <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {projects.map((project, index) => (
            <View
              key={`${project.id}-dot`}
              style={{
                width: index === activeIndex ? 16 : 6,
                height: 6,
                borderRadius: 999,
                backgroundColor: index === activeIndex ? '#E8590C' : '#D1D5DB',
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}
