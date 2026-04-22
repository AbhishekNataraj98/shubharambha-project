import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function pickSpecialisations(profile: Record<string, unknown>) {
  const value = (profile.specialisations ?? profile.specialization ?? []) as unknown
  return Array.isArray(value) ? value.map(String) : []
}

function pickServiceCities(profile: Record<string, unknown>) {
  const value = (profile.service_cities ?? profile.service_locations ?? []) as unknown
  return Array.isArray(value) ? value.map(String) : []
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: contractor, error } = await supabase
    .from('users')
    .select('id,name,city,bio,contractor_profiles(*)')
    .eq('id', id)
    .eq('role', 'contractor')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!contractor) return NextResponse.json({ error: 'Contractor not found' }, { status: 404 })

  const profile = Array.isArray(contractor.contractor_profiles)
    ? contractor.contractor_profiles[0]
    : contractor.contractor_profiles
  const profileRecord = (profile ?? {}) as Record<string, unknown>

  const { data: completedProjects } = await supabase
    .from('projects')
    .select('id,name,city,status')
    .eq('contractor_id', id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })

  const projectIds = (completedProjects ?? []).map((project) => project.id)

  const { data: updates } = projectIds.length
    ? await supabase
        .from('daily_updates')
        .select('project_id,photo_urls,created_at')
        .in('project_id', projectIds)
        .order('created_at', { ascending: true })
    : { data: [] as Array<{ project_id: string; photo_urls: string[]; created_at: string }> }

  const firstPhotoByProject = new Map<string, string>()
  for (const update of updates ?? []) {
    if (!firstPhotoByProject.has(update.project_id) && update.photo_urls?.[0]) {
      firstPhotoByProject.set(update.project_id, update.photo_urls[0])
    }
  }

  const completedProjectsWithPhoto = (completedProjects ?? []).map((project) => ({
    ...project,
    thumbnail: firstPhotoByProject.get(project.id) ?? null,
  }))

  const { data: reviews } = await supabase
    .from('reviews')
    .select('id,rating,comment,created_at,reviewer_id')
    .eq('reviewee_id', id)
    .order('created_at', { ascending: false })

  const reviewerIds = Array.from(new Set((reviews ?? []).map((review) => review.reviewer_id)))
  const { data: reviewerUsers } = reviewerIds.length
    ? await supabase.from('users').select('id,name').in('id', reviewerIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const reviewerNameById = new Map((reviewerUsers ?? []).map((row) => [row.id, row.name]))

  const totalReviews = (reviews ?? []).length
  const avgRating =
    totalReviews > 0
      ? Number(
          ((reviews ?? []).reduce((sum, review) => sum + Number(review.rating), 0) / totalReviews).toFixed(1)
        )
      : 0

  return NextResponse.json({
    id: contractor.id,
    name: contractor.name,
    city: contractor.city,
    bio: contractor.bio,
    years_experience: Number(profileRecord.years_experience ?? 0),
    specialisations: pickSpecialisations(profileRecord),
    service_cities: pickServiceCities(profileRecord),
    avg_rating: avgRating,
    review_count: totalReviews,
    projects_completed: completedProjectsWithPhoto.length,
    completed_projects: completedProjectsWithPhoto,
    reviews: (reviews ?? []).map((review) => ({
      ...review,
      reviewer_name: reviewerNameById.get(review.reviewer_id) ?? 'Customer',
    })),
  })
}
