import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const paymentScheduleItemSchema = z.object({
  stage: z.string().min(1),
  label: z.string().min(1),
  percentage: z.number().positive(),
})

const setupSchema = z.object({
  total_contract_amount: z.number().positive(),
  built_up_area_sqft: z.number().positive(),
  number_of_floors: z.enum(['G', 'G+1', 'G+2', 'G+3']),
  start_date: z.string().date(),
  expected_end_date: z.string().date(),
  agreed_cement_rate: z.number().positive().default(400),
  agreed_steel_rate: z.number().positive().default(65),
  escalation_threshold_percent: z.number().positive().default(10),
  payment_schedule: z.array(paymentScheduleItemSchema).min(1),
  category_budget: z.record(z.string(), z.number().nonnegative()).optional(),
})

const DEFAULT_PAYMENT_SCHEDULE = [
  { stage: 'advance', label: 'Advance', percentage: 12 },
  { stage: 'plinth', label: 'After Plinth Work', percentage: 8 },
  { stage: 'brickwork', label: 'Brick Work Commencement', percentage: 2.5 },
  { stage: 'woodwork', label: 'Wood Work Commencement', percentage: 2.5 },
  { stage: 'gf_lintel', label: 'Before GF Lintel', percentage: 5 },
  { stage: 'gf_roof', label: 'Before GF Roof', percentage: 15 },
  { stage: 'ff_lintel', label: 'Before FF Lintel', percentage: 5 },
  { stage: 'ff_roof', label: 'Before FF Roof', percentage: 15 },
  { stage: 'sf_lintel', label: 'Before SF Lintel', percentage: 2.5 },
  { stage: 'sf_rcc', label: 'Before SF RCC', percentage: 5.5 },
  { stage: 'plastering', label: 'Before Plastering', percentage: 8 },
  { stage: 'flooring', label: 'Before Flooring', percentage: 8 },
  { stage: 'painting', label: 'Before Painting & Wiring', percentage: 8 },
  { stage: 'completion', label: 'Before Completion', percentage: 3 },
] as const

async function getProject(projectId: string) {
  const supabase = await createClient()
  return supabase
    .from('projects')
    .select('id,customer_id,contractor_id')
    .eq('id', projectId)
    .maybeSingle()
}

async function hasAccess(projectId: string, userId: string) {
  const supabase = await createClient()
  const { data: project } = await getProject(projectId)
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

  const { data: row, error } = await supabase
    .from('project_financials')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!row) return NextResponse.json({ exists: false, defaultSchedule: DEFAULT_PAYMENT_SCHEDULE })
  return NextResponse.json({ exists: true, financials: row })
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
  const { data: project } = await getProject(projectId)
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  if (project.customer_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = setupSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 })
  }

  const paymentTotal = parsed.data.payment_schedule.reduce((sum, item) => sum + item.percentage, 0)
  if (Math.abs(paymentTotal - 100) > 0.001) {
    return NextResponse.json({ error: 'Payment schedule must total 100%' }, { status: 400 })
  }

  const { error } = await supabase.from('project_financials').upsert(
    {
      project_id: projectId,
      ...parsed.data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'project_id' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
