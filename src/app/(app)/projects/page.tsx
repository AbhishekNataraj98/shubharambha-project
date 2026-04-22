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
    projects = (response.data ?? []) as typeof projects
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

  return (
    <div className="min-h-screen bg-white px-4 py-5 pb-24">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-4">
          <h1 className="text-xl font-semibold text-gray-900">Projects</h1>
        </header>

        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {statusTabs.map((item) => {
            const active = tab === item
            return (
              <Link
                key={item}
                href={`/projects?status=${item}`}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
                  active ? 'bg-orange-100 text-[#E8590C]' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {item[0].toUpperCase() + item.slice(1)}
              </Link>
            )
          })}
        </div>

        {filteredProjects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
            {emptyMessage}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProjects.map((project) => {
              const progress = stageProgress[project.current_stage] ?? 0
              return (
                <Link
                  href={`/projects/${project.id}`}
                  key={project.id}
                  className="block rounded-xl border border-gray-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-gray-900">{project.name}</h2>
                      <p className="mt-1 text-sm text-gray-500">
                        {project.address}, {project.city}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        statusPillClass[project.status] ?? 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {statusLabel[project.status] ?? project.status}
                    </span>
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
            })}
          </div>
        )}
      </div>

      {profile.role === 'customer' ? (
        <Link
          href="/projects/new"
          className="fixed right-5 bottom-20 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-[#E8590C] text-xl font-bold text-white shadow-lg"
          aria-label="Create project"
        >
          +
        </Link>
      ) : null}

      <BottomNav />
    </div>
  )
}
