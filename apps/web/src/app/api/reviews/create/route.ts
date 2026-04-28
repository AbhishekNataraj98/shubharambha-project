import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({
  project_id: z.string().uuid(),
  reviewee_id: z.string().uuid(),
  quality: z.number().int().min(1).max(5),
  response: z.number().int().min(1).max(5),
  behavior: z.number().int().min(1).max(5),
  timeliness: z.number().int().min(1).max(5),
  workmanship: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid review payload' }, { status: 400 })
  }

  const payload = parsed.data
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!me || me.role !== 'customer') {
    return NextResponse.json({ error: 'Only customers can submit reviews' }, { status: 403 })
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id,customer_id')
    .eq('id', payload.project_id)
    .maybeSingle()
  if (!project || project.customer_id !== user.id) {
    return NextResponse.json({ error: 'Only the project customer can review for this project' }, { status: 403 })
  }

  const { data: acceptedMember } = await supabase
    .from('project_members')
    .select('id,role')
    .eq('project_id', payload.project_id)
    .eq('user_id', payload.reviewee_id)
    .in('role', ['contractor', 'worker'])
    .maybeSingle()
  if (!acceptedMember) {
    return NextResponse.json({ error: 'You can review only accepted contractor/worker invitations' }, { status: 403 })
  }

  const average =
    (payload.quality + payload.response + payload.behavior + payload.timeliness + payload.workmanship) / 5
  const rounded = Number(average.toFixed(1))
  const commentBlock = [
    `Quality: ${payload.quality}/5`,
    `Response: ${payload.response}/5`,
    `Behavior: ${payload.behavior}/5`,
    `Timeliness: ${payload.timeliness}/5`,
    `Workmanship: ${payload.workmanship}/5`,
    payload.comment ? `Comment: ${payload.comment}` : null,
  ]
    .filter(Boolean)
    .join(' | ')

  const { error } = await supabase.from('reviews').upsert(
    {
      project_id: payload.project_id,
      reviewer_id: user.id,
      reviewee_id: payload.reviewee_id,
      rating: rounded,
      comment: commentBlock,
    },
    { onConflict: 'project_id,reviewer_id,reviewee_id' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}

