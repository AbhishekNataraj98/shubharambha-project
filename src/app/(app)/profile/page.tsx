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
    <div className="min-h-screen bg-white px-4 py-5 pb-24">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5 flex items-center justify-between">
          <Link href="/dashboard" className="rounded-full p-2 hover:bg-gray-100" aria-label="Back">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">My Profile</h1>
          <Link href="/profile/edit" className="text-sm font-medium text-[#E8590C]">
            Edit
          </Link>
        </header>

        <section className="rounded-xl border border-gray-200 bg-white p-5 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#E8590C] text-2xl font-bold text-white">
            {initialsFromName(profile.name)}
          </div>
          <h2 className="mt-3 text-[20px] font-semibold text-gray-900">{profile.name}</h2>
          <div className="mt-2 inline-flex rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-[#E8590C]">
            {profile.role}
          </div>
          <p className="mt-2 text-sm text-gray-500">{formatPhoneIndian(profile.phone_number)}</p>
          <p className="text-sm text-gray-600">
            {profile.city} · {profile.pincode}
          </p>
        </section>

        {(profile.role === 'contractor' || profile.role === 'worker') && (
          <section className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-gray-200 p-3 text-center">
              <p className="text-lg font-semibold text-gray-900">{avgRating.toFixed(1)}</p>
              <p className="text-xs text-gray-500">Avg Rating</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 text-center">
              <p className="text-lg font-semibold text-gray-900">{reviewsCount}</p>
              <p className="text-xs text-gray-500">Reviews</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 text-center">
              <p className="text-lg font-semibold text-gray-900">{projectsCompleted}</p>
              <p className="text-xs text-gray-500">Projects Completed</p>
            </div>
          </section>
        )}

        {profile.bio ? (
          <section className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">About</h3>
            <p className="text-sm text-gray-700">{profile.bio}</p>
          </section>
        ) : null}

        {profile.role === 'contractor' ? (
          <section className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Specialisations</h3>
            <div className="flex flex-wrap gap-2">
              {specialisations.length ? (
                specialisations.map((item) => (
                  <span key={item} className="rounded-full bg-orange-100 px-2.5 py-1 text-xs text-[#E8590C]">
                    {item}
                  </span>
                ))
              ) : (
                <p className="text-sm text-gray-500">Not added yet</p>
              )}
            </div>
            <h4 className="mt-4 mb-1 text-sm font-semibold text-gray-900">Areas served</h4>
            <p className="text-sm text-gray-700">{areasServed.length ? areasServed.join(', ') : 'Not added yet'}</p>
          </section>
        ) : null}

        {profile.role === 'worker' ? (
          <section className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Trade</h3>
            {trade ? (
              <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs text-[#E8590C]">{trade}</span>
            ) : (
              <p className="text-sm text-gray-500">Not added yet</p>
            )}
            <h4 className="mt-4 mb-1 text-sm font-semibold text-gray-900">Areas served</h4>
            <p className="text-sm text-gray-700">{areasServed.length ? areasServed.join(', ') : 'Not added yet'}</p>
          </section>
        ) : null}

        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Recent projects</h3>
            <Link href="/projects" className="text-xs font-medium text-[#E8590C]">
              View all projects
            </Link>
          </div>
          <div className="space-y-3">
            {recentProjects.length ? (
              recentProjects.map((project) => {
                const progress = stageProgress(project.current_stage)
                return (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="block rounded-xl border border-gray-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-base font-semibold text-gray-900">{project.name}</h4>
                        <p className="mt-1 text-sm text-gray-500">
                          {project.address}, {project.city}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          stagePillClass[project.current_stage] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {project.current_stage}
                      </span>
                    </div>
                    <div className="mt-4">
                      <div className="h-2 rounded-full bg-gray-100">
                        <div className="h-2 rounded-full bg-[#E8590C]" style={{ width: `${progress}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Last updated {daysAgoText(latestUpdateByProject.get(project.id))}
                      </p>
                    </div>
                  </Link>
                )
              })
            ) : (
              <p className="text-sm text-gray-500">No recent projects.</p>
            )}
          </div>
        </section>

        <form action={signOutAction} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-lg border border-red-500 px-4 py-2.5 text-sm font-semibold text-red-600"
          >
            Sign out
          </button>
        </form>
      </div>

      <BottomNav />
    </div>
  )
}
