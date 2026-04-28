import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWebNotificationTarget } from '@/lib/notification-target'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { id } = await params
  const { data: notification } = await supabase
    .from('notifications')
    .select('id,project_id,payment_id,update_id,type')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!notification) return NextResponse.redirect(new URL('/notifications', request.url))

  await supabase.from('notifications').update({ is_read: true }).eq('id', notification.id).eq('user_id', user.id)

  const target = getWebNotificationTarget(notification)
  return NextResponse.redirect(new URL(target, request.url))
}
