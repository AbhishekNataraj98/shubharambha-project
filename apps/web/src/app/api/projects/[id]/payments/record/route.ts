import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const recordSchema = z.object({
  amount: z.number().min(1).max(10000000),
  category: z.enum(['labour', 'material', 'contractor_fee', 'other']).optional(),
  paid_to: z.string().trim().min(2).optional(),
  payment_stage: z
    .enum([
      'advance',
      'plinth',
      'brickwork',
      'woodwork',
      'gf_lintel',
      'gf_roof',
      'ff_lintel',
      'ff_roof',
      'sf_lintel',
      'sf_rcc',
      'plastering',
      'flooring',
      'painting',
      'completion',
    ])
    .optional(),
  payment_mode: z.enum(['cash', 'upi', 'bank_transfer', 'cheque']),
  paid_at: z.string().min(4),
  description: z.string().trim().max(300).optional(),
  receipt_url: z.string().url().optional(),
})

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userProfile } = await supabase.from('users').select('role,name').eq('id', user.id).maybeSingle()
  if (!userProfile || userProfile.role !== 'customer') {
    return NextResponse.json({ error: 'Only customers can record payments' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = recordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 })
  }

  const { id: projectId } = await params
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: project } = await admin
    .from('projects')
    .select('id,customer_id,contractor_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project || project.customer_id !== user.id) {
    return NextResponse.json({ error: 'Not allowed for this project' }, { status: 403 })
  }

  const payload = parsed.data
  const { data: workerMembers } = await admin
    .from('project_members')
    .select('user_id,role')
    .eq('project_id', projectId)
    .eq('role', 'worker')
  const workerIds = Array.from(new Set((workerMembers ?? []).map((member) => member.user_id)))
  const defaultApproverId = project.contractor_id ?? workerIds[0] ?? user.id
  const paidToUserId = payload.paid_to && uuidRegex.test(payload.paid_to) ? payload.paid_to : defaultApproverId
  const category = payload.category ?? 'contractor_fee'
  const baseDescription = payload.description?.trim() || 'Payment recorded'
  const stagePrefix = payload.payment_stage ? `[STAGE:${payload.payment_stage}] ` : ''
  const safeDescription = stagePrefix + baseDescription

  const primaryInsert = await admin
    .from('payments')
    .insert({
      project_id: projectId,
      recorded_by: user.id,
      recorded_by_role: 'customer',
      paid_to: paidToUserId,
      paid_to_category: category,
      amount: payload.amount,
      payment_mode: payload.payment_mode,
      description: safeDescription,
      receipt_url: payload.receipt_url ?? null,
      status: 'pending_confirmation',
      paid_at: payload.paid_at,
    })
    .select(
      'id,project_id,recorded_by,paid_to,paid_to_category,amount,payment_mode,description,receipt_url,status,paid_at,created_at'
    )
    .single()

  const fallbackInsert =
    primaryInsert.error &&
    primaryInsert.error.message.toLowerCase().includes('recorded_by_role')
      ? await admin
          .from('payments')
          .insert({
            project_id: projectId,
            recorded_by: user.id,
            paid_to: paidToUserId,
            paid_to_category: category,
            amount: payload.amount,
            payment_mode: payload.payment_mode,
            description: safeDescription,
            receipt_url: payload.receipt_url ?? null,
            status: 'pending_confirmation',
            paid_at: payload.paid_at,
          })
          .select(
            'id,project_id,recorded_by,paid_to,paid_to_category,amount,payment_mode,description,receipt_url,status,paid_at,created_at'
          )
          .single()
      : null

  const inserted = fallbackInsert ? fallbackInsert.data : primaryInsert.data
  const insertError = fallbackInsert ? fallbackInsert.error : primaryInsert.error

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? 'Failed to record payment' }, { status: 400 })
  }

  const approverIds = Array.from(
    new Set([paidToUserId, project.contractor_id, ...workerIds].filter((id): id is string => Boolean(id) && id !== user.id))
  )
  if (approverIds.length > 0) {
    await admin.from('notifications').insert(
      approverIds.map((approverId) => ({
        user_id: approverId,
        title: 'New payment recorded',
        body: `Customer recorded ${new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 0,
        }).format(payload.amount)} for ${category}. Please review and approve.`,
        type: 'payment_pending',
        project_id: projectId,
        payment_id: inserted.id,
        is_read: false,
      }))
    )
  }

  return NextResponse.json({ success: true, payment: inserted })
}
