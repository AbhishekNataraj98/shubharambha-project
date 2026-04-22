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
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#FAFAFA' }}>
      {/* Gradient Header */}
      <div
        style={{
          background: 'linear-gradient(to right, #E8590C, #C44A0A)',
        }}
        className="px-4 py-6 text-white"
      >
        <div className="mx-auto flex w-full max-w-md items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white bg-opacity-20">
              <span className="text-lg font-bold">S</span>
            </div>
            <span className="text-lg font-bold">Shubharambha</span>
          </div>

          <AvatarMenu initials={initialsFromName(profile.name)} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-4 py-6">
        {/* Greeting Card */}
        <section className="mb-6 rounded-xl bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>
            {getGreeting()}, {profile.name}
          </h1>
          <div className="mt-3 inline-flex rounded-full px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: '#FFF8F5', color: '#E8590C' }}>
            {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
          </div>
        </section>

        {/* Stat Cards */}
        {(profile.role === 'customer' || profile.role === 'contractor') && (
          <section className="mb-6 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium" style={{ color: '#7A6F66' }}>
                    Active Projects
                  </p>
                  <p className="mt-2 text-3xl font-bold" style={{ color: '#1A1A1A' }}>
                    {activeProjectsCount}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: '#E8590C' }}>
                  <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3.5 7.5h6l1.5 2h9.5v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium" style={{ color: '#7A6F66' }}>
                    {secondaryMetricLabel}
                  </p>
                  <p className="mt-2 text-xl font-bold" style={{ color: '#1A1A1A' }}>
                    ₹{secondaryMetricValue.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: '#C44A0A' }}>
                  <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="8" />
                  </svg>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Projects Section */}
        <section className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold" style={{ color: '#1A1A1A' }}>
              Your Projects
            </h2>
            {profile.role === 'customer' ? (
              <Link
                href="/projects/new"
                className="rounded-lg px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#E8590C' }}
              >
                + New
              </Link>
            ) : null}
          </div>

          {profile.role === 'customer' ? (
            <div className="mb-4 flex flex-wrap gap-2">
              <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: '#FEF3E2', color: '#B8860B' }}>
                Awaiting contractor
              </span>
              <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: '#E8F5E9', color: '#2E7D32' }}>
                In Progress
              </span>
              <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: '#FFEBEE', color: '#C62828' }}>
                Declined
              </span>
              <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: '#F5F5F5', color: '#616161' }}>
                Completed
              </span>
            </div>
          ) : null}

          {/* Pending Invitations */}
          {profile.role === 'contractor' && (pendingInvitations?.length ?? 0) > 0 ? (
            <div className="mb-5 space-y-3">
              <h3 className="text-sm font-bold" style={{ color: '#1A1A1A' }}>
                Pending Invitations
              </h3>
              {pendingInvitations?.map((invitation) => (
                <div key={invitation.id} className="rounded-lg p-4" style={{ backgroundColor: '#FEF3E2', borderLeft: '4px solid #E8590C' }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold" style={{ color: '#1A1A1A' }}>
                        {invitation.name}
                      </p>
                      <p className="mt-0.5 text-xs" style={{ color: '#7A6F66' }}>
                        {invitation.city}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: '#7A6F66' }}>
                        Customer: {pendingCustomerNameById.get(invitation.customer_id) ?? 'Customer'}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs" style={{ color: '#7A6F66' }}>
                    Sent {daysAgoText(invitation.created_at)}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <InvitationActions projectId={invitation.id} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* Projects List */}
          {safeProjects.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center" style={{ borderColor: '#E0D5CC', backgroundColor: '#FFFBF7' }}>
              <p className="text-sm font-medium" style={{ color: '#7A6F66' }}>
                No projects yet. Start your first project now.
              </p>
              {profile.role === 'customer' ? (
                <Link
                  href="/projects/new"
                  className="mt-4 inline-block rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: '#E8590C' }}
                >
                  + Create your first project
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {safeProjects.map((project) => {
                const progress = stageProgress[project.current_stage] ?? 0
                const isActive = project.status === 'active'
                const isPending = project.status === 'pending' || project.status === 'on_hold'
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
                    className="block rounded-lg bg-white p-4 transition-shadow hover:shadow-md"
                    style={{
                      borderLeft: isActive ? '4px solid #4CAF50' : isPending ? '4px solid #FFC107' : '4px solid #E0D5CC',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="font-bold" style={{ color: '#1A1A1A' }}>
                          {project.name}
                        </h3>
                        <p className="mt-1 text-xs" style={{ color: '#7A6F66' }}>
                          {project.address}, {project.city}
                        </p>
                      </div>
                      <span className="flex flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold" style={getStatusPillStyles(project.status)}>
                        {stageLabel}
                      </span>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 h-2 rounded-full mr-2" style={{ backgroundColor: '#E0D5CC' }}>
                          <div className="h-2 rounded-full" style={{ width: `${progress}%`, backgroundColor: '#E8590C' }} />
                        </div>
                        <p className="text-xs font-medium" style={{ color: '#7A6F66' }}>
                          {progress}%
                        </p>
                      </div>
                    </div>

                    <p className="mt-3 text-xs" style={{ color: '#7A6F66' }}>
                      {counterpartLabel}: <span className="font-semibold" style={{ color: '#1A1A1A' }}>{counterpartName}</span>
                    </p>
                    <p className="mt-1 text-xs" style={{ color: '#999' }}>
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

function getStatusPillStyles(status: string) {
  if (status === 'active') return { backgroundColor: '#E8F5E9', color: '#2E7D32' }
  if (status === 'pending' || status === 'on_hold') return { backgroundColor: '#FEF3E2', color: '#B8860B' }
  if (status === 'completed') return { backgroundColor: '#F5F5F5', color: '#616161' }
  if (status === 'cancelled') return { backgroundColor: '#FFEBEE', color: '#C62828' }
  return { backgroundColor: '#F5F5F5', color: '#616161' }
}
