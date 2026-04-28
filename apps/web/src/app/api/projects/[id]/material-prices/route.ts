import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const bodySchema = z.object({
  cement_rate: z.number().positive().optional(),
  steel_rate: z.number().positive().optional(),
})

async function hasAccess(projectId: string, userId: string) {
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
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params
  const allowed = await hasAccess(projectId, user.id)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('material_price_updates')
    .select('*')
    .eq('project_id', projectId)
    .order('recorded_at', { ascending: false })
    .limit(10)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ prices: data ?? [] })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params
  const allowed = await hasAccess(projectId, user.id)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 })
  }
  if (typeof parsed.data.cement_rate !== 'number' && typeof parsed.data.steel_rate !== 'number') {
    return NextResponse.json({ error: 'Provide at least one rate' }, { status: 400 })
  }

  const { error } = await supabase.from('material_price_updates').insert({
    project_id: projectId,
    cement_rate: parsed.data.cement_rate ?? null,
    steel_rate: parsed.data.steel_rate ?? null,
    recorded_by: user.id,
    recorded_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
