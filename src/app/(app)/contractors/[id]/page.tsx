import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import InviteContractorBar from '@/components/shared/invite-contractor-bar'
import PortfolioGallery from '@/components/shared/portfolio-gallery'
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    redirect('/contractors')
  }
  const admin = createAdminClient<Database>(supabaseUrl, serviceRoleKey)

  const { id } = await params
  const query = await searchParams
  const showInviteBar = query.projectDraft === 'true'
  const projectId = query.projectId

  const { data: contractor } = await admin
    .from('users')
    .select('id,name,city,bio,contractor_profiles(*)')
    .eq('id', id)
    .eq('role', 'contractor')
    .maybeSingle()

  if (!contractor) redirect('/contractors')

  const profile = Array.isArray(contractor.contractor_profiles)
    ? contractor.contractor_profiles[0]
    : contractor.contractor_profiles
  const profileRecord = (profile ?? {}) as Record<string, unknown>

  const specialisations = Array.isArray(profileRecord.specialisations)
    ? (profileRecord.specialisations as string[])
    : Array.isArray(profileRecord.specialization)
      ? (profileRecord.specialization as string[])
      : []

  const serviceCities = Array.isArray(profileRecord.service_cities)
    ? (profileRecord.service_cities as string[])
    : Array.isArray(profileRecord.service_locations)
      ? (profileRecord.service_locations as string[])
      : []

  const yearsExperience = Number(profileRecord.years_experience ?? 0)

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
    <div className="min-h-screen bg-white px-4 py-5 pb-24">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5 flex items-center justify-between">
          <Link href="/contractors" className="rounded-full p-2 hover:bg-gray-100" aria-label="Back">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </Link>
        </header>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-xl font-semibold text-[#E8590C]">
              {initials(contractor.name)}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{contractor.name}</h1>
              <p className="text-sm text-gray-500">
                {contractor.city} · {yearsExperience} years experience
              </p>
              <p className="mt-1 text-sm text-gray-700">
                {starText(averageRating)} {averageRating.toFixed(1)} ({reviewCount})
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {specialisations.map((item) => (
              <span key={item} className="rounded-full bg-orange-100 px-2.5 py-1 text-xs text-[#E8590C]">
                {item}
              </span>
            ))}
          </div>
        </section>

        {contractor.bio ? (
          <section className="mt-5">
            <h2 className="mb-2 text-sm font-semibold text-gray-900">About</h2>
            <p className="text-sm text-gray-700">{contractor.bio}</p>
          </section>
        ) : null}

        <section className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-gray-200 p-3 text-center">
            <p className="text-lg font-semibold text-gray-900">{portfolioProjects.length}</p>
            <p className="text-xs text-gray-500">Projects Completed</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 text-center">
            <p className="text-lg font-semibold text-gray-900">{averageRating.toFixed(1)}</p>
            <p className="text-xs text-gray-500">Avg Rating</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3 text-center">
            <p className="text-lg font-semibold text-gray-900">{serviceCities.length}</p>
            <p className="text-xs text-gray-500">Cities Served</p>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-3 text-base font-semibold text-gray-900">Completed Projects</h2>
          <PortfolioGallery projects={portfolioProjects} />
        </section>

        <section className="mt-6">
          <h2 className="mb-3 text-base font-semibold text-gray-900">Reviews</h2>
          {reviews && reviews.length > 0 ? (
            <div className="space-y-3">
              {reviews.map((review) => {
                const reviewerName = reviewerMap.get(review.reviewer_id) ?? 'Customer'
                const stage = reviewedProjectMap.get(review.project_id) ?? 'Foundation work'
                return (
                  <div key={review.id} className="rounded-xl border border-gray-200 p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                        {initials(reviewerName)}
                      </div>
                      <div>
                        <p className="text-sm text-gray-700">{starText(Number(review.rating))}</p>
                        <p className="text-xs text-gray-500">
                          {stage} · {relativeMonths(review.created_at)}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-gray-700">{review.comment || 'No comment provided.'}</p>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No reviews yet</p>
          )}
        </section>
      </div>

      {showInviteBar ? (
        <InviteContractorBar
          contractorId={contractor.id}
          contractorName={contractor.name}
          projectId={projectId}
        />
      ) : null}
    </div>
  )
}
