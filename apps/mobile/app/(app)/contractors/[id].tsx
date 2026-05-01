import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  formatPhoneIndian,
  formatReviewsSectionCount,
  METRIC_CONFIG,
  parseReviewComment,
  reviewListingTimeLabel,
  reviewMetricScore,
} from '@/lib/utils'
import { ReviewStarRow } from '@/components/review-star-row'
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
  profile_photo_url: string | null
  city: string | null
  pincode: string | null
  phone_number: string | null
  bio: string | null
  years_experience: number
  trade: string | null
  specialisations: string[]
  service_cities: string[]
  avg_rating: number
  review_count: number
  profile_views: number
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
  professional_images: Array<{
    id: string
    image_url: string
    created_at: string
  }>
}

const BRAND = '#D85A30'
const CHARCOAL = '#2C2C2A'
const FG = '#2C2C2A'
const MUTED = '#78716C'
const PAGE_BG = '#F2EDE8'
const CARD_BG = '#FFFFFF'
const CARD_BORDER = '#E8DDD4'
const REVIEW_CARD_HEADER_BG = '#4a423c'
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
  const [activeGalleryImageUri, setActiveGalleryImageUri] = useState<string | null>(null)
  const [reviewsY, setReviewsY] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const reviewListClockMs = useMemo(() => Date.now(), [])

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
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE_BG }} edges={['top', 'left', 'right']}>
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
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE_BG }} edges={['top', 'left', 'right']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BRAND} />
        </View>
      </SafeAreaView>
    )
  }

  if (!data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE_BG }} edges={['top', 'left', 'right']}>
        <View style={{ padding: 16 }}>
          <Text>Contractor not found</Text>
        </View>
      </SafeAreaView>
    )
  }

  const scrollToReviews = () => {
    if (!reviewsY) return
    scrollRef.current?.scrollTo({ y: Math.max(reviewsY - 24, 0), animated: true })
  }

  const heroCoverUri = data.professional_images[0]?.image_url ?? null

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE_BG }} edges={[]}>
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
        ref={scrollRef}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: showInviteBar ? 120 : 32 }}
      >
        <View style={{ position: 'relative', height: 130 }}>
          {heroCoverUri ? (
            <Image source={{ uri: heroCoverUri }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" />
          ) : (
            <>
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#3D2A20' }} />
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(216,90,48,0.2)' }} />
            </>
          )}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.38)' }} />
          {data.avg_rating >= 4.5 ? (
            <View style={{ position: 'absolute', top: 10, right: 12, backgroundColor: BRAND, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFFFFF' }}>⭐ Top rated</Text>
            </View>
          ) : data.projects_completed >= 5 ? (
            <View style={{ position: 'absolute', top: 10, right: 12, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 9, fontWeight: '600', color: '#FFFFFF' }}>{`${data.projects_completed} projects`}</Text>
            </View>
          ) : null}
          <View style={{ position: 'absolute', bottom: 10, left: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.5)', backgroundColor: BRAND, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              {data.profile_photo_url ? (
                <Image source={{ uri: data.profile_photo_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>{data.name?.trim()?.charAt(0)?.toUpperCase() || 'U'}</Text>
              )}
            </View>
            <View>
              <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFFFFF' }}>{data.name}</Text>
              <View style={{ marginTop: 4, alignSelf: 'flex-start', backgroundColor: BRAND, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFFFFF', textTransform: 'capitalize' }}>{data.role}</Text>
              </View>
            </View>
          </View>
          <View style={{ position: 'absolute', bottom: 14, right: 12, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: '#F59E0B' }}>{`★ ${data.avg_rating.toFixed(1)}`}</Text>
          </View>
        </View>

        <View style={{ backgroundColor: CARD_BG, flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: CARD_BORDER }}>
          <TouchableOpacity onPress={scrollToReviews} style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: BRAND }}>{data.avg_rating.toFixed(1)}</Text>
            <Text style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>Rating</Text>
          </TouchableOpacity>
          <View style={{ width: 0.5, backgroundColor: CARD_BORDER }} />
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: BRAND }}>{data.projects_completed}</Text>
            <Text style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>Done</Text>
          </View>
          <View style={{ width: 0.5, backgroundColor: CARD_BORDER }} />
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: BRAND }}>{data.profile_views ?? 0}</Text>
            <Text style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>Views</Text>
          </View>
          <View style={{ width: 0.5, backgroundColor: CARD_BORDER }} />
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: BRAND }}>{`${data.years_experience}y`}</Text>
            <Text style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>Exp</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingVertical: 14, backgroundColor: CARD_BG, borderBottomWidth: 0.5, borderBottomColor: CARD_BORDER }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: CHARCOAL, lineHeight: 22 }}>{`📍 ${data.city ?? '—'} · ${data.pincode ?? '—'}`}</Text>
          <Text style={{ marginTop: 10, fontSize: 15, fontWeight: '700', color: CHARCOAL, lineHeight: 22 }}>{`📞 ${formatPhoneIndian(data.phone_number)}`}</Text>
          <Text style={{ marginTop: 10, fontSize: 15, fontWeight: '700', color: CHARCOAL, lineHeight: 22 }}>{`👷 ${data.years_experience} yrs experience`}</Text>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          {data.specialisations.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {data.specialisations.map((s) => (
                <View key={s} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: BRAND }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>{s}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {data.bio ? (
            <View style={{ marginBottom: 16, borderRadius: 16, backgroundColor: CARD_BG, padding: 16, borderWidth: 0.5, borderColor: CARD_BORDER }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: FG, marginBottom: 8 }}>About</Text>
              <Text style={{ fontSize: 14, color: MUTED, lineHeight: 20 }}>{data.bio}</Text>
            </View>
          ) : null}

          {data.role === 'worker' && data.trade ? (
            <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: MUTED }}>Trade:</Text>
              <View style={{ backgroundColor: '#E0E7FF', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontWeight: '700', color: '#3730A3', fontSize: 11 }}>{data.trade}</Text>
              </View>
            </View>
          ) : null}

          <Text style={{ fontSize: 9, fontWeight: '700', color: '#A8A29E', letterSpacing: 0.6, marginBottom: 10 }}>PROJECTS</Text>
          <ProjectList
            projects={[...(data.ongoing_projects ?? []), ...data.completed_projects]}
            emptyText="No projects available right now"
            onPressProject={(project) => router.push({ pathname: '/projects/[id]/images', params: { id: project.id } })}
          />

          <View style={{ marginTop: 12, backgroundColor: CARD_BG, borderRadius: 16, borderWidth: 0.5, borderColor: CARD_BORDER, overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: PAGE_BG, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: '#A8A29E', letterSpacing: 0.6 }}>PORTFOLIO</Text>
              <Text style={{ fontSize: 9, color: BRAND, fontWeight: '700' }}>{`${data.professional_images.length}/6`}</Text>
            </View>
            <View style={{ padding: 10, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 }}>
              {data.professional_images.map((item) => (
                <View
                  key={item.id}
                  style={{
                    width: '32%',
                    height: 100,
                    borderRadius: 10,
                    overflow: 'hidden',
                    backgroundColor: PAGE_BG,
                    borderWidth: 0.5,
                    borderColor: CARD_BORDER,
                  }}
                >
                  <TouchableOpacity onPress={() => setActiveGalleryImageUri(item.image_url)} activeOpacity={0.9}>
                    <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  </TouchableOpacity>
                </View>
              ))}
              {data.professional_images.length === 0 ? (
                <Text style={{ paddingHorizontal: 4, paddingBottom: 8, color: MUTED, fontSize: 13 }}>No profile images yet.</Text>
              ) : null}
            </View>
          </View>

          <View
            onLayout={(e) => {
              setReviewsY(e.nativeEvent.layout.y)
            }}
            style={{
              marginTop: 12,
              backgroundColor: PAGE_BG,
              borderRadius: 16,
              borderWidth: 0.5,
              borderColor: CARD_BORDER,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 0.5,
                borderBottomColor: 'rgba(232,221,212,0.85)',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#57534E', letterSpacing: 0.6 }}>REVIEWS</Text>
              <Text style={{ fontSize: 11, color: BRAND, fontWeight: '700' }}>
                {formatReviewsSectionCount(data.review_count)}
              </Text>
            </View>
            {data.reviews.length === 0 ? (
              <Text style={{ paddingHorizontal: 16, paddingVertical: 14, color: MUTED, fontSize: 13 }}>No reviews yet.</Text>
            ) : (
              <View style={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: 12, gap: 8 }}>
              {data.reviews.map((r) => {
                const parsed = parseReviewComment(r.comment)
                const reviewerLabel = (r.reviewer_name ?? '').trim() || 'Customer'
                const initial = reviewerLabel.charAt(0).toUpperCase()
                const ratingNum = Number(r.rating)
                return (
                  <View
                    key={r.id}
                    style={{
                      borderRadius: 14,
                      overflow: 'hidden',
                      borderWidth: 0.5,
                      borderColor: '#E8DDD4',
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    <View
                      style={{
                        backgroundColor: REVIEW_CARD_HEADER_BG,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        borderTopLeftRadius: 14,
                        borderTopRightRadius: 14,
                      }}
                    >
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 15,
                          backgroundColor: '#D85A30',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          borderWidth: 2,
                          borderColor: 'rgba(255,255,255,0.18)',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>{initial}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }} numberOfLines={1}>
                          {reviewerLabel}
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <ReviewStarRow rating={ratingNum} />
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>
                            {ratingNum.toFixed(1)}
                          </Text>
                          <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>·</Text>
                          <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)' }}>
                            {reviewListingTimeLabel(r.created_at, reviewListClockMs)}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 6,
                        backgroundColor: '#FFFFFF',
                        borderBottomWidth: parsed.comment || parsed.overallComment ? 0.5 : 0,
                        borderBottomColor: '#F2EDE8',
                      }}
                    >
                      {METRIC_CONFIG.map((metric) => {
                        const score = reviewMetricScore(parsed, metric.key)
                        if (score === null) return null
                        const isFull = score === 5
                        return (
                          <View
                            key={metric.key}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 3,
                              backgroundColor: isFull ? '#F0FDF4' : '#FBF0EB',
                              borderWidth: 0.5,
                              borderColor: isFull ? '#BBF7D0' : '#F5DDD4',
                              borderRadius: 20,
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                            }}
                          >
                            <Text style={{ fontSize: 10 }}>{metric.emoji}</Text>
                            <Text style={{ fontSize: 9, fontWeight: '600', color: '#2C2C2A' }}>{metric.label}</Text>
                            <Text style={{ fontSize: 9, fontWeight: '800', color: isFull ? '#166534' : '#D85A30' }}>
                              {score}/5
                            </Text>
                          </View>
                        )
                      })}
                    </View>
                    {parsed.comment || parsed.overallComment ? (
                      <View style={{ paddingHorizontal: 10, paddingBottom: 10, paddingTop: 0, backgroundColor: '#FFFFFF' }}>
                        <View
                          style={{
                            backgroundColor: '#FBF0EB',
                            borderRadius: 10,
                            paddingVertical: 10,
                            paddingHorizontal: 10,
                            borderLeftWidth: 3,
                            borderLeftColor: '#D85A30',
                          }}
                        >
                          <Text style={{ fontSize: 11, color: '#78716C', lineHeight: 17, fontStyle: 'italic' }}>
                            {`"${parsed.comment ?? parsed.overallComment}"`}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                )
              })}
              </View>
            )}
          </View>

          {profile?.role === 'customer' && reviewProjectId ? (
            <View style={{ marginTop: 16, marginBottom: 8, borderRadius: 16, backgroundColor: CARD_BG, padding: 14, borderWidth: 0.5, borderColor: CARD_BORDER }}>
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
                    backgroundColor: '#D85A30',
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
      <Modal
        visible={Boolean(activeGalleryImageUri)}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveGalleryImageUri(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onPress={() => setActiveGalleryImageUri(null)}
        >
          {activeGalleryImageUri ? (
            <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420 }}>
              <Image source={{ uri: activeGalleryImageUri }} style={{ width: '100%', height: 460, borderRadius: 16 }} resizeMode="contain" />
              <TouchableOpacity
                onPress={() => setActiveGalleryImageUri(null)}
                style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 18, lineHeight: 20 }}>×</Text>
              </TouchableOpacity>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
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
            <Text style={{ fontSize: 18, color: n <= value ? '#D85A30' : '#D1D5DB', opacity: disabled ? 0.6 : 1 }}>★</Text>
          </Pressable>
        ))}
      </View>
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
              borderColor: '#F2EDE8',
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
              <View style={{ height: 132, backgroundColor: '#F2EDE8', alignItems: 'center', justifyContent: 'center' }}>
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
                backgroundColor: index === activeIndex ? '#D85A30' : '#D1D5DB',
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}
