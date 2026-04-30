import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Bell,
  Building,
  Camera,
  CheckCircle2,
  Heart,
  IndianRupee,
  MessageCircle,
  XCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import BottomNav from '@/components/shared/bottom-nav'

function iconForType(type: string) {
  if (type === 'payment_pending') {
    return { icon: IndianRupee, className: 'bg-amber-100 text-amber-600' }
  }
  if (type === 'payment_confirmed') {
    return { icon: CheckCircle2, className: 'bg-green-100 text-green-600' }
  }
  if (type === 'payment_declined') {
    return { icon: XCircle, className: 'bg-red-100 text-red-600' }
  }
  if (type === 'project_invite') {
    return { icon: Building, className: 'bg-orange-100 text-orange-600' }
  }
  if (type === 'update_liked') {
    return { icon: Heart, className: 'bg-pink-100 text-pink-600' }
  }
  if (type === 'update_commented' || type === 'update_replied') {
    return { icon: MessageCircle, className: 'bg-violet-100 text-violet-600' }
  }
  return { icon: Camera, className: 'bg-blue-100 text-blue-600' }
}

function groupLabel(dateValue: string) {
  const date = new Date(dateValue)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-IN', { month: 'long', day: 'numeric' })
}

export default async function NotificationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id,title,body,type,is_read,project_id,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const rows = notifications ?? []

  return (
    <div className="min-h-screen bg-[#F2EDE8] pb-24">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <h1 className="text-base font-semibold text-gray-900">Notifications</h1>
          <form action="/api/notifications/mark-all-read" method="post">
            <button type="submit" className="text-sm font-medium text-orange-500">
              Mark all read
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto w-full max-w-md px-4 py-3">
        {rows.length === 0 ? (
          <div className="mt-16 text-center">
            <Bell className="mx-auto h-16 w-16 text-gray-300" />
            <p className="mt-2 text-base font-medium text-gray-600">You&apos;re all caught up!</p>
            <p className="mt-1 text-sm text-gray-400">No new notifications</p>
          </div>
        ) : (
          rows.map((item, index) => {
            const prev = rows[index - 1]
            const showDate = !prev || groupLabel(prev.created_at) !== groupLabel(item.created_at)
            const visual = iconForType(item.type)
            const Icon = visual.icon
            return (
              <div key={item.id}>
                {showDate ? <p className="my-2 text-xs font-semibold text-gray-400">{groupLabel(item.created_at)}</p> : null}
                <Link
                  href={`/api/notifications/open/${item.id}`}
                  className={`mb-2 block rounded-2xl border p-3 ${
                    item.is_read
                      ? 'border-gray-100 bg-white'
                      : 'border-orange-100 border-l-4 border-l-orange-500 bg-orange-50'
                  }`}
                >
                  <div className="flex gap-3">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-full ${visual.className}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                      <p className="mt-0.5 text-sm text-gray-500">{item.body}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {new Date(item.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </Link>
              </div>
            )
          })
        )}
      </div>

      <BottomNav />
    </div>
  )
}
