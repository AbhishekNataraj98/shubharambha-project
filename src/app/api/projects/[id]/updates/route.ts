import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

type UpdateResponseItem = {
  id: string
  projectId: string
  postedBy: string
  posterName: string
  description: string
  stageTag: string
  photoUrls: string[]
  materialsUsed: string | null
  createdAt: string
}

async function hasProjectAccess(projectId: string, userId: string) {
  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id,customer_id,contractor_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return false
  if (project.customer_id === userId || project.contractor_id === userId) return true

  const { data: member } = await supabase
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(member)
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params
  const allowed = await hasProjectAccess(projectId, user.id)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const updateId = url.searchParams.get('updateId')

  const { data: updatesWithMaterials, error: withMaterialsError } = await supabase
    .from('daily_updates')
    .select('id,project_id,posted_by,description,stage_tag,photo_urls,created_at,materials_used')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  const updates =
    !withMaterialsError && updatesWithMaterials
      ? updatesWithMaterials
      : (
          await supabase
            .from('daily_updates')
            .select('id,project_id,posted_by,description,stage_tag,photo_urls,created_at')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false })
        ).data

  if (!updates) {
    const message = withMaterialsError?.message ?? 'Failed to load updates'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const filtered = updateId ? updates.filter((item) => item.id === updateId) : updates
  const posterIds = Array.from(new Set(filtered.map((item) => item.posted_by)))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  const admin =
    supabaseUrl && serviceRole
      ? createAdminClient(supabaseUrl, serviceRole)
      : null
  const { data: posters } = posterIds.length
    ? admin
      ? await admin.from('users').select('id,name').in('id', posterIds)
      : await supabase.from('users').select('id,name').in('id', posterIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const posterNameMap = new Map((posters ?? []).map((item) => [item.id, item.name]))

  const mapped: UpdateResponseItem[] = filtered.map((item) => ({
    id: item.id,
    projectId: item.project_id,
    postedBy: item.posted_by,
    posterName: posterNameMap.get(item.posted_by) ?? 'User',
    description: item.description,
    stageTag: item.stage_tag,
    photoUrls: item.photo_urls ?? [],
    materialsUsed:
      'materials_used' in item && typeof item.materials_used === 'string'
        ? item.materials_used
        : null,
    createdAt: item.created_at,
  }))

  if (updateId) {
    return NextResponse.json({ update: mapped[0] ?? null })
  }
  return NextResponse.json({ updates: mapped })
}
