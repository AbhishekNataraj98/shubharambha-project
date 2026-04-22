import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { TablesInsert } from '@/types/supabase'

const sendInvitationSchema = z.object({
  project_id: z.string().uuid().optional(),
  contractor_id: z.string().uuid(),
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
  const parsed = sendInvitationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid invitation data' },
      { status: 400 }
    )
  }

  const payload = parsed.data

  let projectId: string
  if (payload.project_id) {
    const { data: existingProject } = await supabase
      .from('projects')
      .select('id,customer_id')
      .eq('id', payload.project_id)
      .maybeSingle()

    if (!existingProject || existingProject.customer_id !== user.id) {
      return NextResponse.json({ error: 'Project not found or access denied' }, { status: 403 })
    }

    const { error: updateError } = await supabase
      .from('projects')
      .update({
        contractor_id: payload.contractor_id,
        status: 'on_hold',
      })
      .eq('id', payload.project_id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    projectId = payload.project_id
  } else {
    const projectInsert: TablesInsert<'projects'> = {
      customer_id: user.id,
      contractor_id: payload.contractor_id,
      name: payload.project_name,
      address: payload.address,
      city: payload.city,
      start_date: payload.start_date || new Date().toISOString().slice(0, 10),
      current_stage: 'foundation',
      status: 'on_hold',
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert(projectInsert)
      .select('id')
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: projectError?.message ?? 'Unable to create project' }, { status: 400 })
    }

    const customerMember: TablesInsert<'project_members'> = {
      project_id: project.id,
      user_id: user.id,
      role: 'customer',
      invited_by: user.id,
    }
    const { error: memberError } = await supabase.from('project_members').insert(customerMember)
    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 400 })
    }
    projectId = project.id
  }

  const enquiry = {
    customer_id: user.id,
    recipient_id: payload.contractor_id,
    subject: `Project invitation [${projectId}]: ${payload.project_name}`,
    message: `Project invitation: ${payload.project_name} in ${payload.city}`,
    status: 'open',
  } as unknown as TablesInsert<'enquiries'>

  const { error: enquiryError } = await supabase.from('enquiries').insert(enquiry)
  if (enquiryError) {
    return NextResponse.json({ error: enquiryError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, projectId })
}
