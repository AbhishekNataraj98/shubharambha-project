import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { TablesInsert } from '@/types/supabase'
import type { Database } from '@/types/supabase'

const respondSchema = z.object({
  project_id: z.string().uuid(),
  action: z.enum(['accept', 'decline']),
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
  if (!me || (me.role !== 'contractor' && me.role !== 'worker')) {
    return NextResponse.json({ error: 'Only contractors or workers can respond to invitations' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = respondSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid response data' },
      { status: 400 }
    )
  }

  const { data: project } = await admin
    .from('projects')
    .select('id,contractor_id,customer_id,status')
    .eq('id', parsed.data.project_id)
    .maybeSingle()

  const { data: openInvite } = await admin
    .from('enquiries')
    .select('id,customer_id')
    .eq('recipient_id', user.id)
    .eq('status', 'open' as unknown as TablesInsert<'enquiries'>['status'])
    .ilike('subject', `%[${parsed.data.project_id}]%`)
    .maybeSingle()

  if (!project || !openInvite || (me.role === 'contractor' && project.contractor_id !== user.id)) {
    return NextResponse.json({ error: 'Forbidden invitation access' }, { status: 403 })
  }

  if (parsed.data.action === 'accept') {
    // Any accepted invitation means work has been accepted, so promote project out of "awaiting" state.
    const { error: projectError } = await admin.from('projects').update({ status: 'active' as const }).eq('id', parsed.data.project_id)

    if (projectError) return NextResponse.json({ error: projectError.message }, { status: 400 })

    const memberInsert: TablesInsert<'project_members'> = {
      project_id: parsed.data.project_id,
      user_id: user.id,
      role: me.role === 'contractor' ? 'contractor' : 'worker',
      invited_by: user.id,
    }

    const { error: memberError } = await admin
      .from('project_members')
      .upsert(memberInsert, { onConflict: 'project_id,user_id' })
    if (memberError) return NextResponse.json({ error: memberError.message }, { status: 400 })

    const { error: enquiryError } = await admin
      .from('enquiries')
      .update({ status: 'responded' as unknown as TablesInsert<'enquiries'>['status'] })
      .eq('recipient_id', user.id)
      .eq('status', 'open' as unknown as TablesInsert<'enquiries'>['status'])
      .ilike('subject', `%[${parsed.data.project_id}]%`)

    if (enquiryError) return NextResponse.json({ error: enquiryError.message }, { status: 400 })

    await admin.from('notifications').insert({
      user_id: openInvite.customer_id,
      title: 'Invitation accepted',
      body: `${me.role === 'contractor' ? 'Contractor' : 'Worker'} accepted your work invitation.`,
      type: 'project_invite_response',
      project_id: parsed.data.project_id,
    })
  } else {
    if (me.role === 'contractor') {
      const { error: projectError } = await admin
        .from('projects')
        .update({ contractor_id: null, status: 'on_hold' })
        .eq('id', parsed.data.project_id)
      if (projectError) return NextResponse.json({ error: projectError.message }, { status: 400 })
    }

    const { error: enquiryError } = await admin
      .from('enquiries')
      .update({ status: 'closed' as unknown as TablesInsert<'enquiries'>['status'] })
      .eq('recipient_id', user.id)
      .eq('status', 'open' as unknown as TablesInsert<'enquiries'>['status'])
      .ilike('subject', `%[${parsed.data.project_id}]%`)
    if (enquiryError) return NextResponse.json({ error: enquiryError.message }, { status: 400 })

    await admin.from('notifications').insert({
      user_id: openInvite.customer_id,
      title: 'Invitation declined',
      body: `${me.role === 'contractor' ? 'Contractor' : 'Worker'} declined your work invitation.`,
      type: 'project_invite_response',
      project_id: parsed.data.project_id,
    })
  }

  return NextResponse.json({ success: true })
}
