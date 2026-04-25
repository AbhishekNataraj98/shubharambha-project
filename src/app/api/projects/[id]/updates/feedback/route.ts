import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

type FeedbackComment = {
  id: string
  updateId: string
  userId: string
  userName: string
  content: string
  createdAt: string
  parentCommentId: string | null
  replies: FeedbackComment[]
}

async function checkMembership(projectId: string, userId: string) {
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params
  const allowed = await checkMembership(projectId, user.id)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const idsParam = url.searchParams.get('ids')
  const updateIds = idsParam
    ? idsParam.split(',').map((entry) => entry.trim()).filter(Boolean)
    : []
  if (updateIds.length === 0) return NextResponse.json({ feedback: {} })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const likesResult = await admin
    .from('update_likes')
    .select('update_id,user_id')
    .in('update_id', updateIds)

  const commentsResult = await admin
    .from('update_comments')
    .select('id,update_id,user_id,parent_comment_id,content,created_at')
    .in('update_id', updateIds)
    .order('created_at', { ascending: true })

  // If tables are not yet migrated, degrade gracefully.
  if (likesResult.error || commentsResult.error) {
    return NextResponse.json({ feedback: {} })
  }

  const comments = commentsResult.data ?? []
  const usersNeeded = Array.from(
    new Set([
      ...((likesResult.data ?? []).map((row) => row.user_id)),
      ...(comments.map((row) => row.user_id)),
    ])
  )
  const { data: users } = usersNeeded.length
    ? await admin.from('users').select('id,name').in('id', usersNeeded)
    : { data: [] as Array<{ id: string; name: string }> }
  const nameByUserId = new Map((users ?? []).map((row) => [row.id, row.name]))

  const feedback: Record<
    string,
    { likesCount: number; likedByCurrentUser: boolean; comments: FeedbackComment[] }
  > = {}

  for (const id of updateIds) {
    feedback[id] = { likesCount: 0, likedByCurrentUser: false, comments: [] }
  }

  for (const row of likesResult.data ?? []) {
    const bucket = feedback[row.update_id]
    if (!bucket) continue
    bucket.likesCount += 1
    if (row.user_id === user.id) bucket.likedByCurrentUser = true
  }

  for (const id of updateIds) {
    const rows = comments.filter((row) => row.update_id === id)
    const byId = new Map<string, FeedbackComment>()
    const roots: FeedbackComment[] = []
    for (const row of rows) {
      byId.set(row.id, {
        id: row.id,
        updateId: row.update_id,
        userId: row.user_id,
        userName: nameByUserId.get(row.user_id) ?? 'User',
        content: row.content,
        createdAt: row.created_at,
        parentCommentId: row.parent_comment_id,
        replies: [],
      })
    }
    for (const row of rows) {
      const comment = byId.get(row.id)
      if (!comment) continue
      if (row.parent_comment_id) {
        const parent = byId.get(row.parent_comment_id)
        if (parent) parent.replies.push(comment)
        else roots.push(comment)
      } else {
        roots.push(comment)
      }
    }
    feedback[id].comments = roots
  }

  return NextResponse.json({ feedback })
}
