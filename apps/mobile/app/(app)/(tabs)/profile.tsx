import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '@/lib/supabase'
import { useSessionState } from '@/lib/auth-state'
import { SafeAreaView } from 'react-native-safe-area-context'
import { formatPhoneIndian } from '@/lib/utils'
import { apiDelete, apiGet, apiPost } from '@/lib/api'
import { InvitationActions } from '@/components/InvitationActions'
import { uploadPhotoToWebApi } from '@/lib/uploadPhoto'

const BRAND = '#D85A30'
const FG = '#1A1A1A'
const MUTED = '#7A6F66'
const inputStyle = {
  minHeight: 40,
  borderWidth: 1,
  borderColor: '#E5E7EB',
  borderRadius: 10,
  paddingHorizontal: 10,
  backgroundColor: '#FFFFFF',
} as const

type UserRow = {
  id: string
  name: string
  role: string
  phone_number: string | null
  city: string | null
  pincode: string | null
  bio: string | null
  profile_photo_url: string | null
}

type InviteRow = {
  id: string
  subject: string
  status: string
  customer_id?: string
  recipient_id?: string
}

type NameRole = { name: string; role: string }
type PaymentApprovalRow = {
  id: string
  project_id: string
  amount: number
  paid_to_category: string
  created_at: string
  project_name: string
}
type ReviewRow = {
  id: string
  rating: number
  comment: string | null
  created_at: string
  reviewer_id: string
  project_id: string
}
type ReviewDisplayRow = {
  id: string
  rating: number
  comment: string | null
  created_at: string
  reviewer_name: string
  project_name: string
}
type ProfessionalImage = {
  id: string
  image_url: string
  created_at: string
}

type SentInviteRecipientPayload = {
  items?: Array<{
    invite_id: string
    recipient_id: string | null
    recipient_name: string | null
    recipient_role: string | null
  }>
}

function parseInviteSubject(subject: string) {
  const match = subject.match(/\[([0-9a-fA-F-]{36})\]:\s*(.+)$/)
  if (!match) return { projectId: null, projectName: subject }
  return { projectId: match[1], projectName: match[2] }
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string; border: string }> = {
  pending: { bg: '#FEF3C7', text: '#92400E', label: 'Awaiting Contractor', border: '#F59E0B' },
  on_hold: { bg: '#FEF3C7', text: '#92400E', label: 'Awaiting Contractor', border: '#F59E0B' },
  active: { bg: '#D1FAE5', text: '#065F46', label: 'In Progress', border: '#10B981' },
  completed: { bg: '#F2EDE8', text: '#374151', label: 'Completed', border: '#9CA3AF' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B', label: 'Cancelled', border: '#EF4444' },
}

const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  foundation: { bg: '#F1F5F9', text: '#475569' },
  plinth: { bg: '#EFF6FF', text: '#1D4ED8' },
  walls: { bg: '#FFFBEB', text: '#92400E' },
  slab: { bg: '#FFF7ED', text: '#C2410C' },
  plastering: { bg: '#FAF5FF', text: '#6D28D9' },
  finishing: { bg: '#ECFDF5', text: '#065F46' },
}

export default function ProfileTab() {
  const router = useRouter()
  const { section } = useLocalSearchParams<{ section?: string }>()
  const { user, loading: authLoading, refreshProfile } = useSessionState()
  const paymentChannelSuffixRef = useRef(Math.random().toString(36).slice(2))
  const enquiriesChannelSuffixRef = useRef(Math.random().toString(36).slice(2))
  const notificationsChannelSuffixRef = useRef(Math.random().toString(36).slice(2))
  const [loading, setLoading] = useState(true)
  const [row, setRow] = useState<UserRow | null>(null)
  const [contractorYearsExperience, setContractorYearsExperience] = useState(0)
  const [workerYearsExperience, setWorkerYearsExperience] = useState(0)
  const [trade, setTrade] = useState<string | null>(null)
  const [reviewsCount, setReviewsCount] = useState(0)
  const [avgRating, setAvgRating] = useState(0)
  const [projectsCompleted, setProjectsCompleted] = useState(0)
  const [profileViews, setProfileViews] = useState(0)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [receivedInvites, setReceivedInvites] = useState<InviteRow[]>([])
  const [sentInvites, setSentInvites] = useState<InviteRow[]>([])
  const [customerNames, setCustomerNames] = useState<Map<string, string>>(new Map())
  const [recipientMap, setRecipientMap] = useState<Map<string, NameRole>>(new Map())
  const [sentInviteApproved, setSentInviteApproved] = useState<Map<string, boolean>>(new Map())
  const [sentInviteRole, setSentInviteRole] = useState<Map<string, 'worker' | 'contractor'>>(new Map())
  const [pendingPayments, setPendingPayments] = useState<PaymentApprovalRow[]>([])
  const [paymentActionId, setPaymentActionId] = useState<string | null>(null)
  const [invitationsY, setInvitationsY] = useState(0)
  const [reviewsY, setReviewsY] = useState(0)
  const [reviewItems, setReviewItems] = useState<ReviewDisplayRow[]>([])
  const [professionalImages, setProfessionalImages] = useState<ProfessionalImage[]>([])
  const [activeGalleryImageUri, setActiveGalleryImageUri] = useState<string | null>(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [editPhotoUrl, setEditPhotoUrl] = useState('')
  const [previewPhotoUri, setPreviewPhotoUri] = useState('')
  const [pendingPhoto, setPendingPhoto] = useState<{
    uri: string
    type: string
    ext: string
  } | null>(null)
  const [editCity, setEditCity] = useState('')
  const [editPincode, setEditPincode] = useState('')
  const [editYearsExperience, setEditYearsExperience] = useState('')

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    const { data: u, error } = await supabase
      .from('users')
      .select('id,name,role,phone_number,city,pincode,bio,profile_photo_url')
      .eq('id', user.id)
      .maybeSingle()
    if (error || !u) {
      setRow(null)
      setLoading(false)
      return
    }
    setRow(u as UserRow)
    setEditPhotoUrl(u.profile_photo_url ?? '')
    setPreviewPhotoUri(u.profile_photo_url ?? '')
    setPendingPhoto(null)
    setEditCity(u.city ?? '')
    setEditPincode(u.pincode ?? '')

    const role = u.role
    if (role === 'contractor') {
      const { data: cp } = await supabase.from('contractor_profiles').select('*').eq('user_id', user.id).maybeSingle()
      const rec = (cp ?? {}) as Record<string, unknown>
      const specs = Array.isArray(rec.specialisations)
        ? (rec.specialisations as string[])
        : Array.isArray(rec.specialization)
          ? (rec.specialization as string[])
          : []
      setContractorYearsExperience(Number(rec.years_experience ?? 0))
      setWorkerYearsExperience(0)
      setEditYearsExperience(String(Number(rec.years_experience ?? 0)))
      const { count } = await (supabase as any)
        .from('professional_profile_views')
        .select('id', { count: 'exact', head: true })
        .eq('professional_id', user.id)
      setProfileViews(count ?? 0)
    } else if (role === 'worker') {
      const { data: wp } = await supabase.from('worker_profiles').select('*').eq('user_id', user.id).maybeSingle()
      const rec = (wp ?? {}) as Record<string, unknown>
      setTrade(typeof rec.trade === 'string' ? rec.trade : null)
      setWorkerYearsExperience(Number(rec.years_experience ?? 0))
      setContractorYearsExperience(0)
      setEditYearsExperience(String(Number(rec.years_experience ?? 0)))
      const { count } = await (supabase as any)
        .from('professional_profile_views')
        .select('id', { count: 'exact', head: true })
        .eq('professional_id', user.id)
      setProfileViews(count ?? 0)
    } else {
      setTrade(null)
      setContractorYearsExperience(0)
      setWorkerYearsExperience(0)
      setEditYearsExperience('')
      setProfileViews(0)
    }

    if (role === 'contractor' || role === 'worker') {
      const { data: invites } = await supabase
        .from('enquiries')
        .select('id,subject,status,customer_id')
        .eq('recipient_id', user.id)
        .ilike('subject', 'Project invitation [%')
        .order('created_at', { ascending: false })
      const received = (invites ?? []) as InviteRow[]
      setReceivedInvites(received)
      const customerIds = Array.from(new Set(received.map((i) => i.customer_id).filter(Boolean))) as string[]
      if (customerIds.length > 0) {
        const { data: customers } = await supabase.from('users').select('id,name').in('id', customerIds)
        setCustomerNames(new Map((customers ?? []).map((c) => [c.id, c.name])))
      } else {
        setCustomerNames(new Map())
      }
      setSentInvites([])
      setRecipientMap(new Map())
      setSentInviteRole(new Map())
      try {
        const pendingPayload = await apiGet<{ items?: PaymentApprovalRow[]; error?: string }>('/api/payments/pending-approvals')
        setPendingPayments(pendingPayload.items ?? [])
      } catch {
        // Fallback path so pending approvals still appear even if API call fails transiently.
        const { data: paymentRows } = await supabase
          .from('payments')
          .select('id,project_id,amount,paid_to_category,created_at')
          .eq('paid_to', user.id)
          .eq('status', 'pending_confirmation')
          .order('created_at', { ascending: false })
        const pRows = (paymentRows ?? []) as Array<{
          id: string
          project_id: string
          amount: number
          paid_to_category: string
          created_at: string
        }>
        const projectIds = Array.from(new Set(pRows.map((p) => p.project_id)))
        const { data: projects } = projectIds.length
          ? await supabase.from('projects').select('id,name').in('id', projectIds)
          : { data: [] as Array<{ id: string; name: string }> }
        const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]))
        setPendingPayments(
          pRows.map((p) => ({
            ...p,
            project_name: projectNameById.get(p.project_id) ?? 'Project',
          }))
        )
      }
      try {
        const galleryPayload = await apiGet<{ items?: ProfessionalImage[]; error?: string }>('/api/profile/images')
        setProfessionalImages(galleryPayload.items ?? [])
      } catch {
        setProfessionalImages([])
      }
    } else if (role === 'customer') {
      const { data: invites } = await supabase
        .from('enquiries')
        .select('id,subject,status,recipient_id')
        .eq('customer_id', user.id)
        .ilike('subject', 'Project invitation [%')
        .order('created_at', { ascending: false })
      const sent = (invites ?? []) as InviteRow[]
      setSentInvites(sent)
      const recipientIds = Array.from(new Set(sent.map((i) => i.recipient_id).filter(Boolean))) as string[]
      let recipientsMap = new Map<string, NameRole>()
      try {
        const payload = await apiGet<SentInviteRecipientPayload>('/api/profile/invitations/sent')
        const rows = payload.items ?? []
        recipientsMap = new Map(
          rows
            .filter((row) => row.recipient_id && row.recipient_name && row.recipient_role)
            .map((row) => [
              row.recipient_id as string,
              { name: row.recipient_name as string, role: row.recipient_role as string },
            ])
        )
      } catch {
        if (recipientIds.length > 0) {
          const { data: recipients } = await supabase.from('users').select('id,name,role').in('id', recipientIds)
          recipientsMap = new Map((recipients ?? []).map((r) => [r.id, { name: r.name, role: r.role }]))
        }
      }
      setRecipientMap(recipientsMap)
      const parsedPairs = sent
        .map((invite) => {
          const parsed = parseInviteSubject(invite.subject)
          const rid = invite.recipient_id
          if (!parsed.projectId || !rid) return null
          return { inviteId: invite.id, projectId: parsed.projectId, recipientId: rid }
        })
        .filter(Boolean) as Array<{ inviteId: string; projectId: string; recipientId: string }>
      const projectIds = Array.from(new Set(parsedPairs.map((p) => p.projectId)))
      const { data: inviteProjects } = projectIds.length
        ? await supabase.from('projects').select('id,contractor_id').in('id', projectIds)
        : { data: [] as Array<{ id: string; contractor_id: string | null }> }
      const contractorByProject = new Map((inviteProjects ?? []).map((p) => [p.id, p.contractor_id]))
      let membershipSet = new Set<string>()
      if (projectIds.length && recipientIds.length) {
        const { data: memberships } = await supabase
          .from('project_members')
          .select('project_id,user_id')
          .in('project_id', projectIds)
          .in('user_id', recipientIds)
        membershipSet = new Set((memberships ?? []).map((m) => `${m.project_id}:${m.user_id}`))
      }
      const approvedMap = new Map<string, boolean>()
      const inviteRoleMap = new Map<string, 'worker' | 'contractor'>()
      for (const pair of parsedPairs) {
        approvedMap.set(pair.inviteId, membershipSet.has(`${pair.projectId}:${pair.recipientId}`))
        const directRole = recipientsMap.get(pair.recipientId)?.role
        const inferredRole =
          directRole === 'worker' || directRole === 'contractor'
            ? directRole
            : contractorByProject.get(pair.projectId) === pair.recipientId
              ? 'contractor'
              : 'worker'
        inviteRoleMap.set(pair.inviteId, inferredRole)
      }
      setSentInviteApproved(approvedMap)
      setSentInviteRole(inviteRoleMap)
      setReceivedInvites([])
      setCustomerNames(new Map())
      setPendingPayments([])
      setProfessionalImages([])
    }

    const { data: revs } = await supabase
      .from('reviews')
      .select('id,rating,comment,created_at,reviewer_id,project_id')
      .eq('reviewee_id', user.id)
      .order('created_at', { ascending: false })
    const reviewRows = (revs ?? []) as ReviewRow[]
    const rc = reviewRows.length
    setReviewsCount(rc)
    setAvgRating(rc > 0 ? Number((reviewRows.reduce((s, r) => s + Number(r.rating), 0) / rc).toFixed(1)) : 0)
    if (role === 'contractor' || role === 'worker') {
      const reviewerIds = Array.from(new Set(reviewRows.map((r) => r.reviewer_id)))
      const projectIds = Array.from(new Set(reviewRows.map((r) => r.project_id)))
      const { data: reviewerRows } = reviewerIds.length
        ? await supabase.from('users').select('id,name').in('id', reviewerIds)
        : { data: [] as Array<{ id: string; name: string }> }
      const reviewerNameById = new Map((reviewerRows ?? []).map((r) => [r.id, r.name]))
      const { data: projectRows } = projectIds.length
        ? await supabase.from('projects').select('id,name').in('id', projectIds)
        : { data: [] as Array<{ id: string; name: string }> }
      const projectNameById = new Map((projectRows ?? []).map((p) => [p.id, p.name]))
      setReviewItems(
        reviewRows.map((r) => ({
          id: r.id,
          rating: Number(r.rating),
          comment: r.comment,
          created_at: r.created_at,
          reviewer_name: reviewerNameById.get(r.reviewer_id) ?? 'Customer',
          project_name: projectNameById.get(r.project_id) ?? 'Project',
        }))
      )
    } else {
      setReviewItems([])
    }

    if (role === 'contractor') {
      const { data: done } = await supabase.from('projects').select('id').eq('contractor_id', user.id).eq('status', 'completed')
      setProjectsCompleted((done ?? []).length)
    } else if (role === 'worker') {
      const { data: mem } = await supabase.from('project_members').select('project_id').eq('user_id', user.id)
      const ids = Array.from(new Set((mem ?? []).map((m) => m.project_id)))
      if (ids.length) {
        const { data: done } = await supabase.from('projects').select('id').in('id', ids).eq('status', 'completed')
        setProjectsCompleted((done ?? []).length)
      } else setProjectsCompleted(0)
    } else {
      setProjectsCompleted(0)
    }

    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!user?.id) return
    const channelName = `profile-payments-${user.id}-${paymentChannelSuffixRef.current}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments', filter: `paid_to=eq.${user.id}` },
        () => {
          void load()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load, user?.id])

  useEffect(() => {
    if (!user?.id) return
    const channelName = `profile-enquiries-${user.id}-${enquiriesChannelSuffixRef.current}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'enquiries', filter: `recipient_id=eq.${user.id}` },
        () => {
          void load()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'enquiries', filter: `customer_id=eq.${user.id}` },
        () => {
          void load()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load, user?.id])

  useEffect(() => {
    if (!user?.id) return
    const channelName = `profile-notifications-${user.id}-${notificationsChannelSuffixRef.current}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => {
          // Keep profile sections and deep-link counts fresh when invite/payment notifications arrive.
          void load()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load, user?.id])

  useEffect(() => {
    if (section !== 'invitations') return
    if (!invitationsY) return
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(invitationsY - 24, 0), animated: true })
    }, 250)
  }, [section, invitationsY, receivedInvites.length, sentInvites.length])

  const scrollRef = useRef<ScrollView>(null)

  const signOutWithNetworkFallback = async () => {
    const { error } = await supabase.auth.signOut()
    if (!error) return { error: null as null | Error }

    const isTransientNetworkFailure = /network request failed/i.test(error.message)
    if (!isTransientNetworkFailure) return { error: new Error(error.message) }

    // If revoke fails due to a flaky network, still clear local session so the app can log out cleanly.
    const { error: localError } = await supabase.auth.signOut({ scope: 'local' })
    if (localError) return { error: new Error(localError.message) }
    return { error: null as null | Error }
  }

  const signOut = async () => {
    const { error } = await signOutWithNetworkFallback()
    if (error) Alert.alert('Error', error.message)
    else await refreshProfile()
  }

  const deleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This action is permanent and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingAccount(true)
              await apiDelete('/api/account')
              const { error } = await signOutWithNetworkFallback()
              if (error) throw error
              await refreshProfile()
              Alert.alert('Account deleted', 'Your account has been deleted successfully.')
            } catch (error) {
              Alert.alert('Delete failed', error instanceof Error ? error.message : 'Unable to delete account')
            } finally {
              setDeletingAccount(false)
            }
          },
        },
      ]
    )
  }

  const pickProfilePhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow photo access to update your profile picture.')
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      })
      if (result.canceled || !result.assets[0]) return
      const asset = result.assets[0]
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase()
      const normalizedExt = ext === 'jpeg' ? 'jpg' : ext
      const mimeType = asset.mimeType ?? `image/${normalizedExt === 'jpg' ? 'jpeg' : normalizedExt}`
      setPendingPhoto({
        uri: asset.uri,
        type: mimeType,
        ext: normalizedExt,
      })
      setPreviewPhotoUri(asset.uri)
    } catch (error) {
      Alert.alert('Profile photo', error instanceof Error ? error.message : 'Failed to upload photo')
    }
  }

  const saveProfileEdits = async () => {
    try {
      setSavingProfile(true)
      let nextPhotoUrl = editPhotoUrl.trim() || null
      if (pendingPhoto) {
        setUploadingPhoto(true)
        nextPhotoUrl = await uploadPhotoToWebApi({
          uri: pendingPhoto.uri,
          name: `profile-${user?.id ?? 'user'}-${Date.now()}.${pendingPhoto.ext}`,
          type: pendingPhoto.type,
          folder: 'profile',
        })
      }
      const payload: Record<string, unknown> = {
        profile_photo_url: nextPhotoUrl,
        city: editCity.trim() || null,
        pincode: editPincode.trim() || null,
      }
      if (row?.role === 'contractor') {
        payload.contractor = {
          years_experience: Number(editYearsExperience || 0),
        }
      }
      if (row?.role === 'worker') {
        payload.worker = {
          years_experience: Number(editYearsExperience || 0),
        }
      }
      const res = await apiPost<{ success?: boolean; error?: string }>('/api/account/profile', payload)
      if (!res.success) throw new Error(res.error ?? 'Unable to save profile')
      setEditPhotoUrl(nextPhotoUrl ?? '')
      setPreviewPhotoUri(nextPhotoUrl ?? '')
      setPendingPhoto(null)
      setEditingProfile(false)
      await refreshProfile()
      await load()
      Alert.alert('Saved', 'Your profile has been updated.')
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Unable to update profile')
    } finally {
      setUploadingPhoto(false)
      setSavingProfile(false)
    }
  }

  const onToggleEditProfile = () => {
    if (editingProfile) {
      setEditPhotoUrl(row.profile_photo_url ?? '')
      setPreviewPhotoUri(row.profile_photo_url ?? '')
      setPendingPhoto(null)
      setEditCity(row.city ?? '')
      setEditPincode(row.pincode ?? '')
      if (row.role === 'contractor') {
        setEditYearsExperience(String(contractorYearsExperience))
      } else if (row.role === 'worker') {
        setEditYearsExperience(String(workerYearsExperience))
      } else {
        setEditYearsExperience('')
      }
    }
    setEditingProfile((prev) => !prev)
  }

  const scrollToReviews = () => {
    if (!reviewsY) return
    scrollRef.current?.scrollTo({ y: Math.max(reviewsY - 24, 0), animated: true })
  }

  const addProfessionalImage = async () => {
    if (professionalImages.length >= 6) {
      Alert.alert('Limit reached', '6 images limit reached delete existing to upload new')
      return
    }
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow photo access to add profile images.')
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      })
      if (result.canceled || !result.assets[0]) return
      const asset = result.assets[0]
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase()
      const normalizedExt = ext === 'jpeg' ? 'jpg' : ext
      setUploadingPhoto(true)
      const url = await uploadPhotoToWebApi({
        uri: asset.uri,
        name: `gallery-${user?.id ?? 'user'}-${Date.now()}.${normalizedExt}`,
        type: asset.mimeType ?? `image/${normalizedExt === 'jpg' ? 'jpeg' : normalizedExt}`,
        folder: 'professional-gallery',
      })
      const saved = await apiPost<{ success?: boolean; error?: string; item?: ProfessionalImage }>('/api/profile/images', {
        image_url: url,
      })
      if (!saved.success || !saved.item) throw new Error(saved.error ?? 'Unable to save image')
      setProfessionalImages((prev) => [...prev, saved.item as ProfessionalImage])
    } catch (error) {
      Alert.alert('Image upload', error instanceof Error ? error.message : 'Unable to upload image')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const deleteProfessionalImage = async (id: string) => {
    try {
      await apiDelete(`/api/profile/images/${id}`)
      setProfessionalImages((prev) => prev.filter((item) => item.id !== id))
    } catch (error) {
      Alert.alert('Delete image', error instanceof Error ? error.message : 'Unable to delete image')
    }
  }

  const respondToPaymentApproval = async (payment: PaymentApprovalRow, action: 'approve' | 'decline') => {
    try {
      setPaymentActionId(payment.id)
      const payload = await apiPost<{ success?: boolean; error?: string }>(`/api/projects/${payment.project_id}/payments/respond`, {
        payment_id: payment.id,
        action,
      })
      if (!payload.success) throw new Error(payload.error ?? 'Unable to update payment')
      await load()
    } catch (error) {
      Alert.alert('Payment', error instanceof Error ? error.message : 'Unable to update payment')
    } finally {
      setPaymentActionId(null)
    }
  }

  if (authLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F2EDE8' }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BRAND} />
        </View>
      </SafeAreaView>
    )
  }

  if (!user) return <Redirect href="/(auth)/login" />

  if (loading || !row) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F2EDE8' }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BRAND} />
        </View>
      </SafeAreaView>
    )
  }

  const showStats = row.role === 'contractor' || row.role === 'worker'
  const receivedInvitesForDisplay = receivedInvites.filter((invite) => invite.status !== 'responded')
  const sentInvitesForDisplay = sentInvites.filter((invite) => {
    const approvedByMembership = sentInviteApproved.get(invite.id) === true
    return invite.status !== 'responded' && !approvedByMembership
  })
  const receivedScrollable = receivedInvitesForDisplay.length > 2
  const sentScrollable = sentInvitesForDisplay.length > 2

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F2EDE8' }} edges={['bottom']}>
      <ScrollView ref={scrollRef} nestedScrollEnabled contentContainerStyle={{ paddingBottom: 12 }}>
        <View style={{ alignItems: 'center', marginTop: 16 }}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              borderWidth: 3,
              borderColor: '#FFFFFF',
              backgroundColor: BRAND,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {previewPhotoUri ? (
              <Image source={{ uri: previewPhotoUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <Text style={{ fontSize: 28, fontWeight: '800', color: '#FFFFFF' }}>
                {row.name?.trim()?.charAt(0)?.toUpperCase() || 'U'}
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={onToggleEditProfile}
            style={{ marginTop: 10, borderRadius: 999, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#C2410C' }}>{editingProfile ? 'Cancel edit' : 'Edit profile'}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: FG }}>{row.name}</Text>
          <View style={{ marginTop: 10, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: BRAND }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF', textTransform: 'capitalize' }}>{row.role}</Text>
          </View>
          <Text style={{ marginTop: 12, fontSize: 14, fontWeight: '600', color: MUTED }}>{formatPhoneIndian(row.phone_number)}</Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
            {row.city ?? '—'} · {row.pincode ?? '—'}
          </Text>
        </View>

        {showStats ? (
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 20 }}>
            <StatBox label="Rating" value={avgRating.toFixed(1)} />
            <StatBox label="Completed" value={String(projectsCompleted)} />
            <StatBox label="Profile views" value={String(profileViews)} />
          </View>
        ) : null}

        {editingProfile ? (
          <View style={{ marginHorizontal: 16, marginTop: 12, borderRadius: 12, backgroundColor: '#FFFFFF', padding: 14, borderWidth: 1, borderColor: '#F2EDE8' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#999' }}>EDIT PROFILE</Text>
            <TouchableOpacity
              onPress={() => void pickProfilePhoto()}
              disabled={uploadingPhoto}
              style={{ marginTop: 10, minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: '#FED7AA', backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#C2410C', fontWeight: '700' }}>{uploadingPhoto ? 'Uploading...' : 'Change profile photo'}</Text>
            </TouchableOpacity>
            {(row.role === 'contractor' || row.role === 'worker') ? (
              <>
                <Text style={{ marginTop: 10, marginBottom: 6, fontSize: 11, fontWeight: '700', color: '#6B7280' }}>Years experience</Text>
                <TextInput
                  value={editYearsExperience}
                  onChangeText={(t) => setEditYearsExperience(t.replace(/[^\d]/g, ''))}
                  keyboardType="number-pad"
                  style={inputStyle}
                />
              </>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ marginBottom: 6, fontSize: 11, fontWeight: '700', color: '#6B7280' }}>City</Text>
                <TextInput value={editCity} onChangeText={setEditCity} style={inputStyle} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ marginBottom: 6, fontSize: 11, fontWeight: '700', color: '#6B7280' }}>Pincode</Text>
                <TextInput
                  value={editPincode}
                  onChangeText={(t) => setEditPincode(t.replace(/[^\d]/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  style={inputStyle}
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={() => void saveProfileEdits()}
              disabled={savingProfile || uploadingPhoto}
              style={{ marginTop: 14, minHeight: 46, borderRadius: 10, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', opacity: savingProfile || uploadingPhoto ? 0.7 : 1 }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{savingProfile ? 'Saving...' : 'Save profile'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {row.role === 'contractor' || row.role === 'worker' ? (
          <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
            <Text style={{ color: MUTED }}>
              {(row.role === 'contractor' ? contractorYearsExperience : workerYearsExperience)} years of experience
            </Text>
          </View>
        ) : null}

        {(row.role === 'contractor' || row.role === 'worker') ? (
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 12,
              borderRadius: 16,
              backgroundColor: '#FFFFFF',
              padding: 14,
              borderWidth: 1,
              borderColor: '#FFEDD5',
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#999' }}>PROFILE IMAGES</Text>
              <TouchableOpacity
                onPress={() => void addProfessionalImage()}
                disabled={uploadingPhoto}
                style={{ borderRadius: 999, borderWidth: 1, borderColor: '#FED7AA', backgroundColor: '#FFF7ED', paddingHorizontal: 10, paddingVertical: 6, opacity: uploadingPhoto ? 0.7 : 1 }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#C2410C' }}>
                  {uploadingPhoto ? 'Uploading...' : '+ Add image'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 }}>
              {professionalImages.map((item) => (
                <View
                  key={item.id}
                  style={{
                    width: '32%',
                    height: 108,
                    borderRadius: 8,
                    overflow: 'hidden',
                    backgroundColor: '#FFF7ED66',
                    borderWidth: 1,
                    borderColor: '#FFEDD5',
                  }}
                >
                  <TouchableOpacity onPress={() => setActiveGalleryImageUri(item.image_url)} activeOpacity={0.9}>
                    <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void deleteProfessionalImage(item.id)}
                    style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800', lineHeight: 16 }}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {Array.from({ length: Math.max(0, 6 - professionalImages.length) }).map((_, index) => (
                <View
                  key={`placeholder-${index}`}
                  style={{
                    width: '32%',
                    height: 108,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: '#FFEDD5',
                    backgroundColor: '#FFF7ED66',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#FDBA74' }}>
                    {`Image ${professionalImages.length + index + 1}`}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={{ marginTop: 10, fontSize: 11, color: '#9CA3AF' }}>{`${professionalImages.length}/6 images`}</Text>
          </View>
        ) : null}

        {trade ? (
          <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
            <Text style={{ fontWeight: '700', color: FG }}>Trade</Text>
            <View style={{ marginTop: 6, alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#E0E7FF' }}>
              <Text style={{ fontWeight: '600', color: '#3730A3' }}>{trade}</Text>
            </View>
          </View>
        ) : null}

        {receivedInvitesForDisplay.length > 0 ? (
          <View
            onLayout={(e) => {
              const y = e.nativeEvent.layout.y
              setInvitationsY(y)
            }}
            style={{ marginHorizontal: 16, marginTop: 16, borderRadius: 12, backgroundColor: '#FFFFFF', padding: 14, borderWidth: 1, borderColor: '#F2EDE8' }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#999' }}>WORK INVITATIONS</Text>
            <ScrollView
              nestedScrollEnabled
              scrollEnabled={receivedScrollable}
              showsVerticalScrollIndicator={receivedScrollable}
              style={{ height: receivedScrollable ? 280 : undefined, marginTop: 2 }}
              contentContainerStyle={{ paddingBottom: 6 }}
            >
              {receivedInvitesForDisplay.map((invite) => {
                const parsed = parseInviteSubject(invite.subject)
                const pending = invite.status === 'open'
                const statusLabel = pending ? 'Pending your response' : invite.status === 'responded' ? 'Approved' : 'Declined'
                const statusColor = pending ? '#B45309' : invite.status === 'responded' ? '#166534' : '#B45309'
                const statusBg = pending ? '#FFFBEB' : invite.status === 'responded' ? '#ECFDF3' : '#FFF7ED'
                return (
                  <View
                    key={invite.id}
                    style={{
                      marginTop: 10,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#F1F5F9',
                      backgroundColor: '#FFFFFF',
                      borderLeftWidth: 4,
                      borderLeftColor: pending ? '#F59E0B' : invite.status === 'responded' ? '#10B981' : '#FB923C',
                      padding: 12,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <Text style={{ flex: 1, fontWeight: '800', color: FG, fontSize: 14 }}>{parsed.projectName}</Text>
                      <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: statusBg }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor }}>{statusLabel}</Text>
                      </View>
                    </View>
                    <Text style={{ marginTop: 6, color: MUTED, fontSize: 12 }}>
                      From: {invite.customer_id ? customerNames.get(invite.customer_id) ?? 'Customer' : 'Customer'}
                    </Text>
                    {pending && parsed.projectId ? (
                      <View style={{ marginTop: 10 }}>
                        <InvitationActions projectId={parsed.projectId} onDone={() => void load()} />
                      </View>
                    ) : null}
                  </View>
                )
              })}
            </ScrollView>
          </View>
        ) : null}

        {sentInvitesForDisplay.length > 0 ? (
          <View
            onLayout={(e) => {
              const y = e.nativeEvent.layout.y
              setInvitationsY((prev) => (prev === 0 ? y : prev))
            }}
            style={{ marginHorizontal: 16, marginTop: 16, borderRadius: 12, backgroundColor: '#FFFFFF', padding: 14, borderWidth: 1, borderColor: '#F2EDE8' }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#999' }}>INVITATIONS SENT</Text>
            <ScrollView
              nestedScrollEnabled
              scrollEnabled={sentScrollable}
              showsVerticalScrollIndicator={sentScrollable}
              style={{ height: sentScrollable ? 280 : undefined, marginTop: 2 }}
              contentContainerStyle={{ paddingBottom: 6 }}
            >
              {sentInvitesForDisplay.map((invite) => {
                  const parsed = parseInviteSubject(invite.subject)
                  const rec = invite.recipient_id ? recipientMap.get(invite.recipient_id) : undefined
                  const approvedByMembership = sentInviteApproved.get(invite.id) === true
                  const inviteRole = sentInviteRole.get(invite.id) ?? (rec?.role === 'worker' ? 'worker' : 'contractor')
                  const roleLabel = inviteRole === 'worker' ? 'Worker' : 'Contractor'
                  const waitingLabel = inviteRole === 'worker' ? 'Waiting worker approval' : 'Waiting contractor approval'
                  const statusLabel =
                    approvedByMembership || invite.status === 'responded'
                      ? 'Invitation approved'
                      : invite.status === 'open'
                        ? waitingLabel
                        : 'Declined'
                  const approved = approvedByMembership || invite.status === 'responded'
                  const statusColor = approved ? '#166534' : invite.status === 'open' ? '#B45309' : '#B45309'
                  const statusBg = approved ? '#ECFDF3' : invite.status === 'open' ? '#FFFBEB' : '#FFF7ED'
                return (
                    <View
                      key={invite.id}
                      style={{
                        marginTop: 10,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: '#F1F5F9',
                        backgroundColor: '#FFFFFF',
                        borderLeftWidth: 4,
                        borderLeftColor: approved ? '#10B981' : invite.status === 'open' ? '#F59E0B' : '#FB923C',
                        padding: 12,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <Text style={{ flex: 1, fontWeight: '800', color: FG, fontSize: 14 }}>{parsed.projectName}</Text>
                        <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: statusBg }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor }}>{statusLabel}</Text>
                        </View>
                      </View>
                      <Text style={{ marginTop: 4, color: MUTED, fontSize: 12 }}>
                        To: {rec?.name ?? roleLabel} ({roleLabel})
                      </Text>
                      {invite.recipient_id && approved && parsed.projectId ? (
                        <TouchableOpacity
                          onPress={() =>
                            rec?.role === 'worker'
                              ? router.push({
                                  pathname: '/projects/[id]',
                                  params: { id: parsed.projectId as string, workerDetails: '1' },
                                })
                              : router.push({
                                  pathname: '/projects/[id]',
                                  params: { id: parsed.projectId as string },
                                })
                          }
                          style={{
                            marginTop: 10,
                            alignSelf: 'flex-start',
                            borderRadius: 8,
                            backgroundColor: '#FFF8F5',
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                          }}
                        >
                          <Text style={{ color: BRAND, fontSize: 12, fontWeight: '700' }}>
                            {rec?.role === 'worker' ? 'Open worker details' : 'Open project details'}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                )
              })}
            </ScrollView>
          </View>
        ) : null}

        {pendingPayments.length > 0 ? (
          <View style={{ marginHorizontal: 16, marginTop: 16, borderRadius: 12, backgroundColor: '#FFFFFF', padding: 14, borderWidth: 1, borderColor: '#F2EDE8' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#999' }}>PAYMENT APPROVAL REQUESTS</Text>
            {pendingPayments.map((payment) => (
              <View
                key={payment.id}
                style={{
                  marginTop: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#F1F5F9',
                  backgroundColor: '#FFFFFF',
                  borderLeftWidth: 4,
                  borderLeftColor: '#F59E0B',
                  padding: 12,
                }}
              >
                <Text style={{ fontWeight: '800', color: FG, fontSize: 14 }}>{payment.project_name}</Text>
                <Text style={{ marginTop: 4, color: MUTED, fontSize: 12 }}>
                  {`Amount: ₹${payment.amount.toLocaleString('en-IN')} · ${payment.paid_to_category}`}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: '/projects/[id]',
                      params: { id: payment.project_id, tab: 'payments', paymentId: payment.id },
                    })
                  }
                  style={{ marginTop: 8, alignSelf: 'flex-start' }}
                >
                  <Text style={{ color: BRAND, fontSize: 12, fontWeight: '700' }}>Open payments tab</Text>
                </TouchableOpacity>
                <View style={{ marginTop: 10, flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => void respondToPaymentApproval(payment, 'approve')}
                    disabled={paymentActionId === payment.id}
                    style={{ flex: 1, minHeight: 48, borderRadius: 10, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center', opacity: paymentActionId === payment.id ? 0.7 : 1 }}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{paymentActionId === payment.id ? 'Saving...' : 'Approve'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void respondToPaymentApproval(payment, 'decline')}
                    disabled={paymentActionId === payment.id}
                    style={{ flex: 1, minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', opacity: paymentActionId === payment.id ? 0.7 : 1 }}
                  >
                    <Text style={{ color: '#DC2626', fontWeight: '700' }}>{paymentActionId === payment.id ? 'Saving...' : 'Decline'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {(row.role === 'contractor' || row.role === 'worker') ? (
          <View
            onLayout={(e) => {
              setReviewsY(e.nativeEvent.layout.y)
            }}
            style={{ marginHorizontal: 16, marginTop: 16, borderRadius: 12, backgroundColor: '#FFFFFF', padding: 14, borderWidth: 1, borderColor: '#F2EDE8' }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#999' }}>REVIEWS</Text>
            {reviewItems.length === 0 ? (
              <Text style={{ marginTop: 10, color: MUTED, fontSize: 13 }}>No reviews yet.</Text>
            ) : (
              reviewItems.map((review) => (
                <View
                  key={review.id}
                  style={{
                    marginTop: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#F1F5F9',
                    backgroundColor: '#FFFFFF',
                    borderLeftWidth: 4,
                    borderLeftColor: '#D85A30',
                    padding: 12,
                  }}
                >
                  <Text style={{ fontWeight: '800', color: FG, fontSize: 14 }}>{review.project_name}</Text>
                  <Text style={{ marginTop: 4, color: '#B45309', fontSize: 12, fontWeight: '700' }}>
                    {`★ ${review.rating.toFixed(1)} · by ${review.reviewer_name}`}
                  </Text>
                  {review.comment ? (
                    <Text style={{ marginTop: 6, color: MUTED, fontSize: 13 }}>{review.comment}</Text>
                  ) : (
                    <Text style={{ marginTop: 6, color: '#9CA3AF', fontSize: 12 }}>No written comment</Text>
                  )}
                </View>
              ))
            )}
          </View>
        ) : null}

        <TouchableOpacity
          onPress={() => void signOut()}
          style={{
            marginHorizontal: 16,
            marginTop: 16,
            minHeight: 52,
            borderRadius: 14,
            borderWidth: 2,
            borderColor: '#EF4444',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontWeight: '700', color: '#EF4444' }}>Sign out</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={deleteAccount}
          disabled={deletingAccount}
          style={{
            marginHorizontal: 16,
            marginTop: 10,
            minHeight: 52,
            borderRadius: 14,
            borderWidth: 2,
            borderColor: '#DC2626',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: deletingAccount ? 0.6 : 1,
          }}
        >
          <Text style={{ fontWeight: '700', color: '#DC2626' }}>
            {deletingAccount ? 'Deleting account...' : 'Delete account'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
    </SafeAreaView>
  )
}

function StatBox({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const content = (
    <View style={{ flex: 1, borderRadius: 12, backgroundColor: '#FFFFFF', padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#F2EDE8' }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: BRAND }}>{value}</Text>
      <Text style={{ marginTop: 6, fontSize: 11, fontWeight: '600', color: MUTED }}>{label}</Text>
    </View>
  )
  if (!onPress) return content
  return (
    <TouchableOpacity onPress={onPress} style={{ flex: 1 }}>
      {content}
    </TouchableOpacity>
  )
}
