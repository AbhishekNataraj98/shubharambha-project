import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const commentSchema = z.object({
  content: z.string().trim().min(1).max(500),
  parentCommentId: z.string().uuid().optional(),
})

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
  request: Request,
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

  const body = await request.json()
  const parsed = commentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid comment' }, { status: 400 })
  }

  const payload = parsed.data
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

  const { data: inserted, error } = await admin
    .from('update_comments')
    .insert({
      update_id: updateId,
      user_id: user.id,
      parent_comment_id: payload.parentCommentId ?? null,
      content: payload.content,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    if (
      error?.message.toLowerCase().includes('update_comments') ||
      error?.message.toLowerCase().includes('relation')
    ) {
      return NextResponse.json(
        { error: 'Feedback tables are not migrated yet. Run supabase db push to apply update feedback migration.' },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: error?.message ?? 'Failed to add comment' }, { status: 400 })
  }

  const [{ data: project }, { data: actorProfile }] = await Promise.all([
    admin.from('projects').select('customer_id,contractor_id').eq('id', projectId).maybeSingle(),
    admin.from('users').select('name,role').eq('id', user.id).maybeSingle(),
  ])

  const actorRole = actorProfile?.role ?? ''
  const recipientId =
    actorRole === 'customer'
      ? project?.contractor_id ?? null
      : actorRole === 'contractor' || actorRole === 'worker'
        ? project?.customer_id ?? null
        : null

  if (recipientId && recipientId !== user.id) {
    const actorName = actorProfile?.name?.trim() || 'Someone'
    const isReply = Boolean(payload.parentCommentId)
    const notificationType = isReply ? 'update_replied' : 'update_commented'
    const notificationTitle = isReply ? 'New reply on update' : 'New comment on update'
    const notificationBody = isReply
      ? `${actorName} replied on an update post.`
      : `${actorName} commented on an update post.`

    const primaryNotification = await admin.from('notifications').insert({
      user_id: recipientId,
      title: notificationTitle,
      body: notificationBody,
      type: notificationType,
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
        title: notificationTitle,
        body: notificationBody,
        type: notificationType,
        project_id: projectId,
        is_read: false,
      })
    }
  }

  return NextResponse.json({ success: true, commentId: inserted.id })
}
