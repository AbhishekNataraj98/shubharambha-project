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

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { id } = await params

  const { data: project } = await supabase
    .from('projects')
    .select('id,name,address,city,status,current_stage,customer_id,contractor_id')
    .eq('id', id)
    .maybeSingle()

  if (!project) redirect('/dashboard')

  const isCustomer = project.customer_id === user.id
  const isContractor = project.contractor_id === user.id
  if (!isCustomer && !isContractor) {
    const { data: membership } = await supabase
      .from('project_members')
      .select('id')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!membership) redirect('/dashboard')
  }

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const relatedUserIds = [project.customer_id, project.contractor_id].filter(Boolean) as string[]
  const { data: relatedUsers } = relatedUserIds.length
    ? await admin.from('users').select('id,name,pincode').in('id', relatedUserIds)
    : { data: [] as Array<{ id: string; name: string; pincode: string }> }
  const userMap = new Map((relatedUsers ?? []).map((entry) => [entry.id, entry]))
  const customer = userMap.get(project.customer_id)
  const contractor = project.contractor_id ? userMap.get(project.contractor_id) : null
  const currentUserName =
    userMap.get(user.id)?.name ??
    (
      await admin
        .from('users')
        .select('name')
        .eq('id', user.id)
        .maybeSingle()
    ).data?.name ??
    'You'
  const currentUserRole =
    (
      await admin
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
    ).data?.role ?? 'customer'
  const contractorName = contractor?.name ?? 'Contractor'

  const currentStageIndex = stageOrder.indexOf(project.current_stage as (typeof stageOrder)[number])

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
        <section className="relative mx-4 mt-4 rounded-xl border border-gray-100 border-l-4 border-l-orange-500 bg-white p-4">
          <span
            className={`absolute top-3 right-3 rounded-full px-2.5 py-1 text-xs font-semibold ${
              statusBadgeClass[project.status] ?? 'bg-gray-100 text-gray-700'
            }`}
          >
            {statusBadgeLabel[project.status] ?? project.status}
          </span>

          <h2 className="pr-20 text-lg font-bold text-gray-900">{project.name}</h2>
          <div className="mt-1 flex items-start gap-1.5">
            <MapPin className="mt-0.5 h-[14px] w-[14px] text-orange-500" />
            <p className="text-sm text-gray-500">
              {project.address}, {project.city}
            </p>
          </div>

          <div className="mt-3 flex items-start gap-4">
            <div className="text-center">
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                {initials(customer?.name ?? 'Customer')}
              </div>
              <p className="mt-1 text-[11px] text-gray-500">Customer</p>
            </div>
            <div className="text-center">
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-[#E8590C]">
                {initials(contractor?.name ?? 'Contractor')}
              </div>
              <p className="mt-1 text-[11px] text-gray-500">Contractor</p>
            </div>
          </div>
        </section>

        <section className="mx-4 mt-3 rounded-xl border border-gray-100 bg-white p-4">
          <div className="flex items-start justify-between gap-1">
            {stageOrder.map((stage, index) => {
              const completed = index < currentStageIndex
              const current = index === currentStageIndex
              return (
                <div key={stage} className="flex min-w-0 flex-1 items-start">
                  <div className="flex min-w-0 flex-1 flex-col items-center">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full ${
                        completed
                          ? 'bg-orange-500 text-white'
                          : current
                            ? 'ring-offset-background bg-orange-500 text-white ring-2 ring-orange-200 ring-offset-2'
                            : 'border-2 border-gray-200 bg-white text-gray-400'
                      }`}
                    >
                      {completed ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : current ? (
                        <div className="h-2 w-2 rounded-full bg-white" />
                      ) : null}
                    </div>
                    <p
                      className={`mt-1 truncate text-[10px] ${
                        completed || current ? 'font-medium text-orange-600' : 'text-gray-400'
                      }`}
                    >
                      {stageLabels[stage]}
                    </p>
                  </div>
                  {index < stageOrder.length - 1 ? (
                    <div className={`mt-3 h-0.5 flex-1 ${index < currentStageIndex ? 'bg-orange-500' : 'bg-gray-200'}`} />
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>

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
        />
      </div>
    </div>
  )
}
