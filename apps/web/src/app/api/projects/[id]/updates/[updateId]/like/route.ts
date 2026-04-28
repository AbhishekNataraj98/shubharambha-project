import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

async function hasMembership(projectId: string, userId: string) {
  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id,customer_id,contractor_id')
    .eq('id', projectId)
    .maybeSingle()
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

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; updateId: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId, updateId } = await params
  const allowed = await hasMembership(projectId, user.id)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: updateRow } = await admin
    .from('daily_updates')
    .select('id')
    .eq('id', updateId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (!updateRow) return NextResponse.json({ error: 'Update not found' }, { status: 404 })

  const [{ data: project }, { data: actorProfile }] = await Promise.all([
    admin.from('projects').select('customer_id,contractor_id').eq('id', projectId).maybeSingle(),
    admin.from('users').select('name,role').eq('id', user.id).maybeSingle(),
  ])

  const { data: existing, error: existingError } = await admin
    .from('update_likes')
    .select('id')
    .eq('update_id', updateId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingError) {
    if (
      existingError.message.toLowerCase().includes('update_likes') ||
      existingError.message.toLowerCase().includes('relation')
    ) {
      return NextResponse.json(
        { error: 'Feedback tables are not migrated yet. Run supabase db push to apply update feedback migration.' },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: existingError.message }, { status: 400 })
  }

  let liked = false
  if (existing) {
    const { error } = await admin.from('update_likes').delete().eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    liked = false
  } else {
    const { error } = await admin.from('update_likes').insert({ update_id: updateId, user_id: user.id })
    if (error) {
      if (
        error.message.toLowerCase().includes('update_likes') ||
        error.message.toLowerCase().includes('relation')
      ) {
        return NextResponse.json(
          { error: 'Feedback tables are not migrated yet. Run supabase db push to apply update feedback migration.' },
          { status: 400 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    liked = true

    const actorRole = actorProfile?.role ?? ''
    const recipientId =
      actorRole === 'customer'
        ? project?.contractor_id ?? null
        : actorRole === 'contractor' || actorRole === 'worker'
          ? project?.customer_id ?? null
          : null
    if (recipientId && recipientId !== user.id) {
      const actorName = actorProfile?.name?.trim() || 'Someone'
      const primaryNotification = await admin.from('notifications').insert({
        user_id: recipientId,
        title: 'New like on update',
        body: `${actorName} liked an update post.`,
        type: 'update_liked',
        project_id: projectId,
        update_id: updateId,
        is_read: false,
      })
      if (
        primaryNotification.error &&
        primaryNotification.error.message.toLowerCase().includes('update_id')
      ) {
        await admin.from('notifications').insert({
          user_id: recipientId,
          title: 'New like on update',
          body: `${actorName} liked an update post.`,
          type: 'update_liked',
          project_id: projectId,
          is_read: false,
        })
      }
    }
  }

  const { count } = await admin
    .from('update_likes')
    .select('id', { count: 'exact', head: true })
    .eq('update_id', updateId)

  return NextResponse.json({ success: true, liked, likesCount: count ?? 0 })
}
