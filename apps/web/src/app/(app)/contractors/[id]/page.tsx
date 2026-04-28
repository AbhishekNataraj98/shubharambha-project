import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import InviteContractorBar from '@/components/shared/invite-contractor-bar'
import PortfolioGallery from '@/components/shared/portfolio-gallery'
import ReviewInviteForm from '@/components/shared/review-invite-form'
import type { Database } from '@/types/supabase'

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

  const serviceCities = Array.isArray(profileRecord.service_cities)
    ? (profileRecord.service_cities as string[])
    : Array.isArray(profileRecord.service_locations)
      ? (profileRecord.service_locations as string[])
      : []

  const yearsExperience = Number(profileRecord.years_experience ?? 0)
  const trade = contractor.role === 'worker'
    ? String(profileRecord.trade ?? (Array.isArray(profileRecord.skill_tags) ? profileRecord.skill_tags[0] : '') ?? '')
    : null

  const { data: completedProjects } = await admin
    .from('projects')
    .select('id,name,city,status,current_stage')
    .eq('contractor_id', contractor.id)
    .eq('status', 'completed')

  const completedIds = (completedProjects ?? []).map((project) => project.id)
  const { data: completedUpdates } = completedIds.length
    ? await admin
        .from('daily_updates')
        .select('project_id,photo_urls,created_at')
        .in('project_id', completedIds)
        .order('created_at', { ascending: true })
    : { data: [] as Array<{ project_id: string; photo_urls: string[]; created_at: string }> }

  const photosByProject = new Map<string, string[]>()
  for (const update of completedUpdates ?? []) {
    const current = photosByProject.get(update.project_id) ?? []
    const merged = [...current, ...(update.photo_urls ?? [])]
    photosByProject.set(update.project_id, merged)
  }

  const portfolioProjects = (completedProjects ?? []).map((project) => {
    const images = photosByProject.get(project.id) ?? []
    return {
      id: project.id,
      name: project.name,
      city: project.city,
      thumbnail: images[0] ?? null,
      images,
    }
  })

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
  const averageRating =
    reviewCount > 0
      ? Number(((reviews ?? []).reduce((sum, review) => sum + Number(review.rating), 0) / reviewCount).toFixed(1))
      : 0

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: '#FAFAFA' }}>
      {/* Gradient Hero Section */}
      <div
        style={{
          background: 'linear-gradient(to right, #E8590C, #C44A0A)',
        }}
        className="px-4 py-8 text-white"
      >
        <div className="mx-auto w-full max-w-md">
          <Link href="/contractors" className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} aria-label="Back">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </Link>

          <div className="flex items-end gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white bg-opacity-20 text-4xl font-bold text-white">
              {initials(contractor.name)}
            </div>
            <div className="pb-2">
              <h1 className="text-2xl font-bold">{contractor.name}</h1>
              <p className="mt-1 text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>
                {contractor.city} · {yearsExperience} years
              </p>
              <p className="mt-1 text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.95)' }}>
                {contractor.role === 'contractor' ? 'Contractor' : trade || 'Worker'}
              </p>
              <p className="mt-1 text-sm font-medium" style={{ color: 'rgba(255,255,255,0.95)' }}>
                {contractor.phone_number ?? 'Phone not available'}
              </p>
              <p className="mt-1 flex items-center gap-1 text-sm font-semibold">
                {starText(averageRating)}{' '}
                <span style={{ color: 'rgba(255,255,255,0.9)' }}>
                  {averageRating.toFixed(1)} ({reviewCount})
                </span>
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
        <section className="mb-6 grid grid-cols-3 gap-3">
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
              {averageRating.toFixed(1)}
            </p>
            <p className="mt-2 text-xs font-medium" style={{ color: '#7A6F66' }}>
              Avg Rating
            </p>
          </div>
          <div className="rounded-lg bg-white p-4 text-center shadow-sm">
            <p className="text-2xl font-bold" style={{ color: '#E8590C' }}>
              {serviceCities.length}
            </p>
            <p className="mt-2 text-xs font-medium" style={{ color: '#7A6F66' }}>
              Cities Served
            </p>
          </div>
        </section>

        {/* Portfolio Section */}
        {portfolioProjects.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-4 text-lg font-bold" style={{ color: '#1A1A1A' }}>
              Completed Projects
            </h2>
            <PortfolioGallery projects={portfolioProjects} />
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
            <ReviewInviteForm projectId={projectId} revieweeId={contractor.id} />
          </section>
        ) : null}
      </div>

      {showInviteBar ? (
        <InviteContractorBar
          contractorId={contractor.id}
          contractorName={contractor.name}
          contractorCity={contractor.city}
          projectId={projectId}
        />
      ) : null}
    </div>
  )
}
