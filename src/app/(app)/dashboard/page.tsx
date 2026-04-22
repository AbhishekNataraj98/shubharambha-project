import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import AvatarMenu from '@/components/shared/avatar-menu'
import InvitationActions from '@/components/shared/invitation-actions'
import BottomNav from '@/components/shared/bottom-nav'
import type { Database } from '@/types/supabase'

const stageProgress: Record<string, number> = {
  foundation: 10,
  plinth: 25,
  walls: 45,
  slab: 60,
  plastering: 80,
  finishing: 100,
}

const stagePillClass: Record<string, string> = {
  foundation: 'bg-gray-100 text-gray-700',
  plinth: 'bg-blue-100 text-blue-700',
  walls: 'bg-amber-100 text-amber-700',
  slab: 'bg-orange-100 text-orange-700',
  plastering: 'bg-purple-100 text-purple-700',
  finishing: 'bg-green-100 text-green-700',
}

const customerStatusClass: Record<string, string> = {
  on_hold: 'bg-yellow-100 text-yellow-800',
  pending: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-700',
}

const customerStatusLabel: Record<string, string> = {
  on_hold: 'Awaiting contractor',
  pending: 'Awaiting contractor',
  active: 'In Progress',
  completed: 'Completed',
  cancelled: 'Contractor declined',
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function initialsFromName(name?: string | null) {
  if (!name) return 'U'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'U'
}

function daysAgoText(dateValue?: string) {
  if (!dateValue) return 'No updates yet'
  const now = Date.now()
  const then = new Date(dateValue).getTime()
  const diffDays = Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)))
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id,name,role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) redirect('/register')

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: memberRows } =
    profile.role === 'worker' || profile.role === 'supplier'
      ? await supabase.from('project_members').select('project_id').eq('user_id', user.id)
      : { data: [] as Array<{ project_id: string }> }
  const memberProjectIds = Array.from(new Set((memberRows ?? []).map((row) => row.project_id)))

  let projects:
    | Array<{
        id: string
        name: string
        address: string
        city: string
        status: string
        current_stage: string
        customer_id: string
        contractor_id: string | null
        created_at: string
      }>
    | null = null

  if (profile.role === 'customer') {
    const response = await supabase
      .from('projects')
      .select('id,name,address,city,status,current_stage,customer_id,contractor_id,created_at')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })
    projects = response.data as typeof projects
  } else if (profile.role === 'contractor') {
    const response = await supabase
      .from('projects')
      .select('id,name,address,city,status,current_stage,customer_id,contractor_id,created_at')
      .eq('contractor_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    projects = response.data as typeof projects
  } else {
    const response = memberProjectIds.length
      ? await supabase
          .from('projects')
          .select('id,name,address,city,status,current_stage,customer_id,contractor_id,created_at')
          .in('id', memberProjectIds)
          .order('created_at', { ascending: false })
      : { data: [] }
    projects = response.data as typeof projects
  }

  const safeProjects = projects ?? []
  const projectIds = safeProjects.map((project) => project.id)

  const relatedUserIds = Array.from(
    new Set(
      safeProjects.flatMap((project) =>
        [project.customer_id, project.contractor_id].filter(Boolean) as string[]
      )
    )
  )

  const { data: relatedUsers } = relatedUserIds.length
    ? await admin.from('users').select('id,name').in('id', relatedUserIds)
    : { data: [] as Array<{ id: string; name: string }> }

  const userNameById = new Map((relatedUsers ?? []).map((entry) => [entry.id, entry.name]))

  const { data: updates } = projectIds.length
    ? await supabase
        .from('daily_updates')
        .select('project_id,created_at')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
    : { data: [] as Array<{ project_id: string; created_at: string }> }

  const latestUpdateByProject = new Map<string, string>()
  for (const update of updates ?? []) {
    if (!latestUpdateByProject.has(update.project_id)) {
      latestUpdateByProject.set(update.project_id, update.created_at)
    }
  }

  const activeProjectsCount = safeProjects.filter((project) => project.status === 'active').length
  let secondaryMetricLabel = ''
  let secondaryMetricValue = 0

  const { data: pendingInvitations } =
    profile.role === 'contractor'
      ? await supabase
          .from('projects')
          .select('id,name,city,customer_id,created_at,status')
          .eq('contractor_id', user.id)
          .eq('status', 'on_hold')
          .order('created_at', { ascending: false })
      : { data: [] as Array<{ id: string; name: string; city: string; customer_id: string; created_at: string }> }

  const pendingCustomerIds = Array.from(
    new Set((pendingInvitations ?? []).map((invitation) => invitation.customer_id))
  )
  const { data: pendingCustomers } = pendingCustomerIds.length
    ? await admin.from('users').select('id,name').in('id', pendingCustomerIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const pendingCustomerNameById = new Map((pendingCustomers ?? []).map((entry) => [entry.id, entry.name]))

  if (profile.role === 'customer' && projectIds.length > 0) {
    const { data: customerPayments } = await supabase
      .from('payments')
      .select('amount')
      .in('project_id', projectIds)
      .eq('recorded_by', user.id)

    secondaryMetricLabel = 'Total Spent ₹'
    secondaryMetricValue = (customerPayments ?? []).reduce((sum, payment) => sum + payment.amount, 0)
  }

  if (profile.role === 'contractor' && projectIds.length > 0) {
    const { data: pendingPayments } = await supabase
      .from('payments')
      .select('amount')
      .in('project_id', projectIds)
      .eq('paid_to', user.id)
      .eq('status', 'pending_confirmation')

    secondaryMetricLabel = 'Pending Payments ₹'
    secondaryMetricValue = (pendingPayments ?? []).reduce((sum, payment) => sum + payment.amount, 0)
  }

  return (
    <div className="min-h-screen bg-white pb-24">
      <div className="mx-auto w-full max-w-md px-4 py-5">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E8590C] text-base font-bold text-white">
              S
            </div>
            <span className="text-lg font-semibold text-gray-900">Shubharambha</span>
          </div>

          <AvatarMenu initials={initialsFromName(profile.name)} />
        </header>

        <section className="mt-6">
          <h1 className="text-2xl font-bold text-gray-900">
            {getGreeting()}, {profile.name}
          </h1>
          <div className="mt-2 inline-flex rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-[#E8590C]">
            {profile.role}
          </div>
        </section>

        {(profile.role === 'customer' || profile.role === 'contractor') && (
          <section className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500">Active Projects</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{activeProjectsCount}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-500">{secondaryMetricLabel}</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                ₹{secondaryMetricValue.toLocaleString('en-IN')}
              </p>
            </div>
          </section>
        )}

        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Your Projects</h2>
            {profile.role === 'customer' ? (
              <Link
                href="/projects/new"
                className="rounded-lg bg-[#E8590C] px-3 py-2 text-xs font-semibold text-white"
              >
                Start a Project
              </Link>
            ) : null}
          </div>

          {profile.role === 'customer' ? (
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-[11px] font-medium text-yellow-800">
                Awaiting contractor
              </span>
              <span className="rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-medium text-green-700">
                In Progress
              </span>
              <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-medium text-red-700">
                Contractor declined
              </span>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700">
                Completed
              </span>
            </div>
          ) : null}

          {profile.role === 'contractor' && (pendingInvitations?.length ?? 0) > 0 ? (
            <div className="mb-5">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Pending Invitations</h3>
              <div className="space-y-3">
                {pendingInvitations?.map((invitation) => (
                  <div key={invitation.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-semibold text-gray-900">{invitation.name}</p>
                    <p className="text-xs text-gray-600">{invitation.city}</p>
                    <p className="mt-1 text-xs text-gray-600">
                      Customer: {pendingCustomerNameById.get(invitation.customer_id) ?? 'Customer'}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Sent {daysAgoText(invitation.created_at)}</p>
                    <InvitationActions projectId={invitation.id} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {safeProjects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
              <p className="text-sm text-gray-600">No projects yet. Start your first project now.</p>
              {profile.role === 'customer' ? (
                <Link
                  href="/projects/new"
                  className="mt-4 inline-block rounded-lg bg-[#E8590C] px-4 py-2 text-sm font-semibold text-white"
                >
                  + Create your first project
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {safeProjects.map((project) => {
                const progress = stageProgress[project.current_stage] ?? 0
                const stageClass =
                  profile.role === 'customer'
                    ? customerStatusClass[project.status] ?? 'bg-gray-100 text-gray-700'
                    : stagePillClass[project.current_stage] ?? 'bg-gray-100 text-gray-700'
                const stageLabel =
                  profile.role === 'customer'
                    ? customerStatusLabel[project.status] ?? project.status
                    : project.current_stage
                const counterpartLabel = profile.role === 'customer' ? 'Contractor' : 'Customer'
                const counterpartName =
                  profile.role === 'customer'
                    ? project.contractor_id
                      ? userNameById.get(project.contractor_id) ?? 'Not assigned'
                      : 'Not assigned'
                    : userNameById.get(project.customer_id) ?? 'Unknown'

                return (
                  <Link
                    href={`/projects/${project.id}`}
                    key={project.id}
                    className="block rounded-xl border border-gray-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">{project.name}</h3>
                        <p className="mt-1 text-sm text-gray-500">
                          {project.address}, {project.city}
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stageClass}`}>
                        {stageLabel}
                      </span>
                    </div>

                    <div className="mt-4">
                      <div className="h-2 rounded-full bg-gray-100">
                        <div className="h-2 rounded-full bg-[#E8590C]" style={{ width: `${progress}%` }} />
                      </div>
                      <p className="mt-2 text-xs text-gray-500">{progress}% complete</p>
                    </div>

                    <p className="mt-3 text-sm text-gray-700">
                      {counterpartLabel}: <span className="font-medium">{counterpartName}</span>
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Last update: {daysAgoText(latestUpdateByProject.get(project.id))}
                    </p>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <BottomNav />
    </div>
  )
}
