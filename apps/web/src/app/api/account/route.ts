import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function DELETE() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) return fail('Unauthorized', 401)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return fail('Server is missing Supabase admin credentials', 500)

  const admin = createAdminClient<Database>(supabaseUrl, serviceRoleKey)
  const userId = user.id

  // Delete projects owned by this customer first (and project-linked data)
  const { data: ownedProjects, error: ownedProjectsError } = await admin
    .from('projects')
    .select('id')
    .eq('customer_id', userId)
  if (ownedProjectsError) return fail(ownedProjectsError.message)

  const ownedProjectIds = (ownedProjects ?? []).map((row) => row.id)
  if (ownedProjectIds.length > 0) {
    const { error: e1 } = await admin.from('daily_updates').delete().in('project_id', ownedProjectIds)
    if (e1) return fail(e1.message)
    const { error: e2 } = await admin.from('messages').delete().in('project_id', ownedProjectIds)
    if (e2) return fail(e2.message)
    const { error: e3 } = await admin.from('payments').delete().in('project_id', ownedProjectIds)
    if (e3) return fail(e3.message)
    const { error: e4 } = await admin.from('project_members').delete().in('project_id', ownedProjectIds)
    if (e4) return fail(e4.message)
    const { error: e5 } = await admin.from('projects').delete().in('id', ownedProjectIds)
    if (e5) return fail(e5.message)
  }

  // Remove direct user-linked rows
  const { error: e6 } = await admin.from('project_members').delete().eq('user_id', userId)
  if (e6) return fail(e6.message)
  const { error: e7 } = await admin.from('messages').delete().eq('sender_id', userId)
  if (e7) return fail(e7.message)
  const { error: e8 } = await admin.from('daily_updates').delete().eq('posted_by', userId)
  if (e8) return fail(e8.message)
  const { error: e9 } = await admin.from('reviews').delete().eq('reviewer_id', userId)
  if (e9) return fail(e9.message)
  const { error: e10 } = await admin.from('reviews').delete().eq('reviewee_id', userId)
  if (e10) return fail(e10.message)
  const { error: e11 } = await admin.from('enquiries').delete().eq('customer_id', userId)
  if (e11) return fail(e11.message)
  const { error: e12 } = await admin.from('enquiries').delete().eq('recipient_id', userId)
  if (e12) return fail(e12.message)
  const { error: e13 } = await admin.from('notifications').delete().eq('user_id', userId)
  if (e13) return fail(e13.message)

  // Detach contractor assignments and role-specific profiles
  const { error: e14 } = await admin.from('projects').update({ contractor_id: null }).eq('contractor_id', userId)
  if (e14) return fail(e14.message)
  const { error: e15 } = await admin.from('contractor_profiles').delete().eq('user_id', userId)
  if (e15) return fail(e15.message)
  const { error: e16 } = await admin.from('worker_profiles').delete().eq('user_id', userId)
  if (e16) return fail(e16.message)
  const { error: e17 } = await admin.from('shops').delete().eq('owner_id', userId)
  if (e17) return fail(e17.message)
  const { error: e18 } = await admin.from('users').delete().eq('id', userId)
  if (e18) return fail(e18.message)

  const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId)
  if (deleteAuthError) return fail(deleteAuthError.message)

  return NextResponse.json({ success: true })
}

