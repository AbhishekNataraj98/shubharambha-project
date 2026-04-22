import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import ReinviteContractorButton from '@/components/shared/reinvite-contractor-button'

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

  return (
    <div className="min-h-screen bg-white px-4 py-5">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5 flex items-center gap-3">
          <Link href="/dashboard" className="rounded-full p-2 hover:bg-gray-100" aria-label="Back to dashboard">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">Project Details</h1>
        </header>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-gray-900">{project.name}</h2>
          <p className="mt-1 text-sm text-gray-600">{project.address}</p>
          <p className="text-sm text-gray-600">{project.city}</p>
          <p className="mt-3 text-sm text-gray-700">
            Status: <span className="font-medium">{project.status}</span>
          </p>
          <p className="text-sm text-gray-700">
            Stage: <span className="font-medium">{project.current_stage}</span>
          </p>
          <p className="mt-3 text-sm text-gray-700">
            Customer: <span className="font-medium">{customer?.name ?? 'Unknown'}</span>
          </p>
          <p className="text-sm text-gray-700">
            Contractor: <span className="font-medium">{contractor?.name ?? 'Not assigned'}</span>
          </p>
        </div>

        {isCustomer && project.status === 'cancelled' ? (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
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
      </div>
    </div>
  )
}
