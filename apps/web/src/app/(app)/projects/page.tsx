import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BottomNav from '@/components/shared/bottom-nav'

const statusTabs = ['all', 'active', 'pending', 'completed'] as const
type StatusTab = (typeof statusTabs)[number]

const statusPillClass: Record<string, string> = {
  on_hold: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-700',
}

const statusLabel: Record<string, string> = {
  on_hold: 'Pending',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

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

function daysAgoText(dateValue?: string) {
  if (!dateValue) return 'No updates yet'
  const now = Date.now()
  const then = new Date(dateValue).getTime()
  const diffDays = Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)))
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('id,role').eq('id', user.id).maybeSingle()
  if (!profile) redirect('/register')

  const query = await searchParams
  const tab = statusTabs.includes((query.status ?? 'all') as StatusTab)
    ? ((query.status ?? 'all') as StatusTab)
    : 'all'

  let projects:
    | Array<{
        id: string
        name: string
        address: string
        city: string
        status: string
        current_stage: string
      }>
    = []

  if (profile.role === 'customer') {
    const response = await supabase
      .from('projects')
      .select('id,name,address,city,status,current_stage,created_at')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })
    const ownedProjects = (response.data ?? []) as typeof projects
    const projectIds = ownedProjects.map((project) => project.id)
    if (projectIds.length > 0) {
      const { data: ownedWithContractor } = await supabase
        .from('projects')
        .select('id,contractor_id')
        .in('id', projectIds)
      const contractorByProject = new Map((ownedWithContractor ?? []).map((p) => [p.id, p.contractor_id]))
      const { data: members } = await supabase
        .from('project_members')
        .select('project_id,user_id,role')
        .in('project_id', projectIds)
      const memberRows = (members ?? []) as Array<{ project_id: string; user_id: string; role: string | null }>
      projects = ownedProjects.filter((project) => {
        const contractorId = contractorByProject.get(project.id) ?? null
        if (contractorId) return memberRows.some((m) => m.project_id === project.id && m.user_id === contractorId)
        return memberRows.some((m) => m.project_id === project.id && m.role === 'worker')
      })
    } else {
      projects = []
    }
  } else if (profile.role === 'contractor') {
    const response = await supabase
      .from('projects')
      .select('id,name,address,city,status,current_stage,created_at')
      .eq('contractor_id', user.id)
      .order('created_at', { ascending: false })
    projects = (response.data ?? []) as typeof projects
  } else {
    const { data: memberships } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', user.id)
    const ids = Array.from(new Set((memberships ?? []).map((m) => m.project_id)))
    if (ids.length) {
      const response = await supabase
        .from('projects')
        .select('id,name,address,city,status,current_stage,created_at')
        .in('id', ids)
        .order('created_at', { ascending: false })
      projects = (response.data ?? []) as typeof projects
    }
  }

  const filteredProjects =
    tab === 'all'
      ? projects
      : tab === 'pending'
        ? projects.filter((project) => project.status === 'on_hold')
        : projects.filter((project) => project.status === tab)

  const ids = filteredProjects.map((project) => project.id)
  const { data: workerMembers } = ids.length
    ? await supabase.from('project_members').select('project_id').in('project_id', ids).eq('role', 'worker')
    : { data: [] as Array<{ project_id: string }> }
  const workerProjectSet = new Set((workerMembers ?? []).map((member) => member.project_id))
  const { data: updates } = ids.length
    ? await supabase
        .from('daily_updates')
        .select('project_id,created_at')
        .in('project_id', ids)
        .order('created_at', { ascending: false })
    : { data: [] as Array<{ project_id: string; created_at: string }> }
  const latestUpdateByProject = new Map<string, string>()
  for (const update of updates ?? []) {
    if (!latestUpdateByProject.has(update.project_id)) latestUpdateByProject.set(update.project_id, update.created_at)
  }

  const emptyMessage =
    tab === 'all'
      ? 'No projects yet. Start by creating one.'
      : tab === 'active'
        ? 'No active projects.'
        : tab === 'pending'
          ? 'No pending invitations.'
          : 'No completed projects yet.'

  const getStatusBarColor = (status: string) => {
    if (status === 'on_hold') return '#F59E0B'
    if (status === 'active') return '#10B981'
    if (status === 'completed') return '#6B7280'
    if (status === 'cancelled') return '#EF4444'
    return '#E0D5CC'
  }

  return (
    <div className="min-h-screen px-4 py-5 pb-28" style={{ backgroundColor: '#FAFAFA' }}>
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5">
          <h1 className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>
            My Projects
          </h1>
        </header>

        {/* Filter Tabs */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          {statusTabs.map((item) => {
            const active = tab === item
            return (
              <Link
                key={item}
                href={`/projects?status=${item}`}
                className="whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all"
                style={{
                  backgroundColor: active ? '#E8590C' : 'white',
                  color: active ? 'white' : '#7A6F66',
                  border: active ? 'none' : '2px solid #E0D5CC',
                }}
              >
                {item[0].toUpperCase() + item.slice(1)}
              </Link>
            )
          })}
        </div>

        {/* Project Cards or Empty State */}
        {filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg bg-white py-12 px-6" style={{ minHeight: '300px' }}>
            <svg
              className="h-16 w-16 mb-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              style={{ color: '#E0D5CC' }}
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <h2 className="text-lg font-bold text-center" style={{ color: '#1A1A1A' }}>
              {tab === 'all' ? 'No projects yet' : `No ${tab} projects`}
            </h2>
            <p className="mt-2 text-sm text-center" style={{ color: '#7A6F66' }}>
              {emptyMessage}
            </p>
            {tab === 'all' && profile.role === 'customer' ? (
              <Link
                href="/projects/new"
                className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#E8590C' }}
              >
                Create Your First Project
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProjects.map((project) => {
              const effectiveStatus =
                (project.status === 'pending' || project.status === 'on_hold') && profile.role !== 'customer'
                  ? 'active'
                  : project.status
              const progress = stageProgress[project.current_stage] ?? 0
              const statusBarColor = getStatusBarColor(effectiveStatus)
              const hideStagePill = workerProjectSet.has(project.id)
              return (
                <Link
                  href={`/projects/${project.id}`}
                  key={project.id}
                  className="block rounded-lg bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                  style={{
                    borderLeft: `4px solid ${statusBarColor}`,
                  }}
                >
                  <div className="p-4">
                    {/* Project Name */}
                    <h2 className="text-base font-bold" style={{ color: '#1A1A1A' }}>
                      {project.name}
                    </h2>

                    {/* Address with Icon */}
                    <div className="mt-2 flex items-center gap-1.5">
                      <svg
                        className="h-4 w-4 flex-shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        style={{ color: '#7A6F66' }}
                      >
                        <path d="M12 2C7.6 2 4 5.6 4 10c0 5.1 8 12 8 12s8-6.9 8-12c0-4.4-3.6-8-8-8z" />
                      </svg>
                      <p className="text-xs font-medium" style={{ color: '#7A6F66' }}>
                        {project.address}, {project.city}
                      </p>
                    </div>

                    {/* Stage Pill */}
                    {!hideStagePill ? (
                      <div className="mt-3 flex gap-2">
                        <span
                          className="rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{
                            backgroundColor: stagePillClass[project.current_stage]?.includes('bg-') 
                              ? '#FFF8F5' 
                              : '#E0D5CC',
                            color: '#E8590C',
                          }}
                        >
                          {project.current_stage.charAt(0).toUpperCase() + project.current_stage.slice(1)}
                        </span>
                      </div>
                    ) : null}

                    {/* Progress Bar */}
                    <div className="mt-4">
                      <div className="h-1 rounded-full" style={{ backgroundColor: '#E0D5CC' }}>
                        <div
                          className="h-1 rounded-full transition-all"
                          style={{ width: `${progress}%`, backgroundColor: '#E8590C' }}
                        />
                      </div>
                      <p className="mt-2 text-xs font-medium" style={{ color: '#7A6F66' }}>
                        {progress}% complete
                      </p>
                    </div>

                    {/* Bottom Row: Contractor/Customer and Time */}
                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-xs font-medium" style={{ color: '#1A1A1A' }}>
                        {profile.role === 'customer' ? 'Contractor:' : 'Customer:'}{' '}
                        <span style={{ color: '#7A6F66' }}>Assigned</span>
                      </p>
                      <p className="text-xs font-medium" style={{ color: '#999' }}>
                        {daysAgoText(latestUpdateByProject.get(project.id))}
                      </p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      {profile.role === 'customer' ? (
        <Link
          href="/projects/new"
          className="fixed right-6 bottom-28 z-30 flex h-14 w-14 items-center justify-center rounded-full text-2xl font-bold text-white transition-transform hover:scale-110 shadow-lg"
          style={{ backgroundColor: '#E8590C' }}
          aria-label="Create new project"
        >
          +
        </Link>
      ) : null}

      <BottomNav />
    </div>
  )
}
