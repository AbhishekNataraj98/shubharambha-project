import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
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

const STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; label: string; border: string }
> = {
  pending: {
    bg: '#FEF3C7',
    text: '#92400E',
    label: 'Awaiting Contractor',
    border: '#F59E0B',
  },
  on_hold: {
    bg: '#FEF3C7',
    text: '#92400E',
    label: 'Awaiting Contractor',
    border: '#F59E0B',
  },
  active: {
    bg: '#D1FAE5',
    text: '#065F46',
    label: 'In Progress',
    border: '#10B981',
  },
  completed: {
    bg: '#F3F4F6',
    text: '#374151',
    label: 'Completed',
    border: '#9CA3AF',
  },
  cancelled: {
    bg: '#FEE2E2',
    text: '#991B1B',
    label: 'Cancelled',
    border: '#EF4444',
  },
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function daysAgoText(dateValue?: string) {
  if (!dateValue) return 'No updates yet'
  const now = Date.now()
  const then = new Date(dateValue).getTime()
  const diffDays = Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)))
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

function awaitingLabel(project: { contractor_id: string | null }) {
  return project.contractor_id ? 'Waiting contractor approval' : 'Waiting worker approval'
}

const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  foundation: { bg: '#F1F5F9', text: '#475569' },
  plinth: { bg: '#EFF6FF', text: '#1D4ED8' },
  walls: { bg: '#FFFBEB', text: '#92400E' },
  slab: { bg: '#FFF7ED', text: '#C2410C' },
  plastering: { bg: '#FAF5FF', text: '#6D28D9' },
  finishing: { bg: '#ECFDF5', text: '#065F46' },
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
    const ownedProjects = (response.data ?? []) as NonNullable<typeof projects>
    const projectIds = ownedProjects.map((project) => project.id)
    if (projectIds.length > 0) {
      const { data: members } = await supabase
        .from('project_members')
        .select('project_id,user_id,role')
        .in('project_id', projectIds)
      const memberRows = (members ?? []) as Array<{ project_id: string; user_id: string; role: string | null }>
      projects = ownedProjects.filter((project) => {
        if (project.contractor_id) return memberRows.some((m) => m.project_id === project.id && m.user_id === project.contractor_id)
        return memberRows.some((m) => m.project_id === project.id && m.role === 'worker')
      })
    } else {
      projects = []
    }
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
  const { data: workerMembers } = projectIds.length
    ? await supabase.from('project_members').select('project_id').in('project_id', projectIds).eq('role', 'worker')
    : { data: [] as Array<{ project_id: string }> }
  const workerProjectSet = new Set((workerMembers ?? []).map((member) => member.project_id))

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

  const activeProjectsCount = safeProjects.filter((project) => {
    const effectiveStatus =
      (project.status === 'pending' || project.status === 'on_hold') &&
      (profile.role !== 'customer' || workerProjectSet.has(project.id))
        ? 'active'
        : project.status
    return effectiveStatus === 'active'
  }).length
  const pendingCount = safeProjects.filter((project) => project.status === 'pending').length
  const isContractor = profile.role === 'contractor'
  const isCustomer = profile.role === 'customer'

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

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#F5F4EF' }}>
      <div className="mx-auto w-full max-w-md px-4 py-6">
        <section className="mb-4 rounded-[20px] bg-white p-5 shadow-sm">
          <h1 className="mb-2 text-[20px] leading-7 font-bold text-[#1C1917]">
            {getGreeting()}, {profile.name.split(' ')[0]} 👋
          </h1>
          <div className="inline-flex rounded-full bg-[#FFF4EE] px-3 py-1 text-[13px] font-semibold capitalize text-[#E8590C]">
            {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
          </div>
        </section>

        <section className="mb-5 grid grid-cols-2 gap-3">
          <div className="relative overflow-hidden rounded-[18px] bg-white p-4 shadow-sm">
            <p className="mb-2 text-[12px] font-medium text-[#78716C]">Active Projects</p>
            <p className="text-[32px] leading-8 font-extrabold text-[#E8590C]">{activeProjectsCount}</p>
            <div className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#FFF4EE] text-[16px]">
              🏗️
            </div>
          </div>
          <div className="relative overflow-hidden rounded-[18px] bg-white p-4 shadow-sm">
            <p className="mb-2 text-[12px] font-medium text-[#78716C]">
              {isContractor ? 'Pending Payments ₹' : 'Pending'}
            </p>
            <p className="text-[32px] leading-8 font-extrabold text-[#F59E0B]">
              {isContractor ? '₹0' : pendingCount}
            </p>
            <div className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#FFFBEB] text-[16px]">
              💰
            </div>
          </div>
        </section>

        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-[#1C1917]">Your Projects</h2>
            {isCustomer ? (
              <Link
                href="/projects/new"
                className="rounded-full border border-[#FDDCC4] bg-[#FFF4EE] px-3.5 py-1.5 text-[13px] font-bold text-[#E8590C]"
              >
                + New
              </Link>
            ) : null}
          </div>

          {profile.role === 'contractor' && (pendingInvitations?.length ?? 0) > 0 ? (
            <div className="mb-4 space-y-3">
              <h3 className="text-sm font-bold text-[#1C1917]">Pending Invitations</h3>
              {pendingInvitations?.map((invitation) => (
                <div key={invitation.id} className="rounded-[14px] bg-[#FEF3E2] p-4" style={{ borderLeft: '4px solid #E8590C' }}>
                  <div>
                    <p className="font-semibold text-[#1C1917]">{invitation.name}</p>
                    <p className="mt-0.5 text-xs text-[#7A6F66]">{invitation.city}</p>
                    <p className="mt-1 text-xs text-[#7A6F66]">
                      Customer: {pendingCustomerNameById.get(invitation.customer_id) ?? 'Customer'}
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-[#7A6F66]">Sent {daysAgoText(invitation.created_at)}</p>
                  <div className="mt-3 flex gap-2">
                    <InvitationActions projectId={invitation.id} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {safeProjects.length === 0 ? (
            <div className="rounded-[20px] bg-white py-12 text-center shadow-sm">
              <p className="mb-3 text-5xl">🏗️</p>
              <p className="mb-2 text-lg font-bold text-[#1C1917]">No projects yet</p>
              <p className="mx-auto max-w-[260px] text-sm leading-5 text-[#78716C]">
                {isCustomer ? 'Tap + New to create your first project' : 'You will see projects here once invited'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {safeProjects.map((project) => {
                const effectiveStatus =
                  (project.status === 'pending' || project.status === 'on_hold') &&
                  (profile.role !== 'customer' || workerProjectSet.has(project.id))
                    ? 'active'
                    : project.status
                const status = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.active
                const statusLabel =
                  effectiveStatus === 'pending' || effectiveStatus === 'on_hold'
                    ? awaitingLabel(project)
                    : status.label
                const hideStagePill = workerProjectSet.has(project.id)
                const stage = STAGE_COLORS[project.current_stage] ?? STAGE_COLORS.foundation
                const progress = stageProgress[project.current_stage] ?? 10

                return (
                  <Link
                    href={`/projects/${project.id}`}
                    key={project.id}
                    className="block rounded-[18px] bg-white p-4 shadow-sm"
                    style={{ borderLeft: `4px solid ${status.border}` }}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <h3 className="truncate text-base font-bold text-[#1C1917]">{project.name}</h3>
                      {!hideStagePill ? (
                        <span
                          className="rounded-full px-2.5 py-1 text-xs font-semibold capitalize"
                          style={{ backgroundColor: stage.bg, color: stage.text }}
                        >
                          {project.current_stage}
                        </span>
                      ) : null}
                    </div>

                    <p className="mb-3 text-[13px] text-[#78716C]">📍 {project.city}</p>

                    <div className="mb-2.5 h-[5px] overflow-hidden rounded bg-[#F5F5F4]">
                      <div className="h-[5px] rounded bg-[#E8590C]" style={{ width: `${progress}%` }} />
                    </div>

                    <div className="flex items-center justify-between">
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ backgroundColor: status.bg, color: status.text }}
                      >
                        {statusLabel}
                      </span>
                      <span className="text-[11px] text-[#A8A29E]">
                        {progress}% · {daysAgoText(latestUpdateByProject.get(project.id))}
                      </span>
                    </div>
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
