import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Check, ChevronLeft, MapPin, MoreVertical } from 'lucide-react'
import type { Database } from '@/types/supabase'
import ReinviteContractorButton from '@/components/shared/reinvite-contractor-button'
import ProjectDetailTabs from '@/components/shared/project-detail-tabs'
import NotificationBell from '@/components/shared/NotificationBell'

const stageOrder = [
  'foundation',
  'plinth',
  'walls',
  'slab',
  'plastering',
  'finishing',
] as const

const stageLabels: Record<(typeof stageOrder)[number], string> = {
  foundation: 'Foundation',
  plinth: 'Plinth',
  walls: 'Walls',
  slab: 'Slab',
  plastering: 'Plastering',
  finishing: 'Finishing',
}

const statusBadgeClass: Record<string, string> = {
  on_hold: 'bg-yellow-100 text-yellow-800',
  pending: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-700',
}

const statusBadgeLabel: Record<string, string> = {
  on_hold: 'Awaiting contractor',
  pending: 'Awaiting contractor',
  active: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

function awaitingLabel(project: { contractor_id: string | null }) {
  return project.contractor_id ? 'Waiting contractor approval' : 'Waiting worker approval'
}

function isGenericRoleName(name: string | null | undefined) {
  if (!name) return true
  const normalized = name.trim().toLowerCase()
  return normalized === 'worker' || normalized === 'contractor' || normalized === 'professional'
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ workerDetails?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { id } = await params
  const query = await searchParams
  const workerDetails = query.workerDetails === '1'

  const { data: project } = await supabase
    .from('projects')
    .select('id,name,address,city,status,current_stage,customer_id,contractor_id')
    .eq('id', id)
    .maybeSingle()

  if (!project) redirect('/dashboard')

  const { data: membersForProject } = await supabase
    .from('project_members')
    .select('user_id,role')
    .eq('project_id', project.id)

  const isCustomer = project.customer_id === user.id
  const isContractor = project.contractor_id === user.id
  if (!isCustomer && !isContractor) {
    const isMember = (membersForProject ?? []).some((member) => member.user_id === user.id)
    if (!isMember) redirect('/dashboard')
  }

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const memberProfessionalIds = (membersForProject ?? [])
    .filter((member) => member.role === 'worker' || member.role === 'contractor')
    .map((member) => member.user_id)
  const relatedUserIds = Array.from(
    new Set([project.customer_id, project.contractor_id, user.id, ...memberProfessionalIds].filter(Boolean))
  ) as string[]
  const { data: relatedUsers } = relatedUserIds.length
    ? await admin.from('users').select('id,name,pincode,role').in('id', relatedUserIds)
    : { data: [] as Array<{ id: string; name: string; pincode: string; role: string }> }
  const userMap = new Map((relatedUsers ?? []).map((entry) => [entry.id, entry]))
  const contractor = project.contractor_id ? userMap.get(project.contractor_id) : null
  const currentUserName = userMap.get(user.id)?.name ?? 'You'
  const currentUserRole = userMap.get(user.id)?.role ?? 'customer'
  const contractorName = contractor?.name ?? 'Contractor'
  const candidateMembers = (membersForProject ?? []).filter(
    (member) => member.user_id !== project.customer_id && (member.role === 'worker' || member.role === 'contractor')
  )
  const rankedCandidates = candidateMembers
    .map((member) => {
      const role = member.role as 'worker' | 'contractor'
      const name = userMap.get(member.user_id)?.name ?? null
      const score = (role === 'worker' ? 0 : 2) + (isGenericRoleName(name) ? 1 : 0)
      return { id: member.user_id, role, name, score }
    })
    .sort((a, b) => a.score - b.score)
  const bestProfessional = rankedCandidates[0] ?? null
  const preferredProfessionalId = bestProfessional?.id ?? project.contractor_id ?? null
  const preferredProfessionalRole = bestProfessional?.role ?? (project.contractor_id ? 'contractor' : null)
  const preferredProfessionalName = bestProfessional?.name ?? (preferredProfessionalId ? userMap.get(preferredProfessionalId)?.name ?? null : null)
  const resolvedProfessionalName = preferredProfessionalId
    ? (
        await admin
          .from('users')
          .select('name')
          .eq('id', preferredProfessionalId)
          .maybeSingle()
      ).data?.name ?? preferredProfessionalName
    : preferredProfessionalName

  const currentStageIndex = stageOrder.indexOf(project.current_stage as (typeof stageOrder)[number])
  const workerInviteProject = (membersForProject ?? []).some(
    (member) => member.user_id !== project.customer_id && member.role === 'worker'
  )
  const hasAcceptedProfessional = (membersForProject ?? []).some(
    (member) => member.user_id !== project.customer_id && (member.role === 'worker' || member.role === 'contractor')
  )
  const effectiveProjectStatus =
    (project.status === 'pending' || project.status === 'on_hold') &&
    (currentUserRole !== 'customer' || hasAcceptedProfessional)
      ? 'active'
      : project.status

  return (
    <div className="min-h-screen bg-[#FAFAFA] pb-24">
      <header className="sticky top-0 z-30 bg-white shadow-sm">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <Link href="/projects" className="rounded-full p-2 hover:bg-gray-100" aria-label="Back to projects">
            <ChevronLeft className="h-5 w-5 text-gray-700" />
          </Link>
          <h1 className="truncate text-center text-base font-bold text-gray-900">{project.name}</h1>
          <div className="flex items-center gap-1">
            <NotificationBell userId={user.id} />
            <button type="button" className="rounded-full p-2 text-gray-500" aria-label="More actions">
              <MoreVertical className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-md">
        <section className="relative mx-4 mt-3 rounded-xl border border-gray-100 border-l-4 border-l-orange-500 bg-white p-3">
          <span
            className={`absolute top-2.5 right-2.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              statusBadgeClass[effectiveProjectStatus] ?? 'bg-gray-100 text-gray-700'
            }`}
          >
            {(effectiveProjectStatus === 'pending' || effectiveProjectStatus === 'on_hold'
              ? awaitingLabel(project)
              : statusBadgeLabel[effectiveProjectStatus]) ?? effectiveProjectStatus}
          </span>

          <h2 className="pr-20 text-base font-bold text-gray-900">{project.name}</h2>
          <div className="mt-1 flex items-start gap-1">
            <MapPin className="mt-0.5 h-3.5 w-3.5 text-orange-500" />
            <p className="text-xs text-gray-500">
              {project.address}, {project.city}
            </p>
          </div>

          {isCustomer && preferredProfessionalId ? (
            <Link
              prefetch={false}
              href={`/contractors/${preferredProfessionalId}?projectId=${project.id}`}
              className="mt-2.5 inline-flex rounded-md bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-600"
            >
              {preferredProfessionalRole === 'worker' ? 'Worker' : 'Contractor'}:{' '}
              {resolvedProfessionalName ?? 'View profile'} (Profile & Review)
            </Link>
          ) : null}
          <Link
            href={`/projects/${project.id}/images`}
            className="mt-2.5 inline-flex rounded-md bg-[#E8590C] px-3 py-2 text-xs font-bold text-white hover:bg-orange-600"
          >
            View Project Images
          </Link>
        </section>

        {!workerDetails && !workerInviteProject ? (
          <section className="mx-4 mt-2.5 rounded-xl border border-gray-100 bg-white p-3">
          <div className="flex items-start justify-between gap-1">
            {stageOrder.map((stage, index) => {
              const completed = index < currentStageIndex
              const current = index === currentStageIndex
              return (
                <div key={stage} className="flex min-w-0 flex-1 items-start">
                  <div className="flex min-w-0 flex-1 flex-col items-center">
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full ${
                        completed
                          ? 'bg-orange-500 text-white'
                          : current
                            ? 'ring-offset-background bg-orange-500 text-white ring-2 ring-orange-200 ring-offset-2'
                            : 'border-2 border-gray-200 bg-white text-gray-400'
                      }`}
                    >
                      {completed ? (
                        <Check className="h-3 w-3" />
                      ) : current ? (
                        <div className="h-1.5 w-1.5 rounded-full bg-white" />
                      ) : null}
                    </div>
                    <p
                      className={`mt-1 truncate text-[9px] ${
                        completed || current ? 'font-medium text-orange-600' : 'text-gray-400'
                      }`}
                    >
                      {stageLabels[stage]}
                    </p>
                  </div>
                  {index < stageOrder.length - 1 ? (
                    <div className={`mt-2.5 h-0.5 flex-1 ${index < currentStageIndex ? 'bg-orange-500' : 'bg-gray-200'}`} />
                  ) : null}
                </div>
              )
            })}
          </div>
          </section>
        ) : null}

        {isCustomer && project.status === 'cancelled' ? (
          <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="mb-3 text-sm text-amber-800">
              This invitation was declined. You can invite a different contractor for the same project.
            </p>
            <ReinviteContractorButton
              projectId={project.id}
              projectName={project.name}
              address={project.address}
              city={project.city}
              pincode={customer?.pincode ?? '000000'}
            />
          </div>
        ) : null}

        <ProjectDetailTabs
          projectId={project.id}
          currentUserId={user.id}
          currentUserName={currentUserName}
          currentUserRole={currentUserRole}
          contractorName={contractorName}
          contractorId={project.contractor_id}
          customerId={project.customer_id}
          hideReportsTab={workerDetails || workerInviteProject}
        />
      </div>
    </div>
  )
}
