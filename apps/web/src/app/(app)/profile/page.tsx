import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import BottomNav from '@/components/shared/bottom-nav'
import ProfileAccountActions from '@/components/profile-account-actions'
import InvitationActions from '@/components/shared/invitation-actions'
import PaymentApprovalActions from '@/components/shared/payment-approval-actions'
import ProfileEditForm from '@/components/profile-edit-form'
import ProfessionalImagesManager from '@/components/professional-images-manager'

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

function getStatusBarColor(status: string) {
  if (status === 'on_hold') return '#F59E0B'
  if (status === 'active') return '#10B981'
  if (status === 'completed') return '#6B7280'
  if (status === 'cancelled') return '#EF4444'
  return '#E0D5CC'
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
    .select('id,name,role,phone_number,city,pincode,bio,profile_photo_url')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) redirect('/register')

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let specialisations: string[] = []
  let trade: string | null = null
  let contractorYearsExperience = 0
  let workerYearsExperience = 0

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
    contractorYearsExperience = Number(record.years_experience ?? 0)
  }

  if (profile.role === 'worker') {
    const { data: workerProfile } = await admin
      .from('worker_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    const record = (workerProfile ?? {}) as Record<string, unknown>
    trade = typeof record.trade === 'string' ? record.trade : Array.isArray(record.skill_tags) ? String((record.skill_tags as string[])[0] ?? '') : null
    workerYearsExperience = Number(record.years_experience ?? 0)
  }

  const { data: professionalImagesRows } =
    profile.role === 'contractor' || profile.role === 'worker'
      ? await (admin as any)
          .from('professional_images')
          .select('id,image_url,created_at')
          .eq('professional_id', user.id)
          .order('created_at', { ascending: true })
      : { data: [] as Array<{ id: string; image_url: string; created_at: string }> }
  const professionalImages = (professionalImagesRows ?? []) as Array<{
    id: string
    image_url: string
    created_at: string
  }>

  const { data: reviews } = await admin
    .from('reviews')
    .select('id,rating,comment,created_at,reviewer_id,project_id')
    .eq('reviewee_id', user.id)
    .order('created_at', { ascending: false })
  const reviewsCount = (reviews ?? []).length
  const avgRating =
    reviewsCount > 0
      ? Number(((reviews ?? []).reduce((sum, review) => sum + Number(review.rating), 0) / reviewsCount).toFixed(1))
      : 0
  const { count: profileViewsCount } =
    profile.role === 'contractor' || profile.role === 'worker'
      ? await (admin as any)
          .from('professional_profile_views')
          .select('id', { count: 'exact', head: true })
          .eq('professional_id', user.id)
      : { count: 0 as number | null }
  const reviewRows = (reviews ?? []) as Array<{
    id: string
    rating: number
    comment: string | null
    created_at: string
    reviewer_id: string
    project_id: string
  }>
  const reviewerIds = Array.from(new Set(reviewRows.map((review) => review.reviewer_id)))
  const reviewedProjectIds = Array.from(new Set(reviewRows.map((review) => review.project_id)))
  const { data: reviewUsers } = reviewerIds.length
    ? await admin.from('users').select('id,name').in('id', reviewerIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const reviewerNameById = new Map((reviewUsers ?? []).map((u) => [u.id, u.name]))
  const { data: reviewedProjects } = reviewedProjectIds.length
    ? await admin.from('projects').select('id,name').in('id', reviewedProjectIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const reviewedProjectNameById = new Map((reviewedProjects ?? []).map((project) => [project.id, project.name]))

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

  const receivedEnquiriesForDisplay = (receivedEnquiries ?? []).filter((invite) => invite.status !== 'responded')
  const sentEnquiriesForDisplay = (sentEnquiries ?? []).filter((invite) => {
    const approvedByMembership = approvedInviteMap.get(invite.id) === true
    return invite.status !== 'responded' && !approvedByMembership
  })

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#F2EDE8' }}>
      <div className="mx-auto w-full max-w-md px-4 pt-6">
        <section className="mb-6 flex justify-center">
          <div
            className="flex h-22 w-22 items-center justify-center rounded-full text-3xl font-bold text-white"
            style={{
              width: '88px',
              height: '88px',
              backgroundColor: '#D85A30',
              border: '3px solid white',
              overflow: 'hidden',
            }}
          >
            {profile.profile_photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.profile_photo_url} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              profile.name?.trim()?.charAt(0)?.toUpperCase() || 'U'
            )}
          </div>
        </section>

        <ProfileEditForm
          role={profile.role}
          initialPhotoUrl={profile.profile_photo_url ?? ''}
          initialCity={profile.city ?? ''}
          initialPincode={profile.pincode ?? ''}
          initialYearsExperience={contractorYearsExperience}
          initialWorkerYearsExperience={workerYearsExperience}
        />

        {/* Profile Info */}
        <section className="mb-6 text-center">
          <h2 className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>
            {profile.name}
          </h2>
          <div className="mt-3 inline-flex rounded-full px-3 py-1.5 text-xs font-semibold text-white" style={{ backgroundColor: '#D85A30' }}>
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
              <p className="text-2xl font-bold" style={{ color: '#D85A30' }}>
                {avgRating.toFixed(1)}
              </p>
              <p className="mt-2 text-xs font-medium" style={{ color: '#7A6F66' }}>
                Rating
              </p>
            </div>
            <div className="rounded-lg bg-white p-4 text-center shadow-sm">
              <p className="text-2xl font-bold" style={{ color: '#D85A30' }}>
                {projectsCompleted}
              </p>
              <p className="mt-2 text-xs font-medium" style={{ color: '#7A6F66' }}>
                Completed
              </p>
            </div>
            <div className="rounded-lg bg-white p-4 text-center shadow-sm">
              <p className="text-2xl font-bold" style={{ color: '#D85A30' }}>
                {profileViewsCount ?? 0}
              </p>
              <p className="mt-2 text-xs font-medium" style={{ color: '#7A6F66' }}>
                Profile views
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
                  style={{ backgroundColor: '#D85A30' }}
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

        {(profile.role === 'contractor' || profile.role === 'worker') ? (
          <section className="mb-4 rounded-lg bg-white p-4 shadow-sm">
            <p className="text-sm font-medium" style={{ color: '#7A6F66' }}>
              {(profile.role === 'contractor' ? contractorYearsExperience : workerYearsExperience)} years of experience
            </p>
          </section>
        ) : null}

        {(profile.role === 'contractor' || profile.role === 'worker') ? (
          <ProfessionalImagesManager initialItems={professionalImages} canEdit />
        ) : null}

        {receivedEnquiriesForDisplay.length > 0 ? (
          <section id="invitations" className="mb-6 rounded-lg bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-bold" style={{ color: '#999' }}>
              WORK INVITATIONS
            </p>
            <div
              className="space-y-3 pr-1"
              style={{ maxHeight: receivedEnquiriesForDisplay.length > 2 ? 320 : undefined, overflowY: receivedEnquiriesForDisplay.length > 2 ? 'auto' : 'visible' }}
            >
              {receivedEnquiriesForDisplay.map((invite) => {
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

        {sentEnquiriesForDisplay.length > 0 ? (
          <section className="mb-6 rounded-lg bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-bold" style={{ color: '#999' }}>
              INVITATIONS SENT
            </p>
            <div
              className="space-y-3 pr-1"
              style={{ maxHeight: sentEnquiriesForDisplay.length > 2 ? 320 : undefined, overflowY: sentEnquiriesForDisplay.length > 2 ? 'auto' : 'visible' }}
            >
              {sentEnquiriesForDisplay.map((invite) => {
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
                        style={{ color: '#D85A30' }}
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
                    style={{ color: '#D85A30' }}
                  >
                    Open payments tab
                  </Link>
                  <PaymentApprovalActions projectId={payment.project_id} paymentId={payment.id} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {(profile.role === 'contractor' || profile.role === 'worker') ? (
          <section id="reviews" className="mb-6 rounded-lg bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-bold" style={{ color: '#999' }}>
              REVIEWS
            </p>
            {reviewRows.length === 0 ? (
              <p className="text-sm font-medium" style={{ color: '#7A6F66' }}>
                No reviews yet.
              </p>
            ) : (
              <div className="space-y-3">
                {reviewRows.map((review) => (
                  <div
                    key={review.id}
                    className="rounded-xl border border-slate-100 bg-white p-3"
                    style={{ borderLeft: '4px solid #D85A30' }}
                  >
                    <p className="text-sm font-semibold" style={{ color: '#1A1A1A' }}>
                      {reviewedProjectNameById.get(review.project_id) ?? 'Project'}
                    </p>
                    <p className="mt-1 text-xs font-semibold" style={{ color: '#B45309' }}>
                      {`★ ${Number(review.rating).toFixed(1)} · by ${reviewerNameById.get(review.reviewer_id) ?? 'Customer'}`}
                    </p>
                    {review.comment ? (
                      <p className="mt-2 text-xs" style={{ color: '#7A6F66' }}>
                        {review.comment}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs" style={{ color: '#9CA3AF' }}>
                        No written comment
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {/* Sign Out Button */}
        <form action={signOutAction} className="mb-2">
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
        <div className="mb-6">
          <ProfileAccountActions />
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
