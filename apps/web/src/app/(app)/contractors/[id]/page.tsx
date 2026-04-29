import Link from 'next/link'
import { redirect } from 'next/navigation'
import ContractorProfileBackButton from '@/components/shared/contractor-profile-back-button'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import InviteContractorBar from '@/components/shared/invite-contractor-bar'
import ReviewInviteForm from '@/components/shared/review-invite-form'
import type { Database } from '@/types/supabase'

const INVITE_BLOCKING_STATUSES: Database['public']['Enums']['project_status'][] = ['active', 'on_hold']

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function relativeMonths(dateValue: string) {
  const now = Date.now()
  const then = new Date(dateValue).getTime()
  const days = Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)))
  const months = Math.max(1, Math.floor(days / 30))
  return `${months} month${months === 1 ? '' : 's'} ago`
}

function starText(avg: number) {
  const rounded = Math.round(avg)
  const filled = '★'.repeat(Math.max(0, Math.min(5, rounded)))
  const empty = '☆'.repeat(5 - Math.max(0, Math.min(5, rounded)))
  return `${filled}${empty}`
}

export default async function ContractorProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ projectDraft?: string; projectId?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  const { data: viewer } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    redirect('/contractors')
  }
  const admin = createAdminClient<Database>(supabaseUrl, serviceRoleKey)

  const { id } = await params
  const query = await searchParams
  const showInviteBar = viewer?.role === 'customer'
  const projectId = query.projectId
  const backHref = projectId ? `/projects/${projectId}` : '/contractors'

  const { data: contractor } = await admin
    .from('users')
    .select('id,name,city,bio,phone_number,role,contractor_profiles(*),worker_profiles(*)')
    .eq('id', id)
    .maybeSingle()

  if (!contractor || (contractor.role !== 'contractor' && contractor.role !== 'worker')) redirect('/contractors')

  const profile =
    contractor.role === 'contractor'
      ? Array.isArray(contractor.contractor_profiles)
        ? contractor.contractor_profiles[0]
        : contractor.contractor_profiles
      : Array.isArray(contractor.worker_profiles)
        ? contractor.worker_profiles[0]
        : contractor.worker_profiles
  const profileRecord = (profile ?? {}) as Record<string, unknown>

  const specialisations = Array.isArray(profileRecord.specialisations)
    ? (profileRecord.specialisations as string[])
    : Array.isArray(profileRecord.specialization)
      ? (profileRecord.specialization as string[])
      : Array.isArray(profileRecord.skill_tags)
        ? (profileRecord.skill_tags as string[])
        : []

  const yearsExperience = Number(profileRecord.years_experience ?? 0)
  const trade = contractor.role === 'worker'
    ? String(profileRecord.trade ?? (Array.isArray(profileRecord.skill_tags) ? profileRecord.skill_tags[0] : '') ?? '')
    : null

  let contractorProjects: Array<{ id: string; name: string; city: string; status: string; current_stage: string }> = []
  if (contractor.role === 'contractor') {
    const { data: ownProjects } = await admin
      .from('projects')
      .select('id,name,city,status,current_stage')
      .eq('contractor_id', contractor.id)
    contractorProjects = ownProjects ?? []
  } else {
    const { data: workerMemberships } = await admin
      .from('project_members')
      .select('project_id')
      .eq('user_id', contractor.id)
      .eq('role', 'worker')
    const workerProjectIds = Array.from(new Set((workerMemberships ?? []).map((entry) => entry.project_id)))
    const { data: workerProjects } = workerProjectIds.length
      ? await admin
          .from('projects')
          .select('id,name,city,status,current_stage')
          .in('id', workerProjectIds)
      : { data: [] as Array<{ id: string; name: string; city: string; status: string; current_stage: string }> }
    contractorProjects = workerProjects ?? []
  }

  const completedProjects = contractorProjects.filter((project) => project.status === 'completed')
  const ongoingProjects = contractorProjects.filter((project) => project.status === 'active')

  const allProjectIds = contractorProjects.map((project) => project.id)
  const { data: projectImages } = allProjectIds.length
    ? await admin
        .from('project_images')
        .select('project_id,image_url,created_at')
        .in('project_id', allProjectIds)
        .order('created_at', { ascending: false })
    : { data: [] as Array<{ project_id: string; image_url: string; created_at: string }> }

  const firstImageByProject = new Map<string, string>()
  for (const image of projectImages ?? []) {
    if (!firstImageByProject.has(image.project_id) && image.image_url) {
      firstImageByProject.set(image.project_id, image.image_url)
    }
  }

  const portfolioProjects = (completedProjects ?? []).map((project) => {
    return {
      id: project.id,
      name: project.name,
      city: project.city,
      status: project.status,
      thumbnail: firstImageByProject.get(project.id) ?? null,
    }
  })
  const ongoingPortfolioProjects = (ongoingProjects ?? []).map((project) => {
    return {
      id: project.id,
      name: project.name,
      city: project.city,
      status: project.status,
      thumbnail: firstImageByProject.get(project.id) ?? null,
    }
  })
  const allPortfolioProjects = [...ongoingPortfolioProjects, ...portfolioProjects]
  const activeCitiesCount = new Set(
    ongoingPortfolioProjects.map((project) => (project.city ?? '').trim()).filter(Boolean)
  ).size

  const { data: reviews } = await admin
    .from('reviews')
    .select('id,rating,comment,created_at,project_id,reviewer_id')
    .eq('reviewee_id', contractor.id)
    .order('created_at', { ascending: false })

  const reviewerIds = Array.from(new Set((reviews ?? []).map((review) => review.reviewer_id)))
  const { data: reviewerUsers } = reviewerIds.length
    ? await admin.from('users').select('id,name').in('id', reviewerIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const reviewerMap = new Map((reviewerUsers ?? []).map((entry) => [entry.id, entry.name]))

  const reviewedProjectIds = Array.from(new Set((reviews ?? []).map((review) => review.project_id)))
  const { data: reviewedProjects } = reviewedProjectIds.length
    ? await admin.from('projects').select('id,current_stage').in('id', reviewedProjectIds)
    : { data: [] as Array<{ id: string; current_stage: string }> }
  const reviewedProjectMap = new Map((reviewedProjects ?? []).map((project) => [project.id, project.current_stage]))

  const reviewCount = (reviews ?? []).length
  const hasExistingReviewForProject =
    Boolean(projectId) &&
    (reviews ?? []).some((review) => review.reviewer_id === user.id && review.project_id === projectId)
  const existingReviewForProject =
    projectId
      ? (reviews ?? []).find((review) => review.reviewer_id === user.id && review.project_id === projectId) ?? null
      : null
  const averageRating =
    reviewCount > 0
      ? Number(((reviews ?? []).reduce((sum, review) => sum + Number(review.rating), 0) / reviewCount).toFixed(1))
      : 0

  let activeProjectsWithCustomer: Array<{ id: string; name: string; status: string }> = []
  let pendingInvitationsWithProfessional: Array<{ id: string; subject: string; project_id: string | null }> = []
  const inviteLimit = contractor.role === 'contractor' ? 3 : 1
  if (viewer?.role === 'customer') {
    if (contractor.role === 'contractor') {
      const { data: activeProjects } = await admin
        .from('projects')
        .select('id,name,status')
        .eq('customer_id', user.id)
        .eq('contractor_id', contractor.id)
        .in('status', INVITE_BLOCKING_STATUSES)
      activeProjectsWithCustomer = (activeProjects ?? []).map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status,
      }))
    } else {
      const { data: memberships } = await admin
        .from('project_members')
        .select('project_id')
        .eq('user_id', contractor.id)
        .eq('role', 'worker')
      const projectIds = Array.from(new Set((memberships ?? []).map((entry) => entry.project_id)))
      const { data: activeWorkerProjects } = projectIds.length
        ? await admin
            .from('projects')
            .select('id,name,status')
            .in('id', projectIds)
            .eq('customer_id', user.id)
            .in('status', INVITE_BLOCKING_STATUSES)
        : { data: [] as Array<{ id: string; name: string; status: string }> }
      activeProjectsWithCustomer = (activeWorkerProjects ?? []).map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status,
      }))
    }

    const { data: pendingInvites } = await admin
      .from('enquiries')
      .select('id,subject')
      .eq('customer_id', user.id)
      .eq('recipient_id', contractor.id)
      .eq('status', 'open')
      .ilike('subject', 'Project invitation [%')
      .order('created_at', { ascending: false })
    pendingInvitationsWithProfessional = (pendingInvites ?? []).map((invite) => {
      const projectIdMatch = invite.subject.match(/\[([0-9a-f-]{36})\]/i)
      return {
        id: invite.id,
        subject: invite.subject,
        project_id: projectIdMatch?.[1] ?? null,
      }
    })
  }
  const hasPendingInvitation = pendingInvitationsWithProfessional.length > 0
  const inviteLimitReached = activeProjectsWithCustomer.length >= inviteLimit
  const inviteLocked = hasPendingInvitation || inviteLimitReached
  const inviteLockMessage = hasPendingInvitation
    ? `Previous invitation is still pending with this ${contractor.role === 'worker' ? 'worker' : 'contractor'}.`
    : inviteLimitReached
      ? contractor.role === 'contractor'
        ? 'You already have 3 active projects with this contractor. Complete one to send a new invite.'
        : 'You already have an active project with this worker. Complete it before sending another invite.'
    : null

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: '#FAFAFA' }}>
      {/* Cream-orange hero — lighter than app header, matches mobile profile */}
      <div
        className="border-t border-b px-4 py-8"
        style={{
          backgroundColor: '#FFFCF8',
          borderTopColor: '#FFF3E8',
          borderBottomColor: '#FFEAD8',
        }}
      >
        <div className="mx-auto w-full max-w-md">
          <ContractorProfileBackButton projectId={projectId} fallbackHref={backHref} />

          <div className="flex items-end gap-4">
            <div
              className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full border-2 bg-white text-4xl font-bold"
              style={{ borderColor: 'rgba(232, 89, 12, 0.35)', color: '#E8590C' }}
            >
              {initials(contractor.name)}
            </div>
            <div className="pb-2">
              <h1 className="text-2xl font-bold text-gray-900">{contractor.name}</h1>
              <p className="mt-1 text-sm font-medium text-stone-600">
                {contractor.city} · {yearsExperience} years
              </p>
              <p className="mt-1 text-sm font-bold" style={{ color: '#E8590C' }}>
                {contractor.role === 'contractor' ? 'Contractor' : trade || 'Worker'}
              </p>
              <p className="mt-1 text-sm font-medium text-gray-600">
                {contractor.phone_number ?? 'Phone not available'}
              </p>
              <p className="mt-1 flex items-center gap-1 text-sm font-bold text-gray-900">
                {starText(averageRating)} {averageRating.toFixed(1)} ({reviewCount})
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-4 py-6">
        {/* Specialisations */}
        {specialisations.length > 0 && (
          <section className="mb-6 flex flex-wrap gap-2">
            {specialisations.map((item) => (
              <span
                key={item}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-white"
                style={{ backgroundColor: '#E8590C' }}
              >
                {item}
              </span>
            ))}
          </section>
        )}

        {/* About Section */}
        {contractor.bio ? (
          <section className="mb-6 rounded-lg bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold mb-3" style={{ color: '#1A1A1A' }}>
              About
            </h2>
            <p className="text-sm font-medium leading-relaxed" style={{ color: '#7A6F66' }}>
              {contractor.bio}
            </p>
          </section>
        ) : null}

        {/* Stats Row */}
        <section className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold" style={{ color: '#E8590C' }}>
              {portfolioProjects.length}
            </p>
            <p className="mt-2 text-xs font-medium" style={{ color: '#7A6F66' }}>
              Projects Completed
            </p>
          </div>
          <div className="rounded-lg bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold" style={{ color: '#E8590C' }}>
              {ongoingPortfolioProjects.length}
            </p>
            <p className="mt-2 text-xs font-medium" style={{ color: '#7A6F66' }}>
              Ongoing Projects
            </p>
          </div>
          <div className="rounded-lg bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold" style={{ color: '#E8590C' }}>
              {averageRating.toFixed(1)}
            </p>
            <p className="mt-2 text-xs font-medium" style={{ color: '#7A6F66' }}>
              Avg Rating
            </p>
          </div>
          <div className="rounded-lg bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold" style={{ color: '#E8590C' }}>
              {activeCitiesCount}
            </p>
            <p className="mt-2 text-xs font-medium" style={{ color: '#7A6F66' }}>
              Cities
            </p>
          </div>
        </section>

        {/* Projects */}
        {allPortfolioProjects.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-4 text-lg font-bold" style={{ color: '#1A1A1A' }}>
              Projects
            </h2>
            <div className="overflow-x-auto rounded-xl border border-orange-100 bg-[#FFF8F3] p-3 shadow-sm">
              <div className="flex gap-3 pb-1">
                {allPortfolioProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}/images`}
                    className="relative w-[210px] shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
                  >
                    <span
                      className={`absolute top-2 right-2 z-10 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        project.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {project.status === 'completed' ? 'Completed' : 'Ongoing'}
                    </span>
                    <div className="relative h-32 bg-gray-100">
                      {project.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={project.thumbnail} alt={project.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-3xl">🏗️</div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-black/35 px-2 py-1">
                        <p className="text-[11px] font-semibold text-white">View Photos →</p>
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="line-clamp-2 text-sm font-semibold text-gray-900">{project.name}</p>
                      <p className="mt-1 text-xs text-gray-500">{project.city}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Reviews Section */}
        <section>
          <h2 className="mb-4 text-lg font-bold" style={{ color: '#1A1A1A' }}>
            Reviews ({reviewCount})
          </h2>
          {reviews && reviews.length > 0 ? (
            <div className="space-y-3">
              {reviews.map((review) => {
                const reviewerName = reviewerMap.get(review.reviewer_id) ?? 'Customer'
                const stage = reviewedProjectMap.get(review.project_id) ?? 'Foundation work'
                return (
                  <div key={review.id} className="rounded-lg bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: '#E8590C' }}>
                        {initials(reviewerName)}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold" style={{ color: '#1A1A1A' }}>
                          {reviewerName}
                        </p>
                        <p className="text-xs font-semibold" style={{ color: '#B8860B' }}>
                          {starText(Number(review.rating))}
                        </p>
                        <p className="mt-1 text-xs font-medium" style={{ color: '#7A6F66' }}>
                          {stage} · {relativeMonths(review.created_at)}
                        </p>
                        {review.comment && (
                          <p className="mt-2 text-sm font-medium leading-relaxed" style={{ color: '#7A6F66' }}>
                            {review.comment}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-lg bg-white p-6 text-center shadow-sm">
              <p className="text-sm font-medium" style={{ color: '#7A6F66' }}>
                No reviews yet
              </p>
            </div>
          )}
        </section>

        {viewer?.role === 'customer' && projectId ? (
          <section className="mt-6">
            <ReviewInviteForm
              projectId={projectId}
              revieweeId={contractor.id}
              hasExistingReview={hasExistingReviewForProject}
              existingReview={
                existingReviewForProject
                  ? { rating: Number(existingReviewForProject.rating), comment: existingReviewForProject.comment }
                  : null
              }
            />
          </section>
        ) : null}
      </div>

      {showInviteBar ? (
        <InviteContractorBar
          contractorId={contractor.id}
          contractorName={contractor.name}
          contractorCity={contractor.city}
          projectId={projectId}
          inviteLimit={inviteLimit}
          inviteLimitReached={inviteLocked}
          inviteLockMessage={inviteLockMessage}
          activeProjects={activeProjectsWithCustomer}
          hasPendingInvitation={hasPendingInvitation}
          pendingInvitations={pendingInvitationsWithProfessional}
        />
      ) : null}
    </div>
  )
}
