import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

const INVITE_BLOCKING_PROJECT_STATUSES: Database['public']['Enums']['project_status'][] = ['active', 'on_hold']

function pickSpecialisations(profile: Record<string, unknown>) {
  const value = (profile.specialisations ?? profile.specialization ?? profile.skill_tags ?? []) as unknown
  return Array.isArray(value) ? value.map(String) : []
}

function pickServiceCities(profile: Record<string, unknown>) {
  const value = (profile.service_cities ?? profile.service_locations ?? []) as unknown
  return Array.isArray(value) ? value.map(String) : []
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')

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

  let relatedProjects: Array<{ id: string; name: string; city: string; status: string }> = []
  if (contractor.role === 'contractor') {
    const { data: ownProjects } = await admin
      .from('projects')
      .select('id,name,city,status')
      .eq('contractor_id', contractor.id)
      .order('created_at', { ascending: false })
    relatedProjects = ownProjects ?? []
  } else {
    const { data: workerMemberships } = await admin
      .from('project_members')
      .select('project_id')
      .eq('user_id', contractor.id)
      .eq('role', 'worker')
    const workerProjectIds = Array.from(new Set((workerMemberships ?? []).map((row) => row.project_id)))
    const { data: workerProjects } = workerProjectIds.length
      ? await admin
          .from('projects')
          .select('id,name,city,status')
          .in('id', workerProjectIds)
          .order('created_at', { ascending: false })
      : { data: [] as Array<{ id: string; name: string; city: string; status: string }> }
    relatedProjects = workerProjects ?? []
  }

  const completedProjects = relatedProjects.filter((project) => project.status === 'completed')
  const ongoingProjects = relatedProjects.filter((project) => project.status === 'active')

  const projectIds = relatedProjects.map((project) => project.id)

  const { data: projectImages } = projectIds.length
    ? await admin
        .from('project_images')
        .select('project_id,image_url,created_at')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
    : { data: [] as Array<{ project_id: string; image_url: string; created_at: string }> }

  const firstPhotoByProject = new Map<string, string>()
  for (const image of projectImages ?? []) {
    if (!firstPhotoByProject.has(image.project_id) && image.image_url) {
      firstPhotoByProject.set(image.project_id, image.image_url)
    }
  }

  const projectWithThumbnail = (project: { id: string; name: string; city: string; status: string }) => ({
    ...project,
    thumbnail: firstPhotoByProject.get(project.id) ?? null,
  })
  const completedProjectsWithPhoto = completedProjects.map(projectWithThumbnail)
  const ongoingProjectsWithPhoto = ongoingProjects.map(projectWithThumbnail)

  const { data: reviews } = await admin
    .from('reviews')
    .select('id,rating,comment,created_at,reviewer_id,project_id')
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
  const myReviewForProject =
    projectId
      ? (reviews ?? []).find(
          (review) =>
            review.project_id === projectId &&
            review.reviewer_id === user.id
        ) ?? null
      : null

  let activeProjectsWithCustomer: Array<{ id: string; name: string; status: string }> = []
  let inviteLimit = contractor.role === 'contractor' ? 3 : 1
  let pendingInvitationsWithProfessional: Array<{ id: string; subject: string; project_id: string | null }> = []
  if (user.id) {
    if (contractor.role === 'contractor') {
      const { data: activeProjects } = await admin
        .from('projects')
        .select('id,name,status')
        .eq('customer_id', user.id)
        .eq('contractor_id', contractor.id)
        .in('status', INVITE_BLOCKING_PROJECT_STATUSES)
      activeProjectsWithCustomer = (activeProjects ?? []).map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status,
      }))
    } else {
      const { data: workerMemberships } = await admin
        .from('project_members')
        .select('project_id')
        .eq('user_id', contractor.id)
        .eq('role', 'worker')
      const workerProjectIds = Array.from(new Set((workerMemberships ?? []).map((entry) => entry.project_id)))
      const { data: activeWorkerProjects } = workerProjectIds.length
        ? await admin
            .from('projects')
            .select('id,name,status')
            .in('id', workerProjectIds)
            .eq('customer_id', user.id)
            .in('status', INVITE_BLOCKING_PROJECT_STATUSES)
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
    projects_ongoing: ongoingProjectsWithPhoto.length,
    completed_projects: completedProjectsWithPhoto,
    ongoing_projects: ongoingProjectsWithPhoto,
    invite_limit: inviteLimit,
    active_projects_with_customer: activeProjectsWithCustomer,
    pending_invitations_with_professional: pendingInvitationsWithProfessional,
    has_pending_invitation: hasPendingInvitation,
    invite_limit_reached: inviteLocked,
    invite_lock_message: hasPendingInvitation
      ? `Previous invitation is still pending with this ${contractor.role === 'worker' ? 'worker' : 'contractor'}.`
      : inviteLimitReached
        ? contractor.role === 'contractor'
          ? 'You already have 3 active projects with this contractor. Complete one to send a new invite.'
          : 'You already have an active project with this worker. Complete it before sending another invite.'
      : null,
    my_review_for_project: myReviewForProject
      ? {
          id: myReviewForProject.id,
          rating: Number(myReviewForProject.rating),
          comment: myReviewForProject.comment,
          project_id: myReviewForProject.project_id,
          reviewer_id: myReviewForProject.reviewer_id,
        }
      : null,
    reviews: (reviews ?? []).map((review) => ({
      ...review,
      reviewer_name: reviewerNameById.get(review.reviewer_id) ?? 'Customer',
    })),
  })
}
