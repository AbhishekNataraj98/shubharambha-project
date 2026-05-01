import Link from 'next/link'
import { redirect } from 'next/navigation'
import ContractorProfileBackButton from '@/components/shared/contractor-profile-back-button'
import ConceptBReviewCards from '@/components/profile/concept-b-review-cards'
import { formatPhoneIndian, formatReviewsSectionCount } from '@/lib/utils'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import InviteContractorBar from '@/components/shared/invite-contractor-bar'
import ReviewInviteForm from '@/components/shared/review-invite-form'
import ProfessionalImagesManager from '@/components/professional-images-manager'
import type { Database } from '@/types/supabase'

const INVITE_BLOCKING_STATUSES: Database['public']['Enums']['project_status'][] = ['active', 'on_hold']

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
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
    .select('id,name,city,pincode,bio,phone_number,role,profile_photo_url,contractor_profiles(*),worker_profiles(*)')
    .eq('id', id)
    .maybeSingle()

  if (!contractor || (contractor.role !== 'contractor' && contractor.role !== 'worker')) redirect('/contractors')

  if (viewer?.role === 'customer') {
    await (admin as any).from('professional_profile_views').insert({
      professional_id: contractor.id,
      viewer_id: user.id,
    })
  }

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
  const { count: profileViewsCount } = await (admin as any)
    .from('professional_profile_views')
    .select('id', { count: 'exact', head: true })
    .eq('professional_id', contractor.id)
  const { data: professionalImagesRows } = await (admin as any)
    .from('professional_images')
    .select('id,image_url,created_at')
    .eq('professional_id', contractor.id)
    .order('created_at', { ascending: true })
  const professionalImages = (professionalImagesRows ?? []) as Array<{
    id: string
    image_url: string
    created_at: string
  }>

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

  const heroCoverUrl = professionalImages[0]?.image_url ?? null
  const projectsCompletedCount = portfolioProjects.length

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: '#F2EDE8' }}>
      <div className="mx-auto w-full max-w-md">
        {/* Concept 5-style hero (matches logged-in contractor/worker profile, without Edit) */}
        <section className="relative h-[140px] overflow-hidden">
          {heroCoverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroCoverUrl} alt="Portfolio cover" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(160deg, #3D2A20, #5C3820, #2C2C2A)' }}
            />
          )}
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute left-3 top-3 z-10">
            <ContractorProfileBackButton projectId={projectId} fallbackHref={backHref} overlay />
          </div>
          {averageRating >= 4.5 ? (
            <div className="absolute right-3 top-3 z-10 rounded-full bg-[#D85A30] px-2.5 py-1 text-[9px] font-bold text-white">
              ⭐ Top rated
            </div>
          ) : projectsCompletedCount >= 5 ? (
            <div className="absolute right-3 top-3 z-10 rounded-full bg-black/50 px-2.5 py-1 text-[9px] text-white">
              {`${projectsCompletedCount} projects`}
            </div>
          ) : null}
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 border-white/50 bg-[#D85A30] text-base font-bold text-white">
              {contractor.profile_photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={contractor.profile_photo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(contractor.name)
              )}
            </div>
            <div>
              <p className="text-base font-extrabold leading-tight text-white">{contractor.name}</p>
              <span className="mt-1 inline-block rounded-full bg-[#D85A30] px-2.5 py-0.5 text-[8px] font-bold capitalize text-white">
                {contractor.role === 'contractor' ? 'contractor' : contractor.role}
              </span>
            </div>
          </div>
          <div className="absolute bottom-4 right-3 z-10 rounded-xl bg-black/50 px-2 py-1 text-[9px] font-bold text-[#F59E0B]">{`★ ${averageRating.toFixed(1)}`}</div>
        </section>

        <section className="flex items-stretch justify-around border-b border-[#E8DDD4] bg-white px-4 py-2.5">
          <a href="#reviews" className="text-center">
            <p className="text-base font-extrabold text-[#D85A30]">{averageRating.toFixed(1)}</p>
            <p className="mt-0.5 text-[7px]" style={{ color: '#78716C' }}>
              Rating
            </p>
          </a>
          <div className="my-1 w-px self-stretch bg-[#E8DDD4]" />
          <div className="text-center">
            <p className="text-base font-extrabold text-[#D85A30]">{projectsCompletedCount}</p>
            <p className="mt-0.5 text-[7px]" style={{ color: '#78716C' }}>
              Done
            </p>
          </div>
          <div className="my-1 w-px self-stretch bg-[#E8DDD4]" />
          <div className="text-center">
            <p className="text-base font-extrabold text-[#D85A30]">{profileViewsCount ?? 0}</p>
            <p className="mt-0.5 text-[7px]" style={{ color: '#78716C' }}>
              Views
            </p>
          </div>
          <div className="my-1 w-px self-stretch bg-[#E8DDD4]" />
          <div className="text-center">
            <p className="text-base font-extrabold text-[#D85A30]">{`${yearsExperience}y`}</p>
            <p className="mt-0.5 text-[7px]" style={{ color: '#78716C' }}>
              Exp
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-3 border-b border-[#E8DDD4] bg-white px-4 py-4">
          <p className="text-[15px] font-bold leading-snug text-[#2C2C2A]">{`📍 ${contractor.city ?? '—'} · ${contractor.pincode ?? '—'}`}</p>
          <p className="text-[15px] font-bold leading-snug text-[#2C2C2A]">{`📞 ${formatPhoneIndian(contractor.phone_number)}`}</p>
          <p className="text-[15px] font-bold leading-snug text-[#2C2C2A]">{`👷 ${yearsExperience} yrs experience`}</p>
        </section>

        <div className="px-4 py-6">
          {specialisations.length > 0 ? (
            <section className="mb-6 flex flex-wrap gap-2">
              {specialisations.map((item) => (
                <span
                  key={item}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: '#D85A30' }}
                >
                  {item}
                </span>
              ))}
            </section>
          ) : null}

          {contractor.bio ? (
            <section className="mb-6 overflow-hidden rounded-2xl border border-[#E8DDD4] bg-white p-4">
              <h2 className="mb-3 text-sm font-bold" style={{ color: '#1A1A1A' }}>
                About
              </h2>
              <p className="text-sm font-medium leading-relaxed" style={{ color: '#7A6F66' }}>
                {contractor.bio}
              </p>
            </section>
          ) : null}

          {contractor.role === 'worker' && trade ? (
            <section className="mb-6 flex items-center gap-2 rounded-2xl border border-[#E8DDD4] bg-white px-4 py-3">
              <span className="text-xs font-semibold text-[#78716C]">Trade:</span>
              <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-800">{trade}</span>
            </section>
          ) : null}

          {allPortfolioProjects.length > 0 ? (
            <section className="mb-6">
              <h2 className="mb-4 text-[9px] font-bold tracking-widest" style={{ color: '#A8A29E' }}>
                PROJECTS
              </h2>
              <div className="overflow-x-auto rounded-xl border border-[#FDE8D9] bg-[#FFF8F3] p-3 shadow-sm">
                <div className="flex gap-3 pb-1">
                  {allPortfolioProjects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}/images`}
                      className="relative w-[210px] shrink-0 overflow-hidden rounded-2xl border border-[#E8DDD4] bg-white shadow-sm"
                    >
                      <span
                        className={`absolute right-2 top-2 z-10 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          project.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {project.status === 'completed' ? 'Completed' : 'Ongoing'}
                      </span>
                      <div className="relative h-32 bg-[#F2EDE8]">
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
          ) : null}

          <section className="mb-6 overflow-hidden rounded-2xl border border-[#E8DDD4] bg-white">
            <div className="flex items-center justify-between border-b border-[#F2EDE8] px-4 py-3">
              <p className="text-[9px] font-bold tracking-widest" style={{ color: '#A8A29E' }}>
                PORTFOLIO
              </p>
              <span className="text-[9px] font-bold text-[#D85A30]">{`${professionalImages.length}/6`}</span>
            </div>
            <div className="px-3 py-3">
              <ProfessionalImagesManager
                initialItems={professionalImages}
                canEdit={false}
                embedded
                neutralTiles
              />
            </div>
          </section>

          <section
            id="reviews"
            className="mb-6 overflow-hidden rounded-2xl border border-[#E8DDD4]"
            style={{ backgroundColor: '#F2EDE8' }}
          >
            <div className="flex items-center justify-between border-b border-[#E8DDD4]/80 px-4 py-3">
              <p className="text-[11px] font-extrabold tracking-[0.06em]" style={{ color: '#57534E' }}>
                REVIEWS
              </p>
              <span className="text-[11px] font-bold text-[#D85A30]">{formatReviewsSectionCount(reviewCount)}</span>
            </div>
            {reviews && reviews.length > 0 ? (
              <div className="flex flex-col gap-2 px-2.5 pb-3 pt-2">
                <ConceptBReviewCards reviews={reviews} reviewerNameById={Object.fromEntries(reviewerMap)} />
              </div>
            ) : (
              <p className="px-4 py-4 text-sm" style={{ color: '#78716C' }}>
                No reviews yet.
              </p>
            )}
          </section>

          {viewer?.role === 'customer' && projectId ? (
            <section className="mt-2 overflow-hidden rounded-2xl border border-[#E8DDD4] bg-white p-4">
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
