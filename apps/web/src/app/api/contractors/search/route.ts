import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

const querySchema = z.object({
  city: z.string().trim().min(2),
  specialisation: z.string().trim().optional(),
  profileType: z.string().trim().optional(),
})

function pickSpecialisations(profile: Record<string, unknown>) {
  const value = (profile.specialisations ?? profile.specialization ?? []) as unknown
  return Array.isArray(value) ? value.map(String) : []
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    city: url.searchParams.get('city') ?? '',
    specialisation: url.searchParams.get('specialisation') ?? undefined,
    profileType: url.searchParams.get('profileType') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: 'City is required' }, { status: 400 })
  }

  const city = parsed.data.city.toLowerCase()
  const selectedSpecialisation = parsed.data.specialisation?.toLowerCase()
  const selectedProfileType = parsed.data.profileType?.toLowerCase()
  const workerTrades = ['mason', 'plumber', 'carpenter', 'electrician', 'painter']
  const isContractorMode = !selectedProfileType || selectedProfileType === 'contractor'
  const workerTradeFilter = workerTrades.includes(selectedProfileType ?? '')
    ? selectedProfileType
    : null

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server is missing Supabase admin credentials' }, { status: 500 })
  }

  const admin = createAdminClient<Database>(supabaseUrl, serviceRoleKey)

  const { data: contractors, error: contractorError } = isContractorMode
    ? await admin
        .from('users')
        .select('id,name,city,profile_photo_url,contractor_profiles(*)')
        .eq('role', 'contractor')
    : { data: [], error: null as { message: string } | null }

  if (contractorError) {
    return NextResponse.json({ error: contractorError.message }, { status: 400 })
  }

  const contractorUsers = (contractors ?? []).filter((entry) => {
    const profile = Array.isArray(entry.contractor_profiles)
      ? entry.contractor_profiles[0]
      : entry.contractor_profiles
    const profileRecord = (profile ?? {}) as Record<string, unknown>
    const userCity = (entry.city ?? '').toLowerCase()
    const cityMatch = userCity.includes(city)
    if (!cityMatch) return false
    if (!selectedSpecialisation) return true
    const specialisations = pickSpecialisations(profileRecord).map((item) => item.toLowerCase())
    return specialisations.includes(selectedSpecialisation)
  })

  const { data: workers, error: workerError } = workerTradeFilter
    ? await admin
        .from('users')
        .select('id,name,city,profile_photo_url,worker_profiles(*)')
        .eq('role', 'worker')
    : { data: [], error: null as { message: string } | null }

  if (workerError) {
    return NextResponse.json({ error: workerError.message }, { status: 400 })
  }

  const workerUsers = (workers ?? []).filter((entry) => {
    const profile = Array.isArray(entry.worker_profiles)
      ? entry.worker_profiles[0]
      : entry.worker_profiles
    const profileRecord = (profile ?? {}) as Record<string, unknown>
    const skillTags = Array.isArray(profileRecord.skill_tags)
      ? profileRecord.skill_tags.map(String)
      : []
    const tagsLower = skillTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)
    const trade = String(profileRecord.trade ?? '').trim().toLowerCase()
    const tradeMatches =
      Boolean(workerTradeFilter) &&
      (trade === workerTradeFilter || tagsLower.includes(workerTradeFilter))
    if (!tradeMatches) return false
    const userCity = (entry.city ?? '').toLowerCase()
    return userCity.includes(city)
  })

  const allProfileIds = [...contractorUsers.map((entry) => entry.id), ...workerUsers.map((entry) => entry.id)]
  const { data: professionalImageRows } = allProfileIds.length
    ? await (admin as any)
        .from('professional_images')
        .select('professional_id,image_url,created_at')
        .in('professional_id', allProfileIds)
        .order('created_at', { ascending: true })
    : { data: [] as Array<{ professional_id: string; image_url: string; created_at: string }> }
  const imagesByProfessional = new Map<string, string[]>()
  for (const row of professionalImageRows ?? []) {
    if (!row.image_url) continue
    const current = imagesByProfessional.get(row.professional_id) ?? []
    if (current.length < 3) current.push(row.image_url)
    imagesByProfessional.set(row.professional_id, current)
  }

  const { data: reviewRows } = allProfileIds.length
    ? await admin.from('reviews').select('reviewee_id,rating').in('reviewee_id', allProfileIds)
    : { data: [] as Array<{ reviewee_id: string; rating: number }> }

  const contractorIds = contractorUsers.map((entry) => entry.id)
  const workerIds = workerUsers.map((entry) => entry.id)

  const { data: contractorCompletedRows } = contractorIds.length
    ? await admin
        .from('projects')
        .select('contractor_id,status')
        .in('contractor_id', contractorIds)
        .eq('status', 'completed')
    : { data: [] as Array<{ contractor_id: string | null; status: string }> }

  const { data: workerMemberships } = workerIds.length
    ? await admin.from('project_members').select('user_id,project_id').in('user_id', workerIds)
    : { data: [] as Array<{ user_id: string; project_id: string }> }

  const workerProjectIds = Array.from(new Set((workerMemberships ?? []).map((row) => row.project_id)))
  const { data: completedWorkerProjects } = workerProjectIds.length
    ? await admin.from('projects').select('id,status').in('id', workerProjectIds).eq('status', 'completed')
    : { data: [] as Array<{ id: string; status: string }> }

  const ratingMap = new Map<string, { total: number; count: number }>()
  for (const row of reviewRows ?? []) {
    const current = ratingMap.get(row.reviewee_id) ?? { total: 0, count: 0 }
    ratingMap.set(row.reviewee_id, { total: current.total + row.rating, count: current.count + 1 })
  }

  const completionMap = new Map<string, number>()
  for (const row of contractorCompletedRows ?? []) {
    if (!row.contractor_id) continue
    completionMap.set(row.contractor_id, (completionMap.get(row.contractor_id) ?? 0) + 1)
  }
  const completedWorkerProjectIds = new Set((completedWorkerProjects ?? []).map((row) => row.id))
  for (const row of workerMemberships ?? []) {
    if (!completedWorkerProjectIds.has(row.project_id)) continue
    completionMap.set(row.user_id, (completionMap.get(row.user_id) ?? 0) + 1)
  }

  const contractorPayload = contractorUsers.map((entry) => {
    const profile = Array.isArray(entry.contractor_profiles)
      ? entry.contractor_profiles[0]
      : entry.contractor_profiles
    const profileRecord = (profile ?? {}) as Record<string, unknown>
    const rating = ratingMap.get(entry.id)
    return {
      id: entry.id,
      name: entry.name,
      city: entry.city,
      profile_photo_url: (entry as { profile_photo_url?: string | null }).profile_photo_url ?? null,
      profile_images: imagesByProfessional.get(entry.id) ?? [],
      profile_kind: 'contractor',
      trade: null,
      avg_rating: rating && rating.count > 0 ? Number((rating.total / rating.count).toFixed(1)) : 0,
      total_reviews: rating?.count ?? 0,
      projects_completed: completionMap.get(entry.id) ?? 0,
      specialisations: pickSpecialisations(profileRecord),
      years_experience: Number(profileRecord.years_experience ?? 0),
    }
  })

  const workerPayload = workerUsers.map((entry) => {
    const profile = Array.isArray(entry.worker_profiles)
      ? entry.worker_profiles[0]
      : entry.worker_profiles
    const profileRecord = (profile ?? {}) as Record<string, unknown>
    const rating = ratingMap.get(entry.id)
    const skillTags = Array.isArray(profileRecord.skill_tags)
      ? profileRecord.skill_tags.map(String)
      : []
    const trade = String(profileRecord.trade ?? skillTags[0] ?? '')
    return {
      id: entry.id,
      name: entry.name,
      city: entry.city,
      profile_photo_url: (entry as { profile_photo_url?: string | null }).profile_photo_url ?? null,
      profile_images: imagesByProfessional.get(entry.id) ?? [],
      profile_kind: 'worker',
      trade: trade || null,
      avg_rating: rating && rating.count > 0 ? Number((rating.total / rating.count).toFixed(1)) : 0,
      total_reviews: rating?.count ?? 0,
      projects_completed: completionMap.get(entry.id) ?? 0,
      specialisations: trade ? [trade] : [],
      years_experience: Number(profileRecord.years_experience ?? 0),
    }
  })

  return NextResponse.json([...contractorPayload, ...workerPayload])
}
