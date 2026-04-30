import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const CUSTOMER_LIMIT = 7
const PROFESSIONAL_LIMIT = 20
const TOTAL_LIMIT = 27

const createImageSchema = z.object({
  image_url: z.string().trim().url('Invalid image URL'),
})

async function getProjectAndMembership(projectId: string, userId: string) {
  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id,customer_id,contractor_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return { allowed: false as const, project: null }
  if (project.customer_id === userId || project.contractor_id === userId) {
    return { allowed: true as const, project }
  }
  const { data: member } = await supabase
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  return { allowed: Boolean(member), project }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params
  const access = await getProjectAndMembership(projectId, user.id)
  if (!access.allowed) {
    const { data: actor } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
    if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: actor } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  const { data: rows, error } = await supabase
    .from('project_images')
    .select('id,project_id,image_url,uploaded_by,created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const uploaderIds = Array.from(new Set((rows ?? []).map((row) => row.uploaded_by)))
  const { data: uploaders } = uploaderIds.length
    ? await supabase.from('users').select('id,name,role').in('id', uploaderIds)
    : { data: [] as Array<{ id: string; name: string; role: string }> }
  const uploaderMap = new Map((uploaders ?? []).map((row) => [row.id, row.name]))

  let customerCount = 0
  let professionalCount = 0
  for (const row of rows ?? []) {
    if (row.uploaded_by === access.project?.customer_id) customerCount += 1
    else professionalCount += 1
  }

  return NextResponse.json({
    images: (rows ?? []).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      imageUrl: row.image_url,
      uploadedBy: row.uploaded_by,
      uploaderName: uploaderMap.get(row.uploaded_by) ?? 'Project member',
      createdAt: row.created_at,
    })),
    actorRole: actor?.role ?? null,
    counts: {
      customer: customerCount,
      professional: professionalCount,
      total: (rows ?? []).length,
    },
    limits: {
      customer: CUSTOMER_LIMIT,
      professional: PROFESSIONAL_LIMIT,
      total: TOTAL_LIMIT,
    },
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params
  const access = await getProjectAndMembership(projectId, user.id)
  if (!access.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: actor } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!actor || (actor.role !== 'customer' && actor.role !== 'contractor' && actor.role !== 'worker')) {
    return NextResponse.json({ error: 'Only customer/contractor/worker can upload project images' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = createImageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 })
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('project_images')
    .select('id,uploaded_by')
    .eq('project_id', projectId)
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 400 })
  }

  let customerCount = 0
  let professionalCount = 0
  for (const row of existingRows ?? []) {
    if (row.uploaded_by === access.project?.customer_id) customerCount += 1
    else professionalCount += 1
  }
  const totalCount = (existingRows ?? []).length

  if (totalCount >= TOTAL_LIMIT) {
    return NextResponse.json(
      { error: '27 threshold limit reached, upload only after deleting existing image' },
      { status: 400 }
    )
  }

  if (actor.role === 'customer' && customerCount >= CUSTOMER_LIMIT) {
    return NextResponse.json(
      { error: '7 threshold limit reached, customer can upload only after deleting existing image' },
      { status: 400 }
    )
  }

  if ((actor.role === 'contractor' || actor.role === 'worker') && professionalCount >= PROFESSIONAL_LIMIT) {
    return NextResponse.json(
      { error: '20 threshold limit reached, contractor/worker can upload only after deleting existing image' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('project_images')
    .insert({
      project_id: projectId,
      image_url: parsed.data.image_url,
      uploaded_by: user.id,
    })
    .select('id,project_id,image_url,uploaded_by,created_at')
    .single()
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to upload image' }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    image: {
      id: data.id,
      projectId: data.project_id,
      imageUrl: data.image_url,
      uploadedBy: data.uploaded_by,
      uploaderName: actor.role === 'customer' ? 'Customer' : actor.role === 'contractor' ? 'Contractor' : 'Worker',
      createdAt: data.created_at,
    },
  })
}
