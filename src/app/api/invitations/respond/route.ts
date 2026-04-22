import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { TablesInsert } from '@/types/supabase'

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

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!me || me.role !== 'contractor') {
    return NextResponse.json({ error: 'Only contractors can respond to invitations' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = respondSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid response data' },
      { status: 400 }
    )
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id,contractor_id')
    .eq('id', parsed.data.project_id)
    .maybeSingle()

  if (!project || project.contractor_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden invitation access' }, { status: 403 })
  }

  if (parsed.data.action === 'accept') {
    const { error: projectError } = await supabase
      .from('projects')
      .update({ status: 'active' })
      .eq('id', parsed.data.project_id)

    if (projectError) return NextResponse.json({ error: projectError.message }, { status: 400 })

    const memberInsert: TablesInsert<'project_members'> = {
      project_id: parsed.data.project_id,
      user_id: user.id,
      role: 'contractor',
      invited_by: user.id,
    }

    const { error: memberError } = await supabase
      .from('project_members')
      .upsert(memberInsert, { onConflict: 'project_id,user_id' })
    if (memberError) return NextResponse.json({ error: memberError.message }, { status: 400 })

    const { error: enquiryError } = await supabase
      .from('enquiries')
      .update({ status: 'responded' as unknown as TablesInsert<'enquiries'>['status'] })
      .eq('recipient_id', user.id)
      .eq('status', 'open' as unknown as TablesInsert<'enquiries'>['status'])
      .ilike('subject', `%[${parsed.data.project_id}]%`)

    if (enquiryError) return NextResponse.json({ error: enquiryError.message }, { status: 400 })
  } else {
    const { error: projectError } = await supabase
      .from('projects')
      .update({ status: 'cancelled' })
      .eq('id', parsed.data.project_id)
    if (projectError) return NextResponse.json({ error: projectError.message }, { status: 400 })

    const { error: enquiryError } = await supabase
      .from('enquiries')
      .update({ status: 'closed' as unknown as TablesInsert<'enquiries'>['status'] })
      .eq('recipient_id', user.id)
      .eq('status', 'open' as unknown as TablesInsert<'enquiries'>['status'])
      .ilike('subject', `%[${parsed.data.project_id}]%`)
    if (enquiryError) return NextResponse.json({ error: enquiryError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
