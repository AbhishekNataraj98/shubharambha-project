'use client'

import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

type NotificationBellProps = {
  userId: string
}

export default function NotificationBell({ userId }: NotificationBellProps) {
  const router = useRouter()
  const supabase = createClient()
  const [count, setCount] = useState(0)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    const loadCount = async () => {
      const { count: unread } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false)
      setCount(unread ?? 0)
    }
    const timer = window.setTimeout(() => {
      void loadCount()
    }, 0)

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          setCount((prev) => prev + 1)
          setPulse(true)
          const title = String(payload.new.title ?? 'New notification')
          const body = String(payload.new.body ?? '')
          toast(title, { description: body })
          window.setTimeout(() => setPulse(false), 1500)
        }
      )
      .subscribe()

    return () => {
      window.clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [supabase, userId])

  return (
    <button
      type="button"
      onClick={() => router.push('/notifications')}
      className="relative rounded-full p-2 text-gray-500 hover:bg-gray-100"
      aria-label="Notifications"
    >
      <Bell className="h-5 w-5" />
      {count > 0 ? (
        <span
          className={`absolute -top-0.5 -right-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ${
            pulse ? 'animate-pulse' : ''
          }`}
        >
          {count > 9 ? '9+' : count}
        </span>
      ) : null}
    </button>
  )
}
