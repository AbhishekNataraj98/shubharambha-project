import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

async function hasAccess(projectId: string, userId: string) {
  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id,customer_id,contractor_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return false
  return project.customer_id === userId || project.contractor_id === userId
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

  const { data: roleData } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  const role = roleData?.role ?? 'customer'

  const withReason = await supabase
    .from('payments')
    .select(
      'id,amount,paid_to,paid_to_category,payment_mode,description,status,receipt_url,paid_at,created_at,recorded_by,decline_reason'
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  const fallbackWithoutReason =
    withReason.error && withReason.error.message.toLowerCase().includes('decline_reason')
      ? await supabase
          .from('payments')
          .select(
            'id,amount,paid_to,paid_to_category,payment_mode,description,status,receipt_url,paid_at,created_at,recorded_by'
          )
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
      : null

  const rows = fallbackWithoutReason ? fallbackWithoutReason.data : withReason.data
  const error = fallbackWithoutReason ? fallbackWithoutReason.error : withReason.error

  if (error || !rows) return NextResponse.json({ error: error?.message ?? 'Failed to fetch payments' }, { status: 400 })

  const userIds = Array.from(new Set(rows.map((row) => [row.paid_to, row.recorded_by]).flat()))
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: users } = userIds.length
    ? await admin.from('users').select('id,name').in('id', userIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const nameById = new Map((users ?? []).map((item) => [item.id, item.name]))

  const mapped = rows
    .filter((row) => {
      if (role === 'customer') return true
      if (role === 'contractor') {
        return (
          row.status === 'confirmed' ||
          row.status === 'pending_confirmation' ||
          row.status === 'declined' ||
          row.status === 'rejected'
        )
      }
      return row.status === 'confirmed'
    })
    .map((row) => ({
      id: row.id,
      amount: row.amount,
      paidToCategory: row.paid_to_category,
      paymentMode: row.payment_mode,
      description: row.description,
      status: row.status === 'rejected' ? 'declined' : row.status,
      paidToName: nameById.get(row.paid_to) ?? 'User',
      receiptUrl: row.receipt_url,
      paidAt: row.paid_at,
      createdAt: row.created_at,
      recordedBy: row.recorded_by,
      recordedByName: nameById.get(row.recorded_by) ?? 'User',
      declineReason: row.decline_reason ?? null,
    }))

  return NextResponse.json({ payments: mapped })
}
