import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import BottomNav from '@/components/shared/bottom-nav'
import ProfileAccountActions from '@/components/profile-account-actions'
import InvitationActions from '@/components/shared/invitation-actions'
import PaymentApprovalActions from '@/components/shared/payment-approval-actions'
import ProfessionalImagesManager from '@/components/professional-images-manager'
import { ProfileEditPanelProvider, ProfileEditFormWithPanel } from '@/components/profile/profile-edit-panel'
import CustomerProfileHeader from '@/components/profile/customer-profile-header'
import ProfessionalProfileHero from '@/components/profile/professional-profile-hero'
import ConceptBReviewCards from '@/components/profile/concept-b-review-cards'
import { formatPhoneIndian, formatReviewsSectionCount } from '@/lib/utils'

function parseInviteSubject(subject: string) {
  const match = subject.match(/\[([0-9a-fA-F-]{36})\]:\s*(.+)$/)
  if (!match) return { projectId: null, projectName: subject }
  return { projectId: match[1], projectName: match[2] }
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
  let workerSkillTags: string[] = []
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
        : Array.isArray(record.skill_tags)
          ? (record.skill_tags as string[])
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
    const rawWorkerTags = Array.isArray(record.skill_tags) ? (record.skill_tags as unknown[]) : []
    workerSkillTags = [...new Set(rawWorkerTags.map((t) => String(t).trim()).filter(Boolean))]
    trade =
      typeof record.trade === 'string'
        ? record.trade
        : workerSkillTags[0]
          ? workerSkillTags[0]
          : null
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
  const { data: reviewUsers } = reviewerIds.length
    ? await admin.from('users').select('id,name').in('id', reviewerIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const reviewerNameById = new Map((reviewUsers ?? []).map((u) => [u.id, u.name]))

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
  const customerActiveCount = Array.from(approvedInviteMap.values()).filter(Boolean).length

  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: '#F2EDE8' }}>
      <div className="mx-auto w-full max-w-md">
        {profile.role === 'customer' ? (
          <ProfileEditPanelProvider>
            <CustomerProfileHeader
              name={profile.name}
              role={profile.role}
              phone={profile.phone_number}
              city={profile.city}
              pincode={profile.pincode}
              profilePhotoUrl={profile.profile_photo_url}
              invitationsPending={sentEnquiriesForDisplay.length}
              activeCount={customerActiveCount}
              completedCount={projectsCompleted}
            />
            <ProfileEditFormWithPanel
              role={profile.role}
              initialPhotoUrl={profile.profile_photo_url ?? ''}
              initialCity={profile.city ?? ''}
              initialPincode={profile.pincode ?? ''}
              initialYearsExperience={contractorYearsExperience}
              initialWorkerYearsExperience={workerYearsExperience}
            />

            <section className="mx-4 mb-4 mt-3.5 overflow-hidden rounded-2xl border border-[#E8DDD4] bg-white">
              <div className="flex items-center justify-between border-b border-[#F2EDE8] px-4 py-3">
                <p className="text-[9px] font-bold tracking-widest" style={{ color: '#A8A29E' }}>INVITATIONS SENT</p>
                {sentEnquiriesForDisplay.length > 0 ? (
                  <p className="text-[9px] font-bold text-[#D85A30]">{`${sentEnquiriesForDisplay.length} pending`}</p>
                ) : null}
              </div>
              <div
                className="pr-1"
                style={{ maxHeight: sentEnquiriesForDisplay.length > 2 ? 320 : undefined, overflowY: sentEnquiriesForDisplay.length > 2 ? 'auto' : 'visible' }}
              >
                {sentEnquiriesForDisplay.map((invite, index) => {
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
                    <div key={invite.id} className="border-b border-[#F2EDE8] px-4 py-3" style={{ borderBottomWidth: index === sentEnquiriesForDisplay.length - 1 ? 0 : 1 }}>
                      <div className="rounded-xl border border-slate-100 bg-white p-3" style={{ borderLeft: `4px solid ${approved ? '#10B981' : invite.status === 'open' ? '#F59E0B' : '#FB923C'}` }}>
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
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="mx-4 mb-4 mt-2.5 flex gap-2">
              <div className="flex-1 cursor-default rounded-xl border border-[#E8DDD4] bg-white py-2.5 text-center">
                <div className="text-sm">⚙️</div>
                <p className="mt-1 text-[7px] font-semibold" style={{ color: '#78716C' }}>Settings</p>
              </div>
              <div className="flex-1 cursor-default rounded-xl border border-[#E8DDD4] bg-white py-2.5 text-center">
                <div className="text-sm">📄</div>
                <p className="mt-1 text-[7px] font-semibold" style={{ color: '#78716C' }}>Reports</p>
              </div>
              <div className="flex-1 cursor-default rounded-xl border border-[#E8DDD4] bg-white py-2.5 text-center">
                <div className="text-sm">❓</div>
                <p className="mt-1 text-[7px] font-semibold" style={{ color: '#78716C' }}>Help</p>
              </div>
            </section>

            <form action={signOutAction} className="mx-4 mt-2.5">
              <button
                type="submit"
                className="w-full rounded-xl border border-[#E8DDD4] py-2.5 text-[10px] font-semibold text-[#78716C] transition-colors hover:bg-[#F2EDE8]"
              >
                Sign out
              </button>
            </form>
            <div className="mx-4 mb-6 mt-2">
              <ProfileAccountActions />
            </div>
          </ProfileEditPanelProvider>
        ) : (
          <ProfileEditPanelProvider>
            <ProfessionalProfileHero
              name={profile.name}
              role={profile.role}
              profilePhotoUrl={profile.profile_photo_url}
              coverImageUrl={professionalImages[0]?.image_url ?? null}
              avgRating={avgRating}
              projectsCompleted={projectsCompleted}
            />

            <section className="flex items-stretch justify-around border-b border-[#E8DDD4] bg-white px-4 py-2.5">
              <a href="#reviews" className="text-center">
                <p className="text-base font-extrabold text-[#D85A30]">{avgRating.toFixed(1)}</p>
                <p className="mt-0.5 text-[7px]" style={{ color: '#78716C' }}>Rating</p>
              </a>
              <div className="my-1 w-px self-stretch bg-[#E8DDD4]" />
              <div className="text-center">
                <p className="text-base font-extrabold text-[#D85A30]">{projectsCompleted}</p>
                <p className="mt-0.5 text-[7px]" style={{ color: '#78716C' }}>Done</p>
              </div>
              <div className="my-1 w-px self-stretch bg-[#E8DDD4]" />
              <div className="text-center">
                <p className="text-base font-extrabold text-[#D85A30]">{profileViewsCount ?? 0}</p>
                <p className="mt-0.5 text-[7px]" style={{ color: '#78716C' }}>Views</p>
              </div>
              <div className="my-1 w-px self-stretch bg-[#E8DDD4]" />
              <div className="text-center">
                <p className="text-base font-extrabold text-[#D85A30]">{`${profile.role === 'contractor' ? contractorYearsExperience : workerYearsExperience}y`}</p>
                <p className="mt-0.5 text-[7px]" style={{ color: '#78716C' }}>Exp</p>
              </div>
            </section>

            <section className="flex flex-col gap-3 border-b border-[#E8DDD4] bg-white px-4 py-4">
              <p className="text-[15px] font-bold leading-snug text-[#2C2C2A]">{`📍 ${profile.city ?? '—'} · ${profile.pincode ?? '—'}`}</p>
              <p className="text-[15px] font-bold leading-snug text-[#2C2C2A]">{`📞 ${formatPhoneIndian(profile.phone_number)}`}</p>
              <p className="text-[15px] font-bold leading-snug text-[#2C2C2A]">{`👷 ${profile.role === 'contractor' ? contractorYearsExperience : workerYearsExperience} yrs experience`}</p>
            </section>

            {((profile.role === 'contractor' && specialisations.length > 0) ||
              (profile.role === 'worker' && workerSkillTags.length > 0)) ? (
              <section className="mx-4 mt-3 flex flex-wrap gap-2">
                {(profile.role === 'contractor' ? specialisations : workerSkillTags).map((item, idx) => (
                  <span
                    key={`${item}-${idx}`}
                    className="rounded-full px-3 py-1.5 text-xs font-bold text-white"
                    style={{ backgroundColor: '#D85A30' }}
                  >
                    {item}
                  </span>
                ))}
              </section>
            ) : null}

            <ProfileEditFormWithPanel
              role={profile.role}
              initialPhotoUrl={profile.profile_photo_url ?? ''}
              initialCity={profile.city ?? ''}
              initialPincode={profile.pincode ?? ''}
              initialYearsExperience={contractorYearsExperience}
              initialWorkerYearsExperience={workerYearsExperience}
            />

            <section className="mx-4 mt-3 overflow-hidden rounded-2xl border border-[#E8DDD4] bg-white px-3 py-3">
              <ProfessionalImagesManager
                initialItems={professionalImages}
                canEdit
                galleryHeading="PORTFOLIO"
                noOuterChrome
              />
            </section>

            {profile.role === 'worker' ? (
              <section className="mx-4 mt-3 flex items-center gap-2 rounded-2xl border border-[#E8DDD4] bg-white px-4 py-3">
                <span className="text-xs font-semibold text-[#78716C]">Trade:</span>
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-800">{trade ?? 'Not added yet'}</span>
              </section>
            ) : null}

            {receivedEnquiriesForDisplay.length > 0 ? (
              <section id="invitations" className="mx-4 mt-3 overflow-hidden rounded-2xl border border-[#E8DDD4] bg-white">
                <div className="flex items-center justify-between border-b border-[#F2EDE8] px-4 py-3">
                  <p className="text-[9px] font-bold tracking-widest" style={{ color: '#A8A29E' }}>WORK INVITATIONS</p>
                  <span className="rounded-full bg-[#FBF0EB] px-2 py-0.5 text-[9px] font-bold text-[#D85A30]">{receivedEnquiriesForDisplay.length}</span>
                </div>
                <div
                  className="pr-1"
                  style={{ maxHeight: receivedEnquiriesForDisplay.length > 2 ? 320 : undefined, overflowY: receivedEnquiriesForDisplay.length > 2 ? 'auto' : 'visible' }}
                >
                  {receivedEnquiriesForDisplay.map((invite, index) => {
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
                      <div key={invite.id} className="border-b border-[#F2EDE8] px-4 py-3" style={{ borderBottomWidth: index === receivedEnquiriesForDisplay.length - 1 ? 0 : 1 }}>
                        <div className="rounded-xl border border-slate-100 bg-white p-3" style={{ borderLeft: `4px solid ${isPending ? '#F59E0B' : invite.status === 'responded' ? '#10B981' : '#FB923C'}` }}>
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
                      </div>
                    )
                  })}
                </div>
              </section>
            ) : null}

            <section className="mx-4 mt-3 overflow-hidden rounded-2xl border border-[#E8DDD4] bg-white">
              <div className="flex items-center justify-between border-b border-[#F2EDE8] px-4 py-3">
                <p className="text-[9px] font-bold tracking-widest" style={{ color: '#A8A29E' }}>PAYMENT APPROVALS</p>
                {(paymentApprovalRows ?? []).length > 0 ? (
                  <span className="text-[9px] font-bold text-[#D85A30]">{(paymentApprovalRows ?? []).length}</span>
                ) : null}
              </div>
              {(paymentApprovalRows ?? []).length === 0 ? (
                <p className="px-4 py-3 text-sm font-medium" style={{ color: '#78716C' }}>
                  No pending payment approvals.
                </p>
              ) : (
                <div>
                  {(paymentApprovalRows ?? []).map((payment, index, arr) => (
                    <div
                      key={payment.id}
                      className={`p-3 ${index < arr.length - 1 ? 'border-b border-[#F2EDE8]' : ''}`}
                    >
                      <div className="rounded-xl border border-slate-100 bg-white p-3" style={{ borderLeft: '4px solid #F59E0B' }}>
                        <p className="text-sm font-extrabold" style={{ color: '#2C2C2A' }}>
                          {paymentProjectNameById.get(payment.project_id) ?? 'Project'}
                        </p>
                        <p className="mt-1 text-xs" style={{ color: '#78716C' }}>
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
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section
              id="reviews"
              className="mx-4 mt-3 overflow-hidden rounded-2xl border border-[#E8DDD4]"
              style={{ backgroundColor: '#F2EDE8' }}
            >
              <div className="flex items-center justify-between border-b border-[#E8DDD4]/80 px-4 py-3">
                <p className="text-[11px] font-extrabold tracking-[0.06em]" style={{ color: '#57534E' }}>
                  REVIEWS
                </p>
                <span className="text-[11px] font-bold text-[#D85A30]">{formatReviewsSectionCount(reviewRows.length)}</span>
              </div>
              {reviewRows.length === 0 ? (
                <p className="px-4 py-4 text-sm font-medium" style={{ color: '#78716C' }}>
                  No reviews yet.
                </p>
              ) : (
                <div className="flex flex-col gap-2 px-2.5 pb-3 pt-2">
                  <ConceptBReviewCards
                    reviews={reviewRows}
                    reviewerNameById={Object.fromEntries(reviewerNameById)}
                  />
                </div>
              )}
            </section>

            <section className="mx-4 mt-3.5 mb-6 flex gap-2">
              <form action={signOutAction} className="flex-1">
                <button
                  type="submit"
                  className="w-full rounded-xl border border-[#E8DDD4] py-2.5 text-[10px] font-semibold text-[#78716C] transition-colors hover:bg-[#F2EDE8]"
                >
                  Sign out
                </button>
              </form>
              <div className="flex-1">
                <ProfileAccountActions />
              </div>
            </section>
          </ProfileEditPanelProvider>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
