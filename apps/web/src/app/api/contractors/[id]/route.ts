import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

function pickSpecialisations(profile: Record<string, unknown>) {
  const value = (profile.specialisations ?? profile.specialization ?? profile.skill_tags ?? []) as unknown
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server is missing Supabase admin credentials' }, { status: 500 })
  }
  const admin = createAdminClient<Database>(supabaseUrl, serviceRoleKey)

  const { id } = await params

  const loadProfileByUserId = async (userId: string) =>
    admin
      .from('users')
      .select('id,name,city,bio,phone_number,role,contractor_profiles(*),worker_profiles(*)')
      .eq('id', userId)
      .maybeSingle()

  let { data: contractor, error } = await loadProfileByUserId(id)

  // Fallback: if caller passes contractor_profiles.id instead of users.id,
  // resolve to user_id and fetch contractor by the linked user row.
  if (!contractor && !error) {
    const { data: profileLink } = await admin
      .from('contractor_profiles')
      .select('id,user_id')
      .eq('id', id)
      .maybeSingle()

    if (profileLink?.user_id) {
      const secondTry = await loadProfileByUserId(profileLink.user_id)
      contractor = secondTry.data
      error = secondTry.error
    }
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!contractor || (contractor.role !== 'contractor' && contractor.role !== 'worker')) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
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

  const { data: completedProjects } = await admin
    .from('projects')
    .select('id,name,city,status')
    .eq('contractor_id', contractor.id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })

  const projectIds = (completedProjects ?? []).map((project) => project.id)

  const { data: updates } = projectIds.length
    ? await admin
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

  const { data: reviews } = await admin
    .from('reviews')
    .select('id,rating,comment,created_at,reviewer_id')
    .eq('reviewee_id', contractor.id)
    .order('created_at', { ascending: false })

  const reviewerIds = Array.from(new Set((reviews ?? []).map((review) => review.reviewer_id)))
  const { data: reviewerUsers } = reviewerIds.length
    ? await admin.from('users').select('id,name').in('id', reviewerIds)
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
    role: contractor.role,
    name: contractor.name,
    city: contractor.city,
    phone_number: contractor.phone_number,
    bio: contractor.bio,
    years_experience: Number(profileRecord.years_experience ?? 0),
    trade: contractor.role === 'worker' ? String(profileRecord.trade ?? profileRecord.skill_tags?.[0] ?? '') || null : null,
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
