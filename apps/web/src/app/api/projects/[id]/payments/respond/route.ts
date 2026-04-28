import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const respondSchema = z.object({
  payment_id: z.string().uuid(),
  action: z.enum(['approve', 'decline']),
  reason: z.string().trim().max(300).optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!profile || (profile.role !== 'contractor' && profile.role !== 'worker')) {
    return NextResponse.json({ error: 'Only contractors or workers can respond to payments' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = respondSchema.safeParse(body)
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
    .select('id,contractor_id,customer_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) {
    return NextResponse.json({ error: 'Not allowed for this project' }, { status: 403 })
  }
  const isProjectContractor = project.contractor_id === user.id
  let isWorkerMember = false
  if (profile.role === 'worker') {
    const { data: member } = await admin
      .from('project_members')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .eq('role', 'worker')
      .maybeSingle()
    isWorkerMember = Boolean(member)
  }
  if (!(isProjectContractor || isWorkerMember)) {
    return NextResponse.json({ error: 'Not allowed for this project' }, { status: 403 })
  }

  const payload = parsed.data
  const { data: payment } = await admin
    .from('payments')
    .select('id,amount,paid_to,paid_to_category,status')
    .eq('id', payload.payment_id)
    .eq('project_id', projectId)
    .eq('status', 'pending_confirmation')
    .maybeSingle()
  if (!payment) return NextResponse.json({ error: 'Payment not found or already processed' }, { status: 404 })
  if (payment.paid_to && payment.paid_to !== user.id) {
    return NextResponse.json({ error: 'This payment is assigned to another approver' }, { status: 403 })
  }

  const isApprove = payload.action === 'approve'
  const nextStatus = isApprove ? 'confirmed' : 'declined'

  const primaryUpdate = await admin
    .from('payments')
    .update({
      status: nextStatus,
      decline_reason: isApprove ? null : payload.reason?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', payload.payment_id)

  const fallbackUpdate =
    primaryUpdate.error &&
    primaryUpdate.error.message.toLowerCase().includes('decline_reason')
      ? await admin
          .from('payments')
          .update({
            status: nextStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', payload.payment_id)
      : null

  const updateError = fallbackUpdate ? fallbackUpdate.error : primaryUpdate.error
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  const formattedAmount = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(payment.amount)

  await admin.from('notifications').insert({
    user_id: project.customer_id,
    title: isApprove ? 'Payment approved ✓' : 'Payment declined',
    body: isApprove
      ? `${profile.role === 'worker' ? 'Worker' : 'Contractor'} confirmed your ${formattedAmount} payment for ${payment.paid_to_category}.`
      : `${profile.role === 'worker' ? 'Worker' : 'Contractor'} declined your ${formattedAmount} payment. Reason: ${payload.reason?.trim() || 'No reason given'}`,
    type: isApprove ? 'payment_confirmed' : 'payment_declined',
    project_id: projectId,
    payment_id: payment.id,
    is_read: false,
  })

  return NextResponse.json({ success: true })
}
