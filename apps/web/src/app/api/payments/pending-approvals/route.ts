import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!profile || (profile.role !== 'contractor' && profile.role !== 'worker')) {
    return NextResponse.json({ items: [] })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: rows, error } = await admin
    .from('payments')
    .select('id,project_id,amount,paid_to_category,created_at')
    .eq('paid_to', user.id)
    .eq('status', 'pending_confirmation')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const projectIds = Array.from(new Set((rows ?? []).map((row) => row.project_id)))
  const { data: projects } = projectIds.length
    ? await admin.from('projects').select('id,name').in('id', projectIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const projectNameById = new Map((projects ?? []).map((project) => [project.id, project.name]))

  return NextResponse.json({
    items: (rows ?? []).map((row) => ({
      ...row,
      project_name: projectNameById.get(row.project_id) ?? 'Project',
    })),
  })
}
