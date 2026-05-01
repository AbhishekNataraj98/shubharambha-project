import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BottomNav from '@/components/shared/bottom-nav'

type TabFilter = 'all' | 'active' | 'pending' | 'completed'

const FILTERS: TabFilter[] = ['all', 'active', 'pending', 'completed']

type ProjectRow = {
  id: string
  name: string
  address: string
  city: string
  status: string
  current_stage: string
  customer_id: string
  contractor_id: string | null
  updated_at: string
  contractorName?: string
  workerName?: string
  customerName?: string
}

type MemberRow = { project_id: string; user_id: string; role: string | null }

const STAGE_PROGRESS: Record<string, number> = {
  foundation: 10,
  plinth: 25,
  walls: 45,
  slab: 60,
  plastering: 80,
  finishing: 100,
}

const STATUS_CONFIG: Record<string, { label: string }> = {
  pending: { label: 'Awaiting Contractor' },
  on_hold: { label: 'Awaiting Contractor' },
  active: { label: 'In Progress' },
  completed: { label: 'Completed' },
  cancelled: { label: 'Cancelled' },
}

function awaitingLabel(project: ProjectRow) {
  return project.contractor_id ? 'Waiting contractor approval' : 'Waiting worker approval'
}

type GradientStop = { from: string; mid: string; to: string }

const STAGE_GRADIENTS: Record<string, GradientStop> = {
  foundation: { from: '#4A3828', mid: '#6B4A30', to: '#8C6040' },
  plinth: { from: '#1A2744', mid: '#1E3A5F', to: '#2563EB' },
  walls: { from: '#3D2A10', mid: '#7C4A14', to: '#B45309' },
  slab: { from: '#2D1B4E', mid: '#4C2D7A', to: '#7C3AED' },
  plastering: { from: '#0D2A2A', mid: '#1A4A3A', to: '#0D9488' },
  finishing: { from: '#14291A', mid: '#1A4A28', to: '#16A34A' },
}

const DEFAULT_GRADIENT: GradientStop = {
  from: '#2C2C2A',
  mid: '#3D2A20',
  to: '#D85A30',
}

const STAGE_EMOJI: Record<string, string> = {
  foundation: '⛏️',
  plinth: '🏗️',
  walls: '🧱',
  slab: '🪨',
  plastering: '🖌️',
  finishing: '✨',
}

const STATUS_DOT: Record<string, string> = {
  active: '#10B981',
  pending: '#F59E0B',
  on_hold: '#F59E0B',
  completed: '#A8A29E',
  cancelled: '#EF4444',
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return '0 days ago'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

async function attachContractorNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectList: ProjectRow[]
): Promise<ProjectRow[]> {
  const contractorIds = Array.from(
    new Set(projectList.map((p) => p.contractor_id).filter(Boolean) as string[])
  )
  if (contractorIds.length === 0) return projectList
  const { data: contractorUsers } = await supabase.from('users').select('id,name').in('id', contractorIds)
  const rows = (contractorUsers ?? []) as Array<{ id: string; name: string }>
  const nameById = new Map(rows.map((u) => [u.id, u.name]))
  return projectList.map((p) => ({
    ...p,
    contractorName: p.contractor_id ? (nameById.get(p.contractor_id) ?? undefined) : undefined,
  }))
}

async function attachWorkerNamesWhenNoContractor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectList: ProjectRow[],
  memberRows: MemberRow[]
): Promise<ProjectRow[]> {
  const needsWorker = new Set(projectList.filter((p) => !p.contractor_id).map((p) => p.id))
  const workerIdByProject = new Map<string, string>()
  for (const row of memberRows) {
    if (row.role !== 'worker' || !needsWorker.has(row.project_id)) continue
    if (!workerIdByProject.has(row.project_id)) workerIdByProject.set(row.project_id, row.user_id)
  }
  const workerIds = Array.from(new Set(workerIdByProject.values()))
  if (workerIds.length === 0) return projectList
  const { data: workerUsers } = await supabase.from('users').select('id,name').in('id', workerIds)
  const nameById = new Map((workerUsers ?? []).map((u) => [u.id as string, u.name as string]))
  return projectList.map((p) => {
    if (p.contractor_id) return p
    const wid = workerIdByProject.get(p.id)
    const workerName = wid ? nameById.get(wid) : undefined
    return workerName ? { ...p, workerName } : p
  })
}

async function attachCustomerNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectList: ProjectRow[]
): Promise<ProjectRow[]> {
  const customerIds = Array.from(new Set(projectList.map((p) => p.customer_id).filter(Boolean)))
  if (customerIds.length === 0) return projectList
  const { data: customerUsers } = await supabase.from('users').select('id,name').in('id', customerIds)
  const rows = (customerUsers ?? []) as Array<{ id: string; name: string }>
  const nameById = new Map(rows.map((u) => [u.id, u.name]))
  return projectList.map((p) => ({
    ...p,
    customerName: nameById.get(p.customer_id) ?? undefined,
  }))
}

function titleRowParty(item: ProjectRow, isCustomer: boolean): { emoji: string; name: string } | null {
  if (isCustomer) {
    if (item.contractorName) return { emoji: '👷', name: item.contractorName }
    if (item.workerName) return { emoji: '🛠️', name: item.workerName }
    return null
  }
  if (item.customerName) return { emoji: '👤', name: item.customerName }
  return null
}

function effectiveStatusForProject(
  project: ProjectRow,
  isCustomer: boolean,
  projectHasAcceptedProfessional: Map<string, boolean>
): string {
  return (project.status === 'pending' || project.status === 'on_hold') &&
    (!isCustomer || projectHasAcceptedProfessional.get(project.id) === true)
    ? 'active'
    : project.status
}

function filterMatchesTab(
  project: ProjectRow,
  tab: TabFilter,
  isCustomer: boolean,
  projectHasAcceptedProfessional: Map<string, boolean>
): boolean {
  if (tab === 'all') return true
  const eff = effectiveStatusForProject(project, isCustomer, projectHasAcceptedProfessional)
  if (tab === 'pending') return eff === 'pending' || eff === 'on_hold'
  return eff === tab
}

function ProjectHeroCard({
  project,
  isCustomer,
  projectHasAcceptedProfessional,
}: {
  project: ProjectRow
  isCustomer: boolean
  projectHasAcceptedProfessional: Map<string, boolean>
}) {
  const effectiveStatus = effectiveStatusForProject(project, isCustomer, projectHasAcceptedProfessional)
  const statusCfg = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.active
  const statusLabel =
    effectiveStatus === 'pending' || effectiveStatus === 'on_hold' ? awaitingLabel(project) : statusCfg.label

  const progress = STAGE_PROGRESS[project.current_stage] ?? 10
  const grad = STAGE_GRADIENTS[project.current_stage] ?? DEFAULT_GRADIENT
  const stageLabel = project.current_stage.charAt(0).toUpperCase() + project.current_stage.slice(1)
  const stageEmoji = STAGE_EMOJI[project.current_stage] ?? '🏗️'
  const dotColor = STATUS_DOT[effectiveStatus] ?? '#A8A29E'
  const party = titleRowParty(project, isCustomer)

  const gradientCss = `linear-gradient(135deg, ${grad.from} 0%, ${grad.mid} 50%, ${grad.to} 100%)`

  return (
    <Link
      href={`/projects/${project.id}`}
      className="mb-3 block h-[158px] overflow-hidden rounded-[20px] shadow-[0_4px_12px_rgba(0,0,0,0.18)] transition-transform hover:scale-[1.01] active:opacity-90"
    >
      <div className="relative h-full w-full" style={{ background: gradientCss }}>
        <div className="pointer-events-none absolute inset-0 bg-black/[0.28]" />
        <div className="relative z-10 flex h-full flex-col p-3.5">
          <div className="mb-auto flex justify-end">
            <span
              className="inline-flex items-center gap-1 rounded-full border border-white/30 px-2.5 py-1 text-[10px] font-bold text-white"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
            >
              <span>{stageEmoji}</span>
              {stageLabel}
            </span>
          </div>

          <div className="mt-auto flex min-h-0 flex-col">
            <div className="mb-0.5 flex min-w-0 items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate text-lg font-extrabold tracking-tight text-white">{project.name}</h2>
              {party ? (
                <span className="max-w-[152px] shrink-0 truncate text-right text-[11px] font-bold text-white/95">
                  {party.emoji} {party.name}
                </span>
              ) : null}
            </div>

            <p className="mb-2.5 text-[11px] text-white/70">📍 {project.city}</p>

            <div className="mb-2.5 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-sm bg-white/20">
                <div className="h-full rounded-sm bg-white" style={{ width: `${progress}%` }} />
              </div>
              <span className="min-w-[32px] text-[11px] font-bold text-white/90">{progress}%</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold text-white"
                style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
                {statusLabel}
              </span>
              <span className="text-[10px] text-white/60">{relativeTime(project.updated_at)}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
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
  const tab = FILTERS.includes((query.status ?? 'all') as TabFilter)
    ? ((query.status ?? 'all') as TabFilter)
    : 'all'

  const isCustomer = profile.role === 'customer'

  let projects: ProjectRow[] = []
  let memberRows: MemberRow[] = []

  if (profile.role === 'customer') {
    const { data: owned } = await supabase
      .from('projects')
      .select('id,name,address,city,status,current_stage,customer_id,contractor_id,updated_at')
      .eq('customer_id', user.id)
      .order('updated_at', { ascending: false })
    const ownedProjects = (owned ?? []) as ProjectRow[]
    const projectIds = ownedProjects.map((p) => p.id)
    let approvedProjects = ownedProjects
    if (projectIds.length > 0) {
      const { data: members } = await supabase
        .from('project_members')
        .select('project_id,user_id,role')
        .in('project_id', projectIds)
      memberRows = (members ?? []) as MemberRow[]
      const acceptedProfessionalMap = new Map<string, boolean>()
      for (const member of memberRows) {
        if (member.user_id !== user.id && (member.role === 'worker' || member.role === 'contractor')) {
          acceptedProfessionalMap.set(member.project_id, true)
        }
      }
      approvedProjects = ownedProjects.filter((project) => {
        if (project.contractor_id) {
          return memberRows.some((m) => m.project_id === project.id && m.user_id === project.contractor_id)
        }
        return memberRows.some((m) => m.project_id === project.id && m.role === 'worker')
      })
      projects = await attachContractorNames(supabase, approvedProjects)
      projects = await attachWorkerNamesWhenNoContractor(supabase, projects, memberRows)
    } else {
      projects = []
    }
  } else if (profile.role === 'contractor') {
    const { data: proj } = await supabase
      .from('projects')
      .select('id,name,address,city,status,current_stage,customer_id,contractor_id,updated_at')
      .eq('contractor_id', user.id)
      .in('status', ['active', 'completed'])
      .order('updated_at', { ascending: false })
    const contractorProjects = (proj ?? []) as ProjectRow[]
    projects = await attachCustomerNames(supabase, contractorProjects)
  } else {
    const { data: mem } = await supabase.from('project_members').select('project_id').eq('user_id', user.id)
    const ids = Array.from(new Set((mem ?? []).map((m) => m.project_id)))
    if (ids.length) {
      const { data: proj } = await supabase
        .from('projects')
        .select('id,name,address,city,status,current_stage,customer_id,contractor_id,updated_at')
        .in('id', ids)
        .order('updated_at', { ascending: false })
      const workerProjects = (proj ?? []) as ProjectRow[]
      projects = await attachCustomerNames(supabase, workerProjects)
    }
  }

  const projectHasAcceptedProfessional = new Map<string, boolean>()
  if (profile.role === 'customer' && memberRows.length > 0) {
    for (const member of memberRows) {
      if (member.user_id !== user.id && (member.role === 'worker' || member.role === 'contractor')) {
        projectHasAcceptedProfessional.set(member.project_id, true)
      }
    }
  } else if (!isCustomer && projects.length > 0) {
    for (const p of projects) projectHasAcceptedProfessional.set(p.id, true)
  }

  const filteredProjects = projects.filter((p) =>
    filterMatchesTab(p, tab, isCustomer, projectHasAcceptedProfessional)
  )

  const countForTab = (item: TabFilter) =>
    projects.filter((p) => filterMatchesTab(p, item, isCustomer, projectHasAcceptedProfessional)).length

  return (
    <div className="min-h-screen px-3.5 pb-28 pt-3.5" style={{ backgroundColor: '#F2EDE8' }}>
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-3.5">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h1 className="text-[26px] font-extrabold tracking-tight" style={{ color: '#2C2C2A' }}>
                My Projects
              </h1>
              <p className="mt-0.5 text-xs" style={{ color: '#A8A29E' }}>
                {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="-mx-0.5 flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
            {FILTERS.map((item) => {
              const active = tab === item
              const count = countForTab(item)
              const href = `/projects?status=${item}`
              return (
                <Link
                  key={item}
                  href={href}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition-colors"
                  style={{
                    backgroundColor: active ? '#2C2C2A' : '#FFFFFF',
                    borderColor: active ? '#2C2C2A' : '#E8DDD4',
                    color: active ? '#FFFFFF' : '#78716C',
                  }}
                >
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                  {count > 0 ? (
                    <span
                      className="min-w-[18px] rounded-[10px] px-1 py-px text-center text-[9px] font-bold"
                      style={{
                        backgroundColor: active ? '#D85A30' : '#F2EDE8',
                        color: active ? '#FFFFFF' : '#78716C',
                      }}
                    >
                      {count}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </div>
        </header>

        {filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center px-8 py-14">
            <div
              className="mb-3.5 flex h-[72px] w-[72px] items-center justify-center rounded-full text-[32px]"
              style={{
                background: 'linear-gradient(135deg, #2C2C2A 0%, #3D2A20 50%, #D85A30 100%)',
              }}
            >
              🏗️
            </div>
            <h2 className="mb-2 text-lg font-extrabold" style={{ color: '#2C2C2A' }}>
              No projects yet
            </h2>
            <p className="text-center text-[13px] leading-5" style={{ color: '#78716C' }}>
              {isCustomer ? 'Tap + to create your first project' : 'You will see projects here once invited'}
            </p>
            {tab === 'all' && isCustomer ? (
              <Link
                href="/projects/new"
                className="mt-4 rounded-xl px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#D85A30' }}
              >
                Create project
              </Link>
            ) : null}
          </div>
        ) : (
          <div>
            {filteredProjects.map((project) => (
              <ProjectHeroCard
                key={project.id}
                project={project}
                isCustomer={isCustomer}
                projectHasAcceptedProfessional={projectHasAcceptedProfessional}
              />
            ))}
          </div>
        )}
      </div>

      {isCustomer ? (
        <Link
          href="/projects/new"
          className="fixed bottom-28 right-5 z-30 flex h-[58px] w-[58px] items-center justify-center rounded-full text-[30px] font-light leading-none text-white shadow-[0_4px_12px_rgba(216,90,48,0.45)] transition-transform hover:scale-105"
          style={{ backgroundColor: '#D85A30' }}
          aria-label="Create new project"
        >
          <span className="-mt-0.5">+</span>
        </Link>
      ) : null}

      <BottomNav />
    </div>
  )
}
