import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import BottomNav from '@/components/shared/bottom-nav'
import ProfileAccountActions from '@/components/profile-account-actions'
import InvitationActions from '@/components/shared/invitation-actions'
import PaymentApprovalActions from '@/components/shared/payment-approval-actions'

function parseInviteSubject(subject: string) {
  const match = subject.match(/\[([0-9a-fA-F-]{36})\]:\s*(.+)$/)
  if (!match) return { projectId: null, projectName: subject }
  return { projectId: match[1], projectName: match[2] }
}

function initialsFromName(name?: string | null) {
  if (!name) return 'U'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'U'
}

function formatPhoneIndian(phone?: string | null) {
  if (!phone) return 'Not available'
  const digits = phone.replace(/\D/g, '')
  const local = digits.length >= 10 ? digits.slice(-10) : digits
  if (local.length !== 10) return phone
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`
}

function stageProgress(stage: string) {
  const map: Record<string, number> = {
    foundation: 10,
    plinth: 25,
    walls: 45,
    slab: 60,
    plastering: 80,
    finishing: 100,
  }
  return map[stage] ?? 0
}

function getStatusBarColor(status: string) {
  if (status === 'on_hold') return '#F59E0B'
  if (status === 'active') return '#10B981'
  if (status === 'completed') return '#6B7280'
  if (status === 'cancelled') return '#EF4444'
  return '#E0D5CC'
}

function daysAgoText(dateValue?: string) {
  if (!dateValue) return 'No updates yet'
  const now = Date.now()
  const then = new Date(dateValue).getTime()
  const diffDays = Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)))
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

const stagePillClass: Record<string, string> = {
  foundation: 'bg-gray-100 text-gray-700',
  plinth: 'bg-blue-100 text-blue-700',
  walls: 'bg-amber-100 text-amber-700',
  slab: 'bg-orange-100 text-orange-700',
  plastering: 'bg-purple-100 text-purple-700',
  finishing: 'bg-green-100 text-green-700',
}

async function signOutAction() {
  'use server'
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id,name,role,phone_number,city,pincode,bio')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) redirect('/register')

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let specialisations: string[] = []
  let trade: string | null = null

  if (profile.role === 'contractor') {
    const { data: contractorProfile } = await admin
      .from('contractor_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    const record = (contractorProfile ?? {}) as Record<string, unknown>
    specialisations = Array.isArray(record.specialisations)
      ? (record.specialisations as string[])
      : Array.isArray(record.specialization)
        ? (record.specialization as string[])
        : []
  }

  if (profile.role === 'worker') {
    const { data: workerProfile } = await admin
      .from('worker_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    const record = (workerProfile ?? {}) as Record<string, unknown>
    trade = typeof record.trade === 'string' ? record.trade : Array.isArray(record.skill_tags) ? String((record.skill_tags as string[])[0] ?? '') : null
  }

  const { data: reviews } = await admin.from('reviews').select('rating').eq('reviewee_id', user.id)
  const reviewsCount = (reviews ?? []).length
  const avgRating =
    reviewsCount > 0
      ? Number(((reviews ?? []).reduce((sum, review) => sum + Number(review.rating), 0) / reviewsCount).toFixed(1))
      : 0

  let projectsCompleted = 0
  if (profile.role === 'contractor') {
    const { data } = await admin
      .from('projects')
      .select('id')
      .eq('contractor_id', user.id)
      .eq('status', 'completed')
    projectsCompleted = (data ?? []).length
  } else if (profile.role === 'worker') {
    const { data: workerMembership } = await admin
      .from('project_members')
      .select('project_id')
      .eq('user_id', user.id)
    const workerProjectIds = Array.from(new Set((workerMembership ?? []).map((m) => m.project_id)))
    if (workerProjectIds.length) {
      const { data } = await admin.from('projects').select('id').in('id', workerProjectIds).eq('status', 'completed')
      projectsCompleted = (data ?? []).length
    }
  }

  let recentProjects:
    | Array<{
        id: string
        name: string
        address: string
        city: string
        current_stage: string
        status: string
        contractor_id: string | null
        customer_id: string
      }>
    = []

  if (profile.role === 'customer') {
    const { data } = await admin
      .from('projects')
      .select('id,name,address,city,current_stage,status,contractor_id,customer_id,created_at')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    const ownedProjects = (data ?? []) as typeof recentProjects
    const ownedIds = ownedProjects.map((project) => project.id)
    if (ownedIds.length > 0) {
      const { data: members } = await admin
        .from('project_members')
        .select('project_id,user_id,role')
        .in('project_id', ownedIds)
      const memberRows = (members ?? []) as Array<{ project_id: string; user_id: string; role: string | null }>
      recentProjects = ownedProjects
        .filter((project) => {
          if (project.contractor_id) return memberRows.some((m) => m.project_id === project.id && m.user_id === project.contractor_id)
          return memberRows.some((m) => m.project_id === project.id && m.role === 'worker')
        })
        .slice(0, 3)
    } else {
      recentProjects = []
    }
  } else if (profile.role === 'contractor') {
    const { data } = await admin
      .from('projects')
      .select('id,name,address,city,current_stage,status,contractor_id,customer_id,created_at')
      .eq('contractor_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3)
    recentProjects = (data ?? []) as typeof recentProjects
  } else {
    const { data: memberships } = await admin
      .from('project_members')
      .select('project_id')
      .eq('user_id', user.id)
    const ids = Array.from(new Set((memberships ?? []).map((m) => m.project_id))).slice(0, 10)
    if (ids.length) {
      const { data } = await admin
        .from('projects')
        .select('id,name,address,city,current_stage,status,contractor_id,customer_id,created_at')
        .in('id', ids)
        .order('created_at', { ascending: false })
        .limit(3)
      recentProjects = (data ?? []) as typeof recentProjects
    }
  }

  const recentProjectIds = recentProjects.map((project) => project.id)
  const { data: recentProjectMembers } = recentProjectIds.length
    ? await admin.from('project_members').select('project_id').in('project_id', recentProjectIds)
    : { data: [] as Array<{ project_id: string }> }
  const recentProjectHasMembers = new Set((recentProjectMembers ?? []).map((member) => member.project_id))
  const { data: recentWorkerMembers } = recentProjectIds.length
    ? await admin.from('project_members').select('project_id').in('project_id', recentProjectIds).eq('role', 'worker')
    : { data: [] as Array<{ project_id: string }> }
  const recentProjectHasWorkers = new Set((recentWorkerMembers ?? []).map((member) => member.project_id))
  const { data: updates } = recentProjectIds.length
    ? await admin
        .from('daily_updates')
        .select('project_id,created_at')
        .in('project_id', recentProjectIds)
        .order('created_at', { ascending: false })
    : { data: [] as Array<{ project_id: string; created_at: string }> }
  const latestUpdateByProject = new Map<string, string>()
  for (const update of updates ?? []) {
    if (!latestUpdateByProject.has(update.project_id)) {
      latestUpdateByProject.set(update.project_id, update.created_at)
    }
  }

  const { data: receivedEnquiries } =
    profile.role === 'contractor' || profile.role === 'worker'
      ? await admin
          .from('enquiries')
          .select('id,subject,message,status,customer_id')
          .eq('recipient_id', user.id)
          .ilike('subject', 'Project invitation [%')
          .order('created_at', { ascending: false })
      : { data: [] as Array<{ id: string; subject: string; message: string; status: string; customer_id: string }> }

  const senderIds = Array.from(new Set((receivedEnquiries ?? []).map((item) => item.customer_id)))
  const { data: senderUsers } = senderIds.length
    ? await admin.from('users').select('id,name').in('id', senderIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const senderMap = new Map((senderUsers ?? []).map((u) => [u.id, u.name]))

  const { data: sentEnquiries } =
    profile.role === 'customer'
      ? await admin
          .from('enquiries')
          .select('id,subject,message,status,recipient_id')
          .eq('customer_id', user.id)
          .ilike('subject', 'Project invitation [%')
          .order('created_at', { ascending: false })
      : { data: [] as Array<{ id: string; subject: string; message: string; status: string; recipient_id: string }> }

  const { data: paymentApprovalRows } =
    profile.role === 'contractor' || profile.role === 'worker'
      ? await admin
          .from('payments')
          .select('id,project_id,amount,paid_to_category,created_at')
          .eq('paid_to', user.id)
          .eq('status', 'pending_confirmation')
          .order('created_at', { ascending: false })
      : { data: [] as Array<{ id: string; project_id: string; amount: number; paid_to_category: string; created_at: string }> }
  const paymentProjectIds = Array.from(new Set((paymentApprovalRows ?? []).map((row) => row.project_id)))
  const { data: paymentProjects } = paymentProjectIds.length
    ? await admin.from('projects').select('id,name').in('id', paymentProjectIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const paymentProjectNameById = new Map((paymentProjects ?? []).map((project) => [project.id, project.name]))

  const recipientIds = Array.from(new Set((sentEnquiries ?? []).map((item) => item.recipient_id)))
  const { data: recipientUsers } = recipientIds.length
    ? await admin.from('users').select('id,name,role').in('id', recipientIds)
    : { data: [] as Array<{ id: string; name: string; role: string }> }
  const recipientMap = new Map((recipientUsers ?? []).map((u) => [u.id, u]))
  const parsedSentPairs = (sentEnquiries ?? [])
    .map((invite) => {
      const parsed = parseInviteSubject(invite.subject)
      if (!parsed.projectId || !invite.recipient_id) return null
      return { inviteId: invite.id, projectId: parsed.projectId, recipientId: invite.recipient_id }
    })
    .filter(Boolean) as Array<{ inviteId: string; projectId: string; recipientId: string }>
  const sentProjectIds = Array.from(new Set(parsedSentPairs.map((p) => p.projectId)))
  const { data: sentProjects } = sentProjectIds.length
    ? await admin.from('projects').select('id,contractor_id').in('id', sentProjectIds)
    : { data: [] as Array<{ id: string; contractor_id: string | null }> }
  const contractorByProject = new Map((sentProjects ?? []).map((p) => [p.id, p.contractor_id]))
  const { data: inviteMemberships } = sentProjectIds.length && recipientIds.length
    ? await admin
        .from('project_members')
        .select('project_id,user_id')
        .in('project_id', sentProjectIds)
        .in('user_id', recipientIds)
    : { data: [] as Array<{ project_id: string; user_id: string }> }
  const membershipSet = new Set((inviteMemberships ?? []).map((m) => `${m.project_id}:${m.user_id}`))
  const approvedInviteMap = new Map<string, boolean>()
  const pendingInviteRoleMap = new Map<string, 'worker' | 'contractor'>()
  for (const pair of parsedSentPairs) {
    approvedInviteMap.set(pair.inviteId, membershipSet.has(`${pair.projectId}:${pair.recipientId}`))
    const directRole = recipientMap.get(pair.recipientId)?.role
    const inferredRole =
      directRole === 'worker' || directRole === 'contractor'
        ? directRole
        : contractorByProject.get(pair.projectId) === pair.recipientId
          ? 'contractor'
          : 'worker'
    pendingInviteRoleMap.set(pair.inviteId, inferredRole)
  }

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: '#FAFAFA' }}>
      <div className="mx-auto w-full max-w-md px-4 pt-6">
        <section className="mb-6 flex justify-center">
          <div
            className="flex h-22 w-22 items-center justify-center rounded-full text-3xl font-bold text-white"
            style={{
              width: '88px',
              height: '88px',
              backgroundColor: '#E8590C',
              border: '3px solid white',
            }}
          >
            {initialsFromName(profile.name)}
          </div>
        </section>
        {/* Profile Info */}
        <section className="mb-6 text-center">
          <h2 className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>
            {profile.name}
          </h2>
          <div className="mt-3 inline-flex rounded-full px-3 py-1.5 text-xs font-semibold text-white" style={{ backgroundColor: '#E8590C' }}>
            {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
          </div>
          <p className="mt-3 text-sm font-medium" style={{ color: '#7A6F66' }}>
            {formatPhoneIndian(profile.phone_number)}
          </p>
          <p className="mt-1 text-xs font-medium" style={{ color: '#999' }}>
            {profile.city} · {profile.pincode}
          </p>
        </section>

        {/* Stats Row */}
        {(profile.role === 'contractor' || profile.role === 'worker') && (
          <section className="mb-6 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-white p-4 text-center shadow-sm">
              <p className="text-2xl font-bold" style={{ color: '#E8590C' }}>
                {avgRating.toFixed(1)}
              </p>
              <p className="mt-2 text-xs font-medium" style={{ color: '#7A6F66' }}>
                Rating
              </p>
            </div>
            <div className="rounded-lg bg-white p-4 text-center shadow-sm">
              <p className="text-2xl font-bold" style={{ color: '#E8590C' }}>
                {reviewsCount}
              </p>
              <p className="mt-2 text-xs font-medium" style={{ color: '#7A6F66' }}>
                Reviews
              </p>
            </div>
            <div className="rounded-lg bg-white p-4 text-center shadow-sm">
              <p className="text-2xl font-bold" style={{ color: '#E8590C' }}>
                {projectsCompleted}
              </p>
              <p className="mt-2 text-xs font-medium" style={{ color: '#7A6F66' }}>
                Completed
              </p>
            </div>
          </section>
        )}

        {/* Location */}
        {profile.city ? (
          <section className="mb-4 rounded-lg bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-bold" style={{ color: '#999' }}>
              LOCATION
            </p>
            <p className="text-sm font-medium" style={{ color: '#1A1A1A' }}>
              {profile.city}
              {profile.pincode && `, ${profile.pincode}`}
            </p>
          </section>
        ) : null}

        {/* About */}
        {profile.bio ? (
          <section className="mb-4 rounded-lg bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-bold" style={{ color: '#999' }}>
              ABOUT
            </p>
            <p className="text-sm font-medium leading-relaxed" style={{ color: '#1A1A1A' }}>
              {profile.bio}
            </p>
          </section>
        ) : null}

        {/* Specialisations (Contractor) */}
        {profile.role === 'contractor' ? (
          <>
            <section className="mb-4 rounded-lg bg-white p-4 shadow-sm">
              <p className="mb-3 text-xs font-bold" style={{ color: '#999' }}>
                SPECIALISATIONS
              </p>
              <div className="flex flex-wrap gap-2">
                {specialisations.length ? (
                  specialisations.map((item) => (
                    <span
                      key={item}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold text-white"
                      style={{ backgroundColor: '#E8590C' }}
                    >
                      {item}
                    </span>
                  ))
                ) : (
                  <p className="text-xs font-medium" style={{ color: '#7A6F66' }}>
                    Not added yet
                  </p>
                )}
              </div>
            </section>

          </>
        ) : null}

        {/* Trade (Worker) */}
        {profile.role === 'worker' ? (
          <>
            <section className="mb-4 rounded-lg bg-white p-4 shadow-sm">
              <p className="mb-3 text-xs font-bold" style={{ color: '#999' }}>
                TRADE
              </p>
              {trade ? (
                <span
                  className="inline-flex rounded-full px-3 py-1.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: '#E8590C' }}
                >
                  {trade}
                </span>
              ) : (
                <p className="text-xs font-medium" style={{ color: '#7A6F66' }}>
                  Not added yet
                </p>
              )}
            </section>

          </>
        ) : null}

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <section className="mb-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold" style={{ color: '#1A1A1A' }}>
                Recent Projects
              </h3>
              <Link href="/projects" className="text-sm font-semibold transition-colors hover:opacity-80" style={{ color: '#E8590C' }}>
                View all →
              </Link>
            </div>
            <div
              className="space-y-3 pr-1"
              style={{ maxHeight: recentProjects.length > 2 ? 360 : undefined, overflowY: recentProjects.length > 2 ? 'auto' : 'visible' }}
            >
              {recentProjects.map((project) => {
                const progress = stageProgress(project.current_stage)
                const effectiveStatus =
                  (project.status === 'pending' || project.status === 'on_hold') && recentProjectHasMembers.has(project.id)
                    ? 'active'
                    : project.status
                const statusBarColor = getStatusBarColor(effectiveStatus)
                const hideStagePill = recentProjectHasWorkers.has(project.id)
                return (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="block rounded-lg bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                    style={{ borderLeft: `4px solid ${statusBarColor}` }}
                  >
                    <div className="p-4">
                      <h4 className="text-base font-bold" style={{ color: '#1A1A1A' }}>
                        {project.name}
                      </h4>
                      <div className="mt-2 flex items-center gap-1.5">
                        <svg
                          className="h-4 w-4 flex-shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          style={{ color: '#7A6F66' }}
                        >
                          <path d="M12 2C7.6 2 4 5.6 4 10c0 5.1 8 12 8 12s8-6.9 8-12c0-4.4-3.6-8-8-8z" />
                        </svg>
                        <p className="text-xs font-medium" style={{ color: '#7A6F66' }}>
                          {project.address}, {project.city}
                        </p>
                      </div>
                      {!hideStagePill ? (
                        <div className="mt-3 flex gap-2">
                          <span
                            className="rounded-full px-2.5 py-1 text-xs font-semibold"
                            style={{ backgroundColor: '#FFF8F5', color: '#E8590C' }}
                          >
                            {project.current_stage.charAt(0).toUpperCase() + project.current_stage.slice(1)}
                          </span>
                        </div>
                      ) : null}
                      <div className="mt-4">
                        <div className="h-1 rounded-full" style={{ backgroundColor: '#E0D5CC' }}>
                          <div className="h-1 rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: '#E8590C' }} />
                        </div>
                        <p className="mt-2 text-xs font-medium" style={{ color: '#7A6F66' }}>
                          {progress}% complete
                        </p>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <p className="text-xs font-medium" style={{ color: '#1A1A1A' }}>
                          {profile.role === 'customer' ? 'Contractor:' : 'Customer:'}{' '}
                          <span style={{ color: '#7A6F66' }}>Assigned</span>
                        </p>
                        <p className="text-xs font-medium" style={{ color: '#999' }}>
                          {daysAgoText(latestUpdateByProject.get(project.id))}
                        </p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {(receivedEnquiries ?? []).length > 0 ? (
          <section id="invitations" className="mb-6 rounded-lg bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-bold" style={{ color: '#999' }}>
              WORK INVITATIONS
            </p>
            <div
              className="space-y-3 pr-1"
              style={{ maxHeight: (receivedEnquiries ?? []).length > 2 ? 320 : undefined, overflowY: (receivedEnquiries ?? []).length > 2 ? 'auto' : 'visible' }}
            >
              {(receivedEnquiries ?? []).map((invite) => {
                const parsed = parseInviteSubject(invite.subject)
                const senderName = senderMap.get(invite.customer_id) ?? 'Customer'
                const isPending = invite.status === 'open'
                const statusLabel = isPending ? 'Pending your response' : invite.status === 'responded' ? 'Approved' : 'Declined'
                const statusClass = isPending
                  ? 'bg-amber-50 text-amber-700'
                  : invite.status === 'responded'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-orange-50 text-orange-700'
                return (
                  <div
                    key={invite.id}
                    className="rounded-xl border border-slate-100 bg-white p-3"
                    style={{ borderLeft: `4px solid ${isPending ? '#F59E0B' : invite.status === 'responded' ? '#10B981' : '#FB923C'}` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold" style={{ color: '#1A1A1A' }}>{parsed.projectName}</p>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClass}`}>{statusLabel}</span>
                    </div>
                    <p className="mt-1 text-xs" style={{ color: '#7A6F66' }}>From: {senderName}</p>
                    {isPending && parsed.projectId ? (
                      <div className="mt-3">
                        <InvitationActions projectId={parsed.projectId} />
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}

        {(sentEnquiries ?? []).length > 0 ? (
          <section className="mb-6 rounded-lg bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-bold" style={{ color: '#999' }}>
              INVITATIONS SENT
            </p>
            <div
              className="space-y-3 pr-1"
              style={{ maxHeight: (sentEnquiries ?? []).length > 2 ? 320 : undefined, overflowY: (sentEnquiries ?? []).length > 2 ? 'auto' : 'visible' }}
            >
              {(sentEnquiries ?? []).map((invite) => {
                const parsed = parseInviteSubject(invite.subject)
                const recipient = recipientMap.get(invite.recipient_id)
                const approvedByMembership = approvedInviteMap.get(invite.id) === true
                const inviteRole = pendingInviteRoleMap.get(invite.id) ?? (recipient?.role === 'worker' ? 'worker' : 'contractor')
                const roleLabel = inviteRole === 'worker' ? 'Worker' : 'Contractor'
                const waitingLabel = inviteRole === 'worker' ? 'Waiting worker approval' : 'Waiting contractor approval'
                const statusLabel =
                  approvedByMembership || invite.status === 'responded'
                    ? 'Invitation approved'
                    : invite.status === 'open'
                      ? waitingLabel
                      : 'Declined'
                const approved = approvedByMembership || invite.status === 'responded'
                const statusClass = approved
                  ? 'bg-emerald-50 text-emerald-700'
                  : invite.status === 'open'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-orange-50 text-orange-700'
                return (
                  <div
                    key={invite.id}
                    className="rounded-xl border border-slate-100 bg-white p-3"
                    style={{ borderLeft: `4px solid ${approved ? '#10B981' : invite.status === 'open' ? '#F59E0B' : '#FB923C'}` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold" style={{ color: '#1A1A1A' }}>{parsed.projectName}</p>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClass}`}>{statusLabel}</span>
                    </div>
                    <p className="mt-1 text-xs" style={{ color: '#7A6F66' }}>
                      To: {recipient?.name ?? roleLabel} ({roleLabel})
                    </p>
                    {parsed.projectId && approved ? (
                      <Link
                        href={
                          recipient?.role === 'worker'
                            ? `/projects/${parsed.projectId}?workerDetails=1`
                            : `/projects/${parsed.projectId}`
                        }
                        className="mt-3 inline-flex rounded-lg bg-orange-50 px-2.5 py-1.5 text-xs font-semibold"
                        style={{ color: '#E8590C' }}
                      >
                        {recipient?.role === 'worker' ? 'Open worker details' : 'Open project details'}
                      </Link>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}

        {(paymentApprovalRows ?? []).length > 0 ? (
          <section className="mb-6 rounded-lg bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-bold" style={{ color: '#999' }}>
              PAYMENT APPROVAL REQUESTS
            </p>
            <div className="space-y-3">
              {(paymentApprovalRows ?? []).map((payment) => (
                <div
                  key={payment.id}
                  className="rounded-xl border border-slate-100 bg-white p-3"
                  style={{ borderLeft: '4px solid #F59E0B' }}
                >
                  <p className="text-sm font-semibold" style={{ color: '#1A1A1A' }}>
                    {paymentProjectNameById.get(payment.project_id) ?? 'Project'}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: '#7A6F66' }}>
                    {`Amount: ₹${payment.amount.toLocaleString('en-IN')} · ${payment.paid_to_category}`}
                  </p>
                  <Link
                    href={`/projects/${payment.project_id}?tab=payments&paymentId=${payment.id}`}
                    className="mt-2 inline-flex rounded-lg bg-orange-50 px-2.5 py-1.5 text-xs font-semibold"
                    style={{ color: '#E8590C' }}
                  >
                    Open payments tab
                  </Link>
                  <PaymentApprovalActions projectId={payment.project_id} paymentId={payment.id} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Sign Out Button */}
        <form action={signOutAction} className="mb-3">
          <button
            type="submit"
            className="w-full rounded-lg px-4 py-3 text-sm font-semibold transition-colors hover:bg-red-50"
            style={{
              border: '2px solid #EF4444',
              color: '#EF4444',
            }}
          >
            Sign Out
          </button>
        </form>
        <div className="mb-24">
          <ProfileAccountActions />
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
