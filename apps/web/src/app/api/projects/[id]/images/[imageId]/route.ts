import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId, imageId } = await params
  const access = await getProjectAndMembership(projectId, user.id)
  if (!access.allowed || !access.project) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: image, error: imageError } = await supabase
    .from('project_images')
    .select('id,project_id,uploaded_by')
    .eq('id', imageId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (imageError || !image) return NextResponse.json({ error: 'Image not found' }, { status: 404 })

  const canDelete =
    image.uploaded_by === user.id ||
    access.project.customer_id === user.id ||
    access.project.contractor_id === user.id
  if (!canDelete) return NextResponse.json({ error: 'Only uploader/customer/contractor can delete image' }, { status: 403 })

  const { error } = await supabase
    .from('project_images')
    .delete()
    .eq('id', imageId)
    .eq('project_id', projectId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
