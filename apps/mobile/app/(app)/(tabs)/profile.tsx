import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useSessionState } from '@/lib/auth-state'
import { SafeAreaView } from 'react-native-safe-area-context'
import { formatPhoneIndian, getInitials } from '@/lib/utils'
import { daysAgoText } from '@/lib/theme'
import { apiDelete, apiGet, apiPost } from '@/lib/api'
import { InvitationActions } from '@/components/InvitationActions'

const BRAND = '#E8590C'
const FG = '#1A1A1A'
const MUTED = '#7A6F66'

type UserRow = {
  id: string
  name: string
  role: string
  phone_number: string | null
  city: string | null
  pincode: string | null
  bio: string | null
}

type ProjectMini = {
  id: string
  name: string
  address: string
  city: string
  current_stage: string
  status: string
  contractor_id: string | null
  updated_at: string
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

const STAGE_PROGRESS: Record<string, number> = {
  foundation: 10,
  plinth: 25,
  walls: 45,
  slab: 60,
  plastering: 80,
  finishing: 100,
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string; border: string }> = {
  pending: { bg: '#FEF3C7', text: '#92400E', label: 'Awaiting Contractor', border: '#F59E0B' },
  on_hold: { bg: '#FEF3C7', text: '#92400E', label: 'Awaiting Contractor', border: '#F59E0B' },
  active: { bg: '#D1FAE5', text: '#065F46', label: 'In Progress', border: '#10B981' },
  completed: { bg: '#F3F4F6', text: '#374151', label: 'Completed', border: '#9CA3AF' },
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
  const [specialisations, setSpecialisations] = useState<string[]>([])
  const [contractorYearsExperience, setContractorYearsExperience] = useState(0)
  const [trade, setTrade] = useState<string | null>(null)
  const [reviewsCount, setReviewsCount] = useState(0)
  const [avgRating, setAvgRating] = useState(0)
  const [projectsCompleted, setProjectsCompleted] = useState(0)
  const [recentProjects, setRecentProjects] = useState<ProjectMini[]>([])
  const [recentProjectHasMembers, setRecentProjectHasMembers] = useState<Map<string, boolean>>(new Map())
  const [recentProjectHasWorkers, setRecentProjectHasWorkers] = useState<Map<string, boolean>>(new Map())
  const [latestUpdateByProject, setLatestUpdateByProject] = useState<Map<string, string>>(new Map())
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

  const load = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    const { data: u, error } = await supabase
      .from('users')
      .select('id,name,role,phone_number,city,pincode,bio')
      .eq('id', user.id)
      .maybeSingle()
    if (error || !u) {
      setRow(null)
      setLoading(false)
      return
    }
    setRow(u as UserRow)

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
      setSpecialisations(specs)
    } else if (role === 'worker') {
      const { data: wp } = await supabase.from('worker_profiles').select('*').eq('user_id', user.id).maybeSingle()
      const rec = (wp ?? {}) as Record<string, unknown>
      setTrade(typeof rec.trade === 'string' ? rec.trade : null)
    } else {
      setSpecialisations([])
      setTrade(null)
      setContractorYearsExperience(0)
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
    }

    const { data: revs } = await supabase.from('reviews').select('rating').eq('reviewee_id', user.id)
    const rc = (revs ?? []).length
    setReviewsCount(rc)
    setAvgRating(rc > 0 ? Number(((revs ?? []).reduce((s, r) => s + Number(r.rating), 0) / rc).toFixed(1)) : 0)

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

    let recent: ProjectMini[] = []
    if (role === 'customer') {
      const { data: rp } = await supabase
        .from('projects')
        .select('id,name,address,city,current_stage,status,contractor_id,updated_at,created_at')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)
      const ownedProjects = (rp ?? []) as ProjectMini[]
      const ownedIds = ownedProjects.map((p) => p.id)
      if (ownedIds.length > 0) {
        const { data: members } = await supabase
          .from('project_members')
          .select('project_id,user_id,role')
          .in('project_id', ownedIds)
        const memberRows = (members ?? []) as Array<{ project_id: string; user_id: string; role: string | null }>
        recent = ownedProjects
          .filter((project) => {
            if (project.contractor_id) {
              return memberRows.some((m) => m.project_id === project.id && m.user_id === project.contractor_id)
            }
            return memberRows.some((m) => m.project_id === project.id && m.role === 'worker')
          })
          .slice(0, 3)
      } else {
        recent = []
      }
    } else if (role === 'contractor') {
      const { data: rp } = await supabase
        .from('projects')
        .select('id,name,address,city,current_stage,status,contractor_id,updated_at,created_at')
        .eq('contractor_id', user.id)
        .in('status', ['active', 'completed'])
        .order('created_at', { ascending: false })
        .limit(3)
      recent = (rp ?? []) as ProjectMini[]
    } else {
      const { data: mem } = await supabase.from('project_members').select('project_id').eq('user_id', user.id)
      const ids = Array.from(new Set((mem ?? []).map((m) => m.project_id))).slice(0, 10)
      if (ids.length) {
        const { data: rp } = await supabase
          .from('projects')
          .select('id,name,address,city,current_stage,status,contractor_id,updated_at,created_at')
          .in('id', ids)
          .in('status', ['active', 'completed'])
          .order('created_at', { ascending: false })
          .limit(3)
        recent = (rp ?? []) as ProjectMini[]
      }
    }
    setRecentProjects(recent)
    const recentIds = recent.map((p) => p.id)
    const memberMap = new Map<string, boolean>()
    const workerMap = new Map<string, boolean>()
    if (recentIds.length) {
      const { data: recentMembers } = await supabase.from('project_members').select('project_id,role').in('project_id', recentIds)
      for (const member of recentMembers ?? []) {
        memberMap.set(member.project_id, true)
        if (member.role === 'worker') workerMap.set(member.project_id, true)
      }
    }
    setRecentProjectHasMembers(memberMap)
    setRecentProjectHasWorkers(workerMap)

    const pids = recentIds
    const map = new Map<string, string>()
    if (pids.length) {
      const { data: ups } = await supabase
        .from('daily_updates')
        .select('project_id,created_at')
        .in('project_id', pids)
        .order('created_at', { ascending: false })
      for (const up of ups ?? []) {
        if (!map.has(up.project_id)) map.set(up.project_id, up.created_at)
      }
    }
    setLatestUpdateByProject(map)
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

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
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
              await supabase.auth.signOut()
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
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FAFAFA' }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BRAND} />
        </View>
      </SafeAreaView>
    )
  }

  if (!user) return <Redirect href="/(auth)/login" />

  if (loading || !row) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FAFAFA' }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BRAND} />
        </View>
      </SafeAreaView>
    )
  }

  const showStats = row.role === 'contractor' || row.role === 'worker'
  const recentScrollable = recentProjects.length > 2
  const receivedScrollable = receivedInvites.length > 2
  const sentScrollable = sentInvites.length > 2

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAFAFA' }} edges={['bottom']}>
      <ScrollView ref={scrollRef} nestedScrollEnabled contentContainerStyle={{ paddingBottom: 40 }}>
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
            }}
          >
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#FFFFFF' }}>{getInitials(row.name)}</Text>
          </View>
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
            <StatBox label="Reviews" value={String(reviewsCount)} />
            <StatBox label="Completed" value={String(projectsCompleted)} />
          </View>
        ) : null}

        <View style={{ marginHorizontal: 16, marginTop: 20, borderRadius: 12, backgroundColor: '#FFFFFF', padding: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
          {row.bio ? <Text style={{ fontSize: 14, color: '#4B5563', lineHeight: 20 }}>{row.bio}</Text> : <Text style={{ color: MUTED }}>No bio yet</Text>}
        </View>

        {specialisations.length > 0 ? (
          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <Text style={{ fontWeight: '700', marginBottom: 8, color: FG }}>Specialisations</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {specialisations.map((s) => (
                <View key={s} style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#FFEDD5' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: BRAND }}>{s}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {row.role === 'contractor' ? (
          <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
            <Text style={{ fontWeight: '700', color: FG }}>Years of experience</Text>
            <Text style={{ marginTop: 6, color: MUTED }}>{contractorYearsExperience} years</Text>
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

        {recentProjects.length > 0 ? (
          <View style={{ marginTop: 20 }}>
            <Text style={{ paddingHorizontal: 16, fontWeight: '800', fontSize: 16, color: FG }}>Recent projects</Text>
            <ScrollView
              nestedScrollEnabled
              scrollEnabled={recentScrollable}
              showsVerticalScrollIndicator={recentScrollable}
              style={{ height: recentScrollable ? 320 : undefined, marginTop: 12 }}
              contentContainerStyle={{ paddingHorizontal: 16 }}
            >
              {recentProjects.map((p) => {
                const effectiveStatus =
                  (p.status === 'pending' || p.status === 'on_hold') &&
                  (row.role !== 'customer' || recentProjectHasMembers.get(p.id))
                    ? 'active'
                    : p.status
                const status = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.active
                const statusLabel =
                  effectiveStatus === 'pending' || effectiveStatus === 'on_hold'
                    ? p.contractor_id
                      ? 'Waiting contractor approval'
                      : 'Waiting worker approval'
                    : status.label
                const hideStagePill = recentProjectHasWorkers.get(p.id) === true
                const stage = STAGE_COLORS[p.current_stage] ?? STAGE_COLORS.foundation
                const progress = STAGE_PROGRESS[p.current_stage] ?? 10
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => router.push({ pathname: '/projects/[id]', params: { id: p.id } })}
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: 18,
                      padding: 16,
                      marginBottom: 12,
                      borderLeftWidth: 4,
                      borderLeftColor: status.border,
                      shadowColor: '#000000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.08,
                      shadowRadius: 8,
                      elevation: 3,
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '700', color: '#1C1917', flex: 1, marginRight: 8 }}>
                        {p.name}
                      </Text>
                      {!hideStagePill ? (
                        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: stage.bg }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'capitalize', color: stage.text }}>
                            {p.current_stage}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <Text style={{ fontSize: 13, color: '#78716C', marginBottom: 12 }}>📍 {p.city}</Text>

                    <View style={{ height: 5, backgroundColor: '#F5F5F4', borderRadius: 3, marginBottom: 10, overflow: 'hidden' }}>
                      <View style={{ height: 5, backgroundColor: BRAND, borderRadius: 3, width: `${progress}%` as any }} />
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: status.bg }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: status.text }}>{statusLabel}</Text>
                      </View>
                      <Text style={{ fontSize: 11, color: '#A8A29E' }}>
                        {progress}% · {daysAgoText(latestUpdateByProject.get(p.id) ?? p.updated_at)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>
        ) : null}

        {receivedInvites.length > 0 ? (
          <View
            onLayout={(e) => {
              const y = e.nativeEvent.layout.y
              setInvitationsY(y)
            }}
            style={{ marginHorizontal: 16, marginTop: 16, borderRadius: 12, backgroundColor: '#FFFFFF', padding: 14, borderWidth: 1, borderColor: '#F3F4F6' }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#999' }}>WORK INVITATIONS</Text>
            <ScrollView
              nestedScrollEnabled
              scrollEnabled={receivedScrollable}
              showsVerticalScrollIndicator={receivedScrollable}
              style={{ height: receivedScrollable ? 280 : undefined, marginTop: 2 }}
              contentContainerStyle={{ paddingBottom: 6 }}
            >
              {receivedInvites.map((invite) => {
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

        {sentInvites.length > 0 ? (
          <View
            onLayout={(e) => {
              const y = e.nativeEvent.layout.y
              setInvitationsY((prev) => (prev === 0 ? y : prev))
            }}
            style={{ marginHorizontal: 16, marginTop: 16, borderRadius: 12, backgroundColor: '#FFFFFF', padding: 14, borderWidth: 1, borderColor: '#F3F4F6' }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#999' }}>INVITATIONS SENT</Text>
            <ScrollView
              nestedScrollEnabled
              scrollEnabled={sentScrollable}
              showsVerticalScrollIndicator={sentScrollable}
              style={{ height: sentScrollable ? 280 : undefined, marginTop: 2 }}
              contentContainerStyle={{ paddingBottom: 6 }}
            >
              {sentInvites.map((invite) => {
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
          <View style={{ marginHorizontal: 16, marginTop: 16, borderRadius: 12, backgroundColor: '#FFFFFF', padding: 14, borderWidth: 1, borderColor: '#F3F4F6' }}>
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

        <TouchableOpacity
          onPress={() => void signOut()}
          style={{
            marginHorizontal: 16,
            marginTop: 28,
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
            marginTop: 12,
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
    </SafeAreaView>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, borderRadius: 12, backgroundColor: '#FFFFFF', padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6' }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: BRAND }}>{value}</Text>
      <Text style={{ marginTop: 6, fontSize: 11, fontWeight: '600', color: MUTED }}>{label}</Text>
    </View>
  )
}
