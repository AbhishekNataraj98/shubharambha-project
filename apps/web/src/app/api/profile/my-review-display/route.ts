import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

/** Reviews shown on the professional's own profile, with reviewer & project names (admin join — mobile RLS cannot read all reviewers). */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!profile || (profile.role !== 'contractor' && profile.role !== 'worker')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const admin = createAdminClient<Database>(supabaseUrl, serviceRoleKey)

  const { data: reviews, error } = await admin
    .from('reviews')
    .select('id,rating,comment,created_at,reviewer_id,project_id')
    .eq('reviewee_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const reviewRows = reviews ?? []
  const reviewerIds = Array.from(new Set(reviewRows.map((r) => r.reviewer_id)))
  const projectIds = Array.from(new Set(reviewRows.map((r) => r.project_id)))

  const { data: reviewerUsers } = reviewerIds.length
    ? await admin.from('users').select('id,name').in('id', reviewerIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const reviewerNameById = new Map((reviewerUsers ?? []).map((u) => [u.id, u.name]))

  const { data: projectRows } = projectIds.length
    ? await admin.from('projects').select('id,name').in('id', projectIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const projectNameById = new Map((projectRows ?? []).map((p) => [p.id, p.name]))

  const enriched = reviewRows.map((r) => ({
    id: r.id,
    rating: Number(r.rating),
    comment: r.comment,
    created_at: r.created_at,
    reviewer_name: String(reviewerNameById.get(r.reviewer_id) ?? '').trim() || 'Customer',
    project_name: String(projectNameById.get(r.project_id) ?? '').trim() || 'Project',
  }))

  return NextResponse.json({ reviews: enriched })
}
