import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

function isGenericRoleName(name: string | null | undefined) {
  if (!name) return true
  const normalized = name.trim().toLowerCase()
  return normalized === 'worker' || normalized === 'contractor' || normalized === 'professional'
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params
  const { data: project } = await supabase
    .from('projects')
    .select('id,customer_id,contractor_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  const hasAccess = project.customer_id === user.id || project.contractor_id === user.id || Boolean(membership)
  if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server is missing Supabase admin credentials' }, { status: 500 })
  }
  const admin = createAdminClient<Database>(supabaseUrl, serviceRoleKey)

  const { data: members } = await admin
    .from('project_members')
    .select('user_id,role')
    .eq('project_id', projectId)
  const candidateMembers = (members ?? []).filter(
    (m) => m.user_id !== project.customer_id && (m.role === 'worker' || m.role === 'contractor')
  )
  const candidateIds = Array.from(
    new Set([...candidateMembers.map((m) => m.user_id), project.contractor_id].filter(Boolean))
  ) as string[]

  const { data: candidateUsers = [] } = candidateIds.length
    ? await admin.from('users').select('id,name').in('id', candidateIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const userNameById = new Map(candidateUsers.map((entry) => [entry.id, entry.name]))

  const rank = (role: 'worker' | 'contractor', name: string | null | undefined) => {
    // Prefer worker over contractor; prefer non-generic names over placeholder role names.
    const roleRank = role === 'worker' ? 0 : 2
    const nameRank = isGenericRoleName(name) ? 1 : 0
    return roleRank + nameRank
  }

  const sortedCandidates = candidateMembers
    .map((member) => ({
      id: member.user_id,
      role: member.role as 'worker' | 'contractor',
      name: userNameById.get(member.user_id) ?? null,
      score: rank(member.role as 'worker' | 'contractor', userNameById.get(member.user_id)),
    }))
    .sort((a, b) => a.score - b.score)

  const bestMember = sortedCandidates[0]
  const professionalId = bestMember?.id ?? project.contractor_id ?? null
  const professionalRole = bestMember?.role ?? (project.contractor_id ? 'contractor' : null)

  if (!professionalId) return NextResponse.json({ professional: null })

  const professionalName =
    userNameById.get(professionalId) ??
    (
      await admin
        .from('users')
        .select('id,name')
        .eq('id', professionalId)
        .maybeSingle()
    ).data?.name ??
    null

  return NextResponse.json({
    professional: {
      id: professionalId,
      role: professionalRole,
      name: professionalName,
    },
  })
}
