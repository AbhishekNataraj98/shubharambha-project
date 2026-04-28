import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { TablesInsert } from '@/types/supabase'

const postMessageSchema = z
  .object({
    content: z.string().trim().max(1000).optional(),
    messageType: z.enum(['text', 'photo']).default('text'),
    attachmentUrls: z.array(z.string().url()).max(5).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.messageType === 'text' && (!data.content || data.content.length < 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: 'Message content is required',
      })
    }
    if (data.messageType === 'photo' && (!data.attachmentUrls || data.attachmentUrls.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['attachmentUrls'],
        message: 'At least one image is required',
      })
    }
  })

async function checkProjectAccess(projectId: string, userId: string) {
  const supabase = await createClient()

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id,customer_id,contractor_id')
    .eq('id', projectId)
    .maybeSingle()

  if (projectError || !project) return { allowed: false }
  if (project.customer_id === userId || project.contractor_id === userId) return { allowed: true }

  const { data: membership } = await supabase
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  return { allowed: Boolean(membership) }
}

async function getSenderNameMap(senderIds: string[]) {
  if (senderIds.length === 0) return new Map<string, string>()

  const supabase = await createClient()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (supabaseUrl && serviceRole) {
    const admin = createAdminClient(supabaseUrl, serviceRole)
    const { data: users } = await admin.from('users').select('id,name').in('id', senderIds)
    return new Map((users ?? []).map((entry) => [entry.id, entry.name]))
  }

  const { data: users } = await supabase.from('users').select('id,name').in('id', senderIds)
  return new Map((users ?? []).map((entry) => [entry.id, entry.name]))
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
  const access = await checkProjectAccess(projectId, user.id)
  if (!access.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: rows, error } = await supabase
    .from('messages')
    .select('id,project_id,sender_id,content,message_type,attachment_urls,created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const senderIds = Array.from(new Set((rows ?? []).map((row) => row.sender_id)))
  const senderNameById = await getSenderNameMap(senderIds)

  const nowIso = new Date().toISOString()
  const url = new URL(request.url)
  const markRead = url.searchParams.get('markRead') === 'true'

  let unreadCount = 0
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (supabaseUrl && serviceRole) {
    const admin = createAdminClient(supabaseUrl, serviceRole)
    const { data: readState } = await admin
      .from('project_chat_reads')
      .select('last_read_at')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle()

    const lastReadAt = typeof readState?.last_read_at === 'string' ? readState.last_read_at : null
    unreadCount = (rows ?? []).filter((row) => {
      if (row.sender_id === user.id) return false
      if (!lastReadAt) return true
      return new Date(row.created_at).getTime() > new Date(lastReadAt).getTime()
    }).length

    if (markRead) {
      await admin.from('project_chat_reads').upsert(
        {
          project_id: projectId,
          user_id: user.id,
          last_read_at: nowIso,
        },
        { onConflict: 'project_id,user_id' }
      )
      unreadCount = 0
    }
  }

  const messages = (rows ?? []).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    senderId: row.sender_id,
    senderName: senderNameById.get(row.sender_id) ?? 'User',
    content: row.content,
    messageType: row.message_type,
    attachmentUrls: row.attachment_urls ?? [],
    createdAt: row.created_at,
  }))

  return NextResponse.json({ messages, unreadCount })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params
  const access = await checkProjectAccess(projectId, user.id)
  if (!access.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = postMessageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid message' },
      { status: 400 }
    )
  }

  const payload = parsed.data

  const insertRow: TablesInsert<'messages'> = {
    project_id: projectId,
    sender_id: user.id,
    content: payload.content ?? '',
    message_type: payload.messageType === 'photo' ? 'photo' : 'text',
    attachment_urls: payload.attachmentUrls ?? [],
  }

  const { data: inserted, error } = await supabase
    .from('messages')
    .insert(insertRow)
    .select('id,project_id,sender_id,content,message_type,attachment_urls,created_at')
    .single()

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? 'Failed to send message' }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    message: {
      id: inserted.id,
      projectId: inserted.project_id,
      senderId: inserted.sender_id,
      content: inserted.content,
      messageType: inserted.message_type,
      attachmentUrls: inserted.attachment_urls ?? [],
      createdAt: inserted.created_at,
    },
  })
}
