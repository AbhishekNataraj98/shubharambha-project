import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

export async function GET() {
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

  const { data: me } = await admin.from('users').select('id,role').eq('id', user.id).maybeSingle()
  if (!me || me.role !== 'customer') {
    return NextResponse.json({ items: [] })
  }

  const { data: invites, error: inviteError } = await admin
    .from('enquiries')
    .select('id,recipient_id')
    .eq('customer_id', user.id)
    .ilike('subject', 'Project invitation [%')
    .order('created_at', { ascending: false })

  if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 400 })

  const rows = invites ?? []
  const recipientIds = Array.from(new Set(rows.map((invite) => invite.recipient_id).filter(Boolean))) as string[]
  const { data: recipients, error: recipientError } = recipientIds.length
    ? await admin.from('users').select('id,name,role').in('id', recipientIds)
    : { data: [], error: null }

  if (recipientError) return NextResponse.json({ error: recipientError.message }, { status: 400 })

  const recipientById = new Map((recipients ?? []).map((recipient) => [recipient.id, recipient]))

  return NextResponse.json({
    items: rows.map((invite) => {
      const recipient = invite.recipient_id ? recipientById.get(invite.recipient_id) : null
      return {
        invite_id: invite.id,
        recipient_id: invite.recipient_id,
        recipient_name: recipient?.name ?? null,
        recipient_role: recipient?.role ?? null,
      }
    }),
  })
}
