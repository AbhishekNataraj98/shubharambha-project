import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { TablesInsert } from '@/types/supabase'
import type { Database } from '@/types/supabase'

const INVITE_BLOCKING_PROJECT_STATUSES: Database['public']['Enums']['project_status'][] = ['active', 'on_hold']

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server is missing Supabase admin credentials' }, { status: 500 })
  }
  const admin = createAdminClient<Database>(supabaseUrl, serviceRoleKey)

  const { data: me } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
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
  const recipientId = payload.contractor_id

  const { data: recipient } = await admin
    .from('users')
    .select('id,name,role')
    .eq('id', recipientId)
    .maybeSingle()
  if (!recipient || (recipient.role !== 'contractor' && recipient.role !== 'worker')) {
    return NextResponse.json({ error: 'Invite can only be sent to contractor or worker profiles' }, { status: 400 })
  }

  const { data: pendingInvites } = await admin
    .from('enquiries')
    .select('id,subject')
    .eq('customer_id', user.id)
    .eq('recipient_id', recipientId)
    .eq('status', 'open')
    .ilike('subject', 'Project invitation [%')
    .order('created_at', { ascending: false })

  if ((pendingInvites ?? []).length > 0) {
    return NextResponse.json(
      {
        error: `Previous invitation is still pending with this ${recipient.role === 'worker' ? 'worker' : 'contractor'}.`,
        pendingInvitations: pendingInvites ?? [],
      },
      { status: 400 }
    )
  }

  if (!payload.project_id) {
    if (recipient.role === 'contractor') {
      const { data: activeProjects } = await admin
        .from('projects')
        .select('id,name,status')
        .eq('customer_id', user.id)
        .eq('contractor_id', recipientId)
        .in('status', INVITE_BLOCKING_PROJECT_STATUSES)
      if ((activeProjects ?? []).length >= 3) {
        return NextResponse.json(
          {
            error: 'You already have 3 active projects with this contractor. Complete one to send a new invite.',
            activeProjects: activeProjects ?? [],
            limit: 3,
          },
          { status: 400 }
        )
      }
    } else {
      const { data: memberships } = await admin
        .from('project_members')
        .select('project_id')
        .eq('user_id', recipientId)
        .eq('role', 'worker')
      const projectIds = Array.from(new Set((memberships ?? []).map((entry) => entry.project_id)))
      const { data: activeProjects } = projectIds.length
        ? await admin
            .from('projects')
            .select('id,name,status')
            .in('id', projectIds)
            .eq('customer_id', user.id)
            .in('status', INVITE_BLOCKING_PROJECT_STATUSES)
        : { data: [] as Array<{ id: string; name: string; status: string }> }
      if ((activeProjects ?? []).length >= 1) {
        return NextResponse.json(
          {
            error: 'You already have an active project with this worker. Complete it before sending another invite.',
            activeProjects: activeProjects ?? [],
            limit: 1,
          },
          { status: 400 }
        )
      }
    }
  }

  let projectId: string
  if (payload.project_id) {
    const { data: existingProject } = await admin
      .from('projects')
      .select('id,customer_id')
      .eq('id', payload.project_id)
      .maybeSingle()

    if (!existingProject || existingProject.customer_id !== user.id) {
      return NextResponse.json({ error: 'Project not found or access denied' }, { status: 403 })
    }

    const { error: updateError } = await admin
      .from('projects')
      .update({
        contractor_id: recipient.role === 'contractor' ? recipientId : existingProject.contractor_id,
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
      contractor_id: recipient.role === 'contractor' ? recipientId : null,
      name: payload.project_name,
      address: payload.address,
      city: payload.city,
      start_date: payload.start_date || new Date().toISOString().slice(0, 10),
      current_stage: 'foundation',
      status: 'on_hold',
    }

    const { data: project, error: projectError } = await admin
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
    const { error: memberError } = await admin.from('project_members').insert(customerMember)
    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 400 })
    }
    projectId = project.id
  }

  const enquiry = {
    customer_id: user.id,
    recipient_id: recipientId,
    subject: `Project invitation [${projectId}]: ${payload.project_name}`,
    message: `Project invitation: ${payload.project_name} in ${payload.city}`,
    status: 'open',
  } as unknown as TablesInsert<'enquiries'>

  const { error: enquiryError } = await admin.from('enquiries').insert(enquiry)
  if (enquiryError) {
    return NextResponse.json({ error: enquiryError.message }, { status: 400 })
  }

  await admin.from('notifications').insert({
    user_id: recipientId,
    title: 'New work invitation',
    body: `${payload.project_name} in ${payload.city}. Tap to review invitation.`,
    type: 'project_invite',
    project_id: projectId,
  })

  return NextResponse.json({ success: true, projectId })
}
