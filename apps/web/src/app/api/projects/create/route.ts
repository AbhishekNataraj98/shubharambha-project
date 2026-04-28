import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { TablesInsert } from '@/types/supabase'

const createProjectSchema = z.object({
  project_name: z.string().trim().min(2),
  address: z.string().trim().min(5),
  city: z.string().trim().min(2),
  pincode: z.string().trim().regex(/^\d{6}$/),
  project_type: z.string().trim().optional(),
  estimated_budget: z.number().positive().optional(),
  start_date: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim()
      return trimmed ? trimmed : undefined
    }),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!me || me.role !== 'customer') {
    return NextResponse.json({ error: 'Only customers can create projects' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = createProjectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid project details' },
      { status: 400 }
    )
  }

  const projectInsert: TablesInsert<'projects'> = {
    customer_id: user.id,
    name: parsed.data.project_name,
    address: parsed.data.address,
    city: parsed.data.city,
    status: 'pending' as unknown as TablesInsert<'projects'>['status'],
    current_stage: 'foundation',
    start_date: parsed.data.start_date || new Date().toISOString().slice(0, 10),
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert(projectInsert)
    .select('id')
    .single()

  if (projectError || !project) {
    return NextResponse.json({ error: projectError?.message ?? 'Failed to create project' }, { status: 400 })
  }

  const memberInsert: TablesInsert<'project_members'> = {
    project_id: project.id,
    user_id: user.id,
    role: 'customer',
    invited_by: user.id,
  }
  const { error: memberError } = await supabase.from('project_members').insert(memberInsert)

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, projectId: project.id })
}
