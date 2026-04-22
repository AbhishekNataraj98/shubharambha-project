import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import BottomNav from '@/components/shared/bottom-nav'

function initialsFromName(name?: string | null) {
  if (!name) return 'U'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'U'
}

function formatPhoneIndian(phone?: string | null) {
  if (!phone) return 'Not available'
  const digits = phone.replace(/\D/g, '')
  const local = digits.length >= 10 ? digits.slice(-10) : digits
  if (local.length !== 10) return phone
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`
}

function stageProgress(stage: string) {
  const map: Record<string, number> = {
    foundation: 10,
    plinth: 25,
    walls: 45,
    slab: 60,
    plastering: 80,
    finishing: 100,
  }
  return map[stage] ?? 0
}

function daysAgoText(dateValue?: string) {
  if (!dateValue) return 'No updates yet'
  const now = Date.now()
  const then = new Date(dateValue).getTime()
  const diffDays = Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)))
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

const stagePillClass: Record<string, string> = {
  foundation: 'bg-gray-100 text-gray-700',
  plinth: 'bg-blue-100 text-blue-700',
  walls: 'bg-amber-100 text-amber-700',
  slab: 'bg-orange-100 text-orange-700',
  plastering: 'bg-purple-100 text-purple-700',
  finishing: 'bg-green-100 text-green-700',
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
    .select('id,name,role,phone_number,city,pincode,bio')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) redirect('/register')

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let specialisations: string[] = []
  let areasServed: string[] = []
  let trade: string | null = null

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
        : []
    areasServed = Array.isArray(record.service_cities)
      ? (record.service_cities as string[])
      : Array.isArray(record.service_locations)
        ? (record.service_locations as string[])
        : []
  }

  if (profile.role === 'worker') {
    const { data: workerProfile } = await admin
      .from('worker_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    const record = (workerProfile ?? {}) as Record<string, unknown>
    trade = typeof record.trade === 'string' ? record.trade : Array.isArray(record.skill_tags) ? String((record.skill_tags as string[])[0] ?? '') : null
    areasServed = Array.isArray(record.service_cities)
      ? (record.service_cities as string[])
      : typeof record.availability_note === 'string'
        ? record.availability_note
            .replace('Areas served:', '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : []
  }

  const { data: reviews } = await admin.from('reviews').select('rating').eq('reviewee_id', user.id)
  const reviewsCount = (reviews ?? []).length
  const avgRating =
    reviewsCount > 0
      ? Number(((reviews ?? []).reduce((sum, review) => sum + Number(review.rating), 0) / reviewsCount).toFixed(1))
      : 0

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

  let recentProjects:
    | Array<{
        id: string
        name: string
        address: string
        city: string
        current_stage: string
        contractor_id: string | null
        customer_id: string
      }>
    = []

  if (profile.role === 'customer') {
    const { data } = await admin
      .from('projects')
      .select('id,name,address,city,current_stage,contractor_id,customer_id,created_at')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3)
    recentProjects = (data ?? []) as typeof recentProjects
  } else if (profile.role === 'contractor') {
    const { data } = await admin
      .from('projects')
      .select('id,name,address,city,current_stage,contractor_id,customer_id,created_at')
      .eq('contractor_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3)
    recentProjects = (data ?? []) as typeof recentProjects
  } else {
    const { data: memberships } = await admin
      .from('project_members')
      .select('project_id')
      .eq('user_id', user.id)
    const ids = Array.from(new Set((memberships ?? []).map((m) => m.project_id))).slice(0, 10)
    if (ids.length) {
      const { data } = await admin
        .from('projects')
        .select('id,name,address,city,current_stage,contractor_id,customer_id,created_at')
        .in('id', ids)
        .order('created_at', { ascending: false })
        .limit(3)
      recentProjects = (data ?? []) as typeof recentProjects
    }
  }

  const recentProjectIds = recentProjects.map((project) => project.id)
  const { data: updates } = recentProjectIds.length
    ? await admin
        .from('daily_updates')
        .select('project_id,created_at')
        .in('project_id', recentProjectIds)
        .order('created_at', { ascending: false })
    : { data: [] as Array<{ project_id: string; created_at: string }> }
  const latestUpdateByProject = new Map<string, string>()
  for (const update of updates ?? []) {
    if (!latestUpdateByProject.has(update.project_id)) {
      latestUpdateByProject.set(update.project_id, update.created_at)
    }
  }

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: '#FAFAFA' }}>
      {/* Gradient Header */}
      <div
        style={{
          background: 'linear-gradient(to right, #E8590C, #C44A0A)',
          height: '180px',
        }}
        className="relative px-4"
      >
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-start justify-between py-4">
            <Link href="/dashboard" className="rounded-full p-2 hover:bg-white hover:bg-opacity-20" aria-label="Back">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
            </Link>
            <Link
              href="/profile/edit"
              className="rounded-lg px-3 py-2 text-sm font-semibold transition-all hover:bg-white hover:bg-opacity-20"
              style={{ border: '2px solid white', color: 'white' }}
            >
              Edit
            </Link>
          </div>
        </div>

        {/* Avatar Overlapping */}
        <div className="absolute left-1/2 bottom-0 translate-x-[-50%] translate-y-1/2">
          <div
            className="flex h-22 w-22 items-center justify-center rounded-full text-3xl font-bold text-white"
            style={{
              width: '88px',
              height: '88px',
              backgroundColor: '#E8590C',
              border: '3px solid white',
            }}
          >
            {initialsFromName(profile.name)}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-4" style={{ paddingTop: '44px + 44px' }}>
        {/* Profile Info */}
        <section className="mb-6 text-center">
          <h2 className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>
            {profile.name}
          </h2>
          <div className="mt-3 inline-flex rounded-full px-3 py-1.5 text-xs font-semibold text-white" style={{ backgroundColor: '#E8590C' }}>
            {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
          </div>
          <p className="mt-3 text-sm font-medium" style={{ color: '#7A6F66' }}>
            {formatPhoneIndian(profile.phone_number)}
          </p>
          <p className="mt-1 text-xs font-medium" style={{ color: '#999' }}>
            {profile.city} · {profile.pincode}
          </p>
        </section>

        {/* Stats Row */}
        {(profile.role === 'contractor' || profile.role === 'worker') && (
          <section className="mb-6 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-white p-4 text-center shadow-sm">
              <p className="text-2xl font-bold" style={{ color: '#E8590C' }}>
                {avgRating.toFixed(1)}
              </p>
              <p className="mt-2 text-xs font-medium" style={{ color: '#7A6F66' }}>
                Rating
              </p>
            </div>
            <div className="rounded-lg bg-white p-4 text-center shadow-sm">
              <p className="text-2xl font-bold" style={{ color: '#E8590C' }}>
                {reviewsCount}
              </p>
              <p className="mt-2 text-xs font-medium" style={{ color: '#7A6F66' }}>
                Reviews
              </p>
            </div>
            <div className="rounded-lg bg-white p-4 text-center shadow-sm">
              <p className="text-2xl font-bold" style={{ color: '#E8590C' }}>
                {projectsCompleted}
              </p>
              <p className="mt-2 text-xs font-medium" style={{ color: '#7A6F66' }}>
                Completed
              </p>
            </div>
          </section>
        )}

        {/* Location */}
        {profile.city ? (
          <section className="mb-4 rounded-lg bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-bold" style={{ color: '#999' }}>
              LOCATION
            </p>
            <p className="text-sm font-medium" style={{ color: '#1A1A1A' }}>
              {profile.city}
              {profile.pincode && `, ${profile.pincode}`}
            </p>
          </section>
        ) : null}

        {/* About */}
        {profile.bio ? (
          <section className="mb-4 rounded-lg bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-bold" style={{ color: '#999' }}>
              ABOUT
            </p>
            <p className="text-sm font-medium leading-relaxed" style={{ color: '#1A1A1A' }}>
              {profile.bio}
            </p>
          </section>
        ) : null}

        {/* Specialisations (Contractor) */}
        {profile.role === 'contractor' ? (
          <>
            <section className="mb-4 rounded-lg bg-white p-4 shadow-sm">
              <p className="mb-3 text-xs font-bold" style={{ color: '#999' }}>
                SPECIALISATIONS
              </p>
              <div className="flex flex-wrap gap-2">
                {specialisations.length ? (
                  specialisations.map((item) => (
                    <span
                      key={item}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold text-white"
                      style={{ backgroundColor: '#E8590C' }}
                    >
                      {item}
                    </span>
                  ))
                ) : (
                  <p className="text-xs font-medium" style={{ color: '#7A6F66' }}>
                    Not added yet
                  </p>
                )}
              </div>
            </section>

            <section className="mb-4 rounded-lg bg-white p-4 shadow-sm">
              <p className="mb-2 text-xs font-bold" style={{ color: '#999' }}>
                AREAS SERVED
              </p>
              <p className="text-sm font-medium" style={{ color: areasServed.length ? '#1A1A1A' : '#7A6F66' }}>
                {areasServed.length ? areasServed.join(', ') : 'Not added yet'}
              </p>
            </section>
          </>
        ) : null}

        {/* Trade (Worker) */}
        {profile.role === 'worker' ? (
          <>
            <section className="mb-4 rounded-lg bg-white p-4 shadow-sm">
              <p className="mb-3 text-xs font-bold" style={{ color: '#999' }}>
                TRADE
              </p>
              {trade ? (
                <span
                  className="inline-flex rounded-full px-3 py-1.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: '#E8590C' }}
                >
                  {trade}
                </span>
              ) : (
                <p className="text-xs font-medium" style={{ color: '#7A6F66' }}>
                  Not added yet
                </p>
              )}
            </section>

            <section className="mb-4 rounded-lg bg-white p-4 shadow-sm">
              <p className="mb-2 text-xs font-bold" style={{ color: '#999' }}>
                AREAS SERVED
              </p>
              <p className="text-sm font-medium" style={{ color: areasServed.length ? '#1A1A1A' : '#7A6F66' }}>
                {areasServed.length ? areasServed.join(', ') : 'Not added yet'}
              </p>
            </section>
          </>
        ) : null}

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <section className="mb-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold" style={{ color: '#1A1A1A' }}>
                Recent Projects
              </h3>
              <Link href="/projects" className="text-sm font-semibold transition-colors hover:opacity-80" style={{ color: '#E8590C' }}>
                View all →
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {recentProjects.map((project) => {
                const progress = stageProgress(project.current_stage)
                return (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="flex-shrink-0 rounded-lg bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                    style={{ width: '280px', border: '2px solid #E0D5CC' }}
                  >
                    <h4 className="font-semibold" style={{ color: '#1A1A1A' }}>
                      {project.name}
                    </h4>
                    <p className="mt-1 text-xs font-medium" style={{ color: '#7A6F66' }}>
                      {project.city}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <span
                        className="rounded-full px-2.5 py-1 text-xs font-semibold"
                        style={{
                          backgroundColor: '#FFF8F5',
                          color: '#E8590C',
                        }}
                      >
                        {project.current_stage}
                      </span>
                      <p className="text-xs font-medium" style={{ color: '#7A6F66' }}>
                        {progress}%
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* Sign Out Button */}
        <form action={signOutAction} className="mb-24">
          <button
            type="submit"
            className="w-full rounded-lg px-4 py-3 text-sm font-semibold transition-colors hover:bg-red-50"
            style={{
              border: '2px solid #EF4444',
              color: '#EF4444',
            }}
          >
            Sign Out
          </button>
        </form>
      </div>

      <BottomNav />
    </div>
  )
}
