import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const stageOrder = ['foundation', 'plinth', 'walls', 'slab', 'plastering', 'finishing'] as const

const createUpdateSchema = z.object({
  stage_tag: z.enum(stageOrder),
  description: z.string().trim().min(10).max(500),
  photo_urls: z.array(z.string().trim().min(1)).min(1),
  materials_used: z.string().trim().max(200).optional(),
})

async function canPostUpdate(projectId: string, userId: string) {
  const supabase = await createClient()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  const admin =
    supabaseUrl && serviceRole
      ? createAdminClient(supabaseUrl, serviceRole)
      : null
  const db = admin ?? supabase

  const { data: userProfile } = await db.from('users').select('role').eq('id', userId).maybeSingle()
  if (!userProfile) return { allowed: false, status: 401 as const, message: 'Profile not found' }
  if (userProfile.role !== 'contractor' && userProfile.role !== 'worker') {
    return { allowed: false, status: 403 as const, message: 'Only contractors and workers can post updates' }
  }

  const { data: contractorProject } = await db
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('contractor_id', userId)
    .maybeSingle()
  if (contractorProject) return { allowed: true as const }

  const { data: member } = await db
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  if (member) return { allowed: true as const }

  return { allowed: false, status: 403 as const, message: 'Not allowed to post updates for this project' }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  const admin =
    supabaseUrl && serviceRole
      ? createAdminClient(supabaseUrl, serviceRole)
      : null
  const db = admin ?? supabase
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params
  const access = await canPostUpdate(projectId, user.id)
  if (!access.allowed) return NextResponse.json({ error: access.message }, { status: access.status })

  const body = await request.json()
  const parsed = createUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
      { status: 400 }
    )
  }

  const payload = parsed.data
  const normalizedPhotoUrls = payload.photo_urls.map((url) => url.trim()).filter(Boolean)
  if (normalizedPhotoUrls.length === 0) {
    return NextResponse.json({ error: 'At least one valid photo URL is required' }, { status: 400 })
  }
  const materialText = payload.materials_used?.trim()
  const materialValue = materialText && materialText.length > 0 ? materialText : null

  const insertWithMaterials = await db
    .from('daily_updates')
    .insert({
      project_id: projectId,
      posted_by: user.id,
      description: payload.description,
      stage_tag: payload.stage_tag,
      photo_urls: normalizedPhotoUrls,
      materials_used: materialValue,
    })
    .select('id,project_id,posted_by,description,stage_tag,photo_urls,created_at,materials_used')
    .single()

  const fallbackInsert =
    insertWithMaterials.error
      ? await db
          .from('daily_updates')
          .insert({
            project_id: projectId,
            posted_by: user.id,
            description: payload.description,
            stage_tag: payload.stage_tag,
            photo_urls: normalizedPhotoUrls,
          })
          .select('id,project_id,posted_by,description,stage_tag,photo_urls,created_at')
          .single()
      : null

  const inserted = fallbackInsert ? fallbackInsert.data : insertWithMaterials.data
  const error = fallbackInsert ? fallbackInsert.error : insertWithMaterials.error

  if (error || !inserted) {
    return NextResponse.json(
      {
        error: `Failed to create update: ${error?.message ?? 'Unknown database error'}`,
      },
      { status: 400 }
    )
  }

  const { data: project } = await db
    .from('projects')
    .select('current_stage,customer_id')
    .eq('id', projectId)
    .maybeSingle()

  const existingIndex = stageOrder.indexOf((project?.current_stage ?? '') as (typeof stageOrder)[number])
  const incomingIndex = stageOrder.indexOf(payload.stage_tag)
  if (incomingIndex >= 0 && (existingIndex === -1 || incomingIndex > existingIndex)) {
    await db.from('projects').update({ current_stage: payload.stage_tag }).eq('id', projectId)
  }

  if (project?.customer_id && project.customer_id !== user.id) {
    const { data: actor } = await db.from('users').select('name').eq('id', user.id).maybeSingle()
    const actorName = actor?.name?.trim() || 'Contractor'
    const notificationBody = `${actorName} posted a new ${payload.stage_tag} update.`

    const primaryNotification = await db.from('notifications').insert({
      user_id: project.customer_id,
      title: 'New site update posted',
      body: notificationBody,
      type: 'update_posted',
      project_id: projectId,
      update_id: inserted.id,
      is_read: false,
    })

    if (
      primaryNotification.error &&
      primaryNotification.error.message.toLowerCase().includes('update_id')
    ) {
      await db.from('notifications').insert({
        user_id: project.customer_id,
        title: 'New site update posted',
        body: notificationBody,
        type: 'update_posted',
        project_id: projectId,
        is_read: false,
      })
    }
  }

  return NextResponse.json({
    success: true,
    update: {
      id: inserted.id,
      project_id: inserted.project_id,
      posted_by: inserted.posted_by,
      description: inserted.description,
      stage_tag: inserted.stage_tag,
      photo_urls: inserted.photo_urls ?? [],
      materials_used:
        'materials_used' in inserted && typeof inserted.materials_used === 'string'
          ? inserted.materials_used
          : null,
      created_at: inserted.created_at,
    },
  })
}
