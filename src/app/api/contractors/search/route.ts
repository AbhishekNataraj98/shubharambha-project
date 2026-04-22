import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

const querySchema = z.object({
  city: z.string().trim().min(2),
  specialisation: z.string().trim().optional(),
})

function pickSpecialisations(profile: Record<string, unknown>) {
  const value = (profile.specialisations ?? profile.specialization ?? []) as unknown
  return Array.isArray(value) ? value.map(String) : []
}

function pickServiceCities(profile: Record<string, unknown>) {
  const value = (profile.service_cities ?? profile.service_locations ?? []) as unknown
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
  })

  if (!parsed.success) {
    return NextResponse.json({ error: 'City is required' }, { status: 400 })
  }

  const city = parsed.data.city.toLowerCase()
  const selectedSpecialisation = parsed.data.specialisation?.toLowerCase()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server is missing Supabase admin credentials' }, { status: 500 })
  }

  const admin = createAdminClient<Database>(supabaseUrl, serviceRoleKey)

  const { data: contractors, error } = await admin
    .from('users')
    .select('id,name,city,contractor_profiles(*)')
    .eq('role', 'contractor')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const contractorUsers = (contractors ?? []).filter((entry) => {
    const profile = Array.isArray(entry.contractor_profiles)
      ? entry.contractor_profiles[0]
      : entry.contractor_profiles

    const profileRecord = (profile ?? {}) as Record<string, unknown>
    const serviceCities = pickServiceCities(profileRecord).map((item) => item.toLowerCase())
    const userCity = (entry.city ?? '').toLowerCase()
    const cityMatch = userCity.includes(city) || serviceCities.some((item) => item.includes(city))
    if (!cityMatch) return false

    if (!selectedSpecialisation) return true
    const specialisations = pickSpecialisations(profileRecord).map((item) => item.toLowerCase())
    return specialisations.includes(selectedSpecialisation)
  })

  const contractorIds = contractorUsers.map((entry) => entry.id)

  const { data: reviewRows } = contractorIds.length
    ? await admin.from('reviews').select('reviewee_id,rating').in('reviewee_id', contractorIds)
    : { data: [] as Array<{ reviewee_id: string; rating: number }> }

  const { data: completedRows } = contractorIds.length
    ? await admin
        .from('projects')
        .select('contractor_id,status')
        .in('contractor_id', contractorIds)
        .eq('status', 'completed')
    : { data: [] as Array<{ contractor_id: string | null; status: string }> }

  const ratingMap = new Map<string, { total: number; count: number }>()
  for (const row of reviewRows ?? []) {
    const current = ratingMap.get(row.reviewee_id) ?? { total: 0, count: 0 }
    ratingMap.set(row.reviewee_id, { total: current.total + row.rating, count: current.count + 1 })
  }

  const completionMap = new Map<string, number>()
  for (const row of completedRows ?? []) {
    if (!row.contractor_id) continue
    completionMap.set(row.contractor_id, (completionMap.get(row.contractor_id) ?? 0) + 1)
  }

  const payload = contractorUsers.map((entry) => {
    const profile = Array.isArray(entry.contractor_profiles)
      ? entry.contractor_profiles[0]
      : entry.contractor_profiles
    const profileRecord = (profile ?? {}) as Record<string, unknown>
    const rating = ratingMap.get(entry.id)
    return {
      id: entry.id,
      name: entry.name,
      city: entry.city,
      avg_rating: rating && rating.count > 0 ? Number((rating.total / rating.count).toFixed(1)) : 0,
      total_reviews: rating?.count ?? 0,
      projects_completed: completionMap.get(entry.id) ?? 0,
      specialisations: pickSpecialisations(profileRecord),
      years_experience: Number(profileRecord.years_experience ?? 0),
    }
  })

  return NextResponse.json(payload)
}
