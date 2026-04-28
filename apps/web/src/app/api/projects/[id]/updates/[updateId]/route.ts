import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; updateId: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId, updateId } = await params
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!profile || (profile.role !== 'contractor' && profile.role !== 'worker')) {
    return NextResponse.json({ error: 'Only contractors/workers can delete updates' }, { status: 403 })
  }

  const { data: update } = await admin
    .from('daily_updates')
    .select('id,project_id,posted_by')
    .eq('id', updateId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (!update) return NextResponse.json({ error: 'Update not found' }, { status: 404 })
  if (update.posted_by !== user.id) {
    return NextResponse.json({ error: 'You can only delete your own updates' }, { status: 403 })
  }

  const { data: deletedRows, error } = await admin
    .from('daily_updates')
    .delete()
    .eq('id', updateId)
    .eq('project_id', projectId)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!deletedRows || deletedRows.length === 0) {
    return NextResponse.json({ error: 'Delete failed or update already removed' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
