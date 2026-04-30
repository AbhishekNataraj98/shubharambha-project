import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const upsertSchema = z.object({
  rows: z.array(
    z.object({
      stageKey: z.string().trim().min(1),
      floorIndex: z.number().int().min(0),
      stageLabel: z.string().trim().min(1),
      actualCost: z.number().min(0),
    })
  ),
})

async function getProjectAndMembership(projectId: string, userId: string) {
  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id,customer_id,contractor_id,name')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return { allowed: false as const, project: null }
  if (project.customer_id === userId || project.contractor_id === userId) {
    return { allowed: true as const, project }
  }
  const { data: member } = await supabase
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  return { allowed: Boolean(member), project }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params
  const access = await getProjectAndMembership(projectId, user.id)
  if (!access.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: rows, error } = await supabase
    .from('project_overview_actual_costs')
    .select('stage_key,floor_index,stage_label,actual_cost,updated_at')
    .eq('project_id', projectId)
    .order('floor_index', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({
    project: {
      id: access.project?.id,
      name: access.project?.name ?? 'Project',
    },
    rows: (rows ?? []).map((row) => ({
      stageKey: row.stage_key,
      floorIndex: row.floor_index,
      stageLabel: row.stage_label,
      actualCost: Number(row.actual_cost ?? 0),
      updatedAt: row.updated_at,
    })),
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params
  const access = await getProjectAndMembership(projectId, user.id)
  if (!access.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = upsertSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 })
  }

  if (parsed.data.rows.length === 0) return NextResponse.json({ success: true })

  const payload = parsed.data.rows.map((row) => ({
    project_id: projectId,
    stage_key: row.stageKey,
    floor_index: row.floorIndex,
    stage_label: row.stageLabel,
    actual_cost: row.actualCost,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('project_overview_actual_costs')
    .upsert(payload, { onConflict: 'project_id,stage_key,floor_index' })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
