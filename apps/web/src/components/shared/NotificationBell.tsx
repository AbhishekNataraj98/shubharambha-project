'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Bell, Building, Camera, CheckCircle2, Heart, IndianRupee, MessageCircle, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getWebNotificationTarget } from '@/lib/notification-target'

type NotificationBellProps = {
  userId: string
}

type NotificationItem = {
  id: string
  title: string
  body: string
  type: string
  is_read: boolean
  project_id: string | null
  payment_id: string | null
  update_id: string | null
  created_at: string
}

function iconForType(type: string) {
  if (type === 'payment_pending') return { icon: IndianRupee, className: 'bg-amber-100 text-amber-600' }
  if (type === 'payment_confirmed') return { icon: CheckCircle2, className: 'bg-green-100 text-green-600' }
  if (type === 'payment_declined') return { icon: XCircle, className: 'bg-red-100 text-red-600' }
  if (type === 'project_invite') return { icon: Building, className: 'bg-orange-100 text-orange-600' }
  if (type === 'update_liked') return { icon: Heart, className: 'bg-pink-100 text-pink-600' }
  if (type === 'update_commented' || type === 'update_replied') {
    return { icon: MessageCircle, className: 'bg-violet-100 text-violet-600' }
  }
  return { icon: Camera, className: 'bg-blue-100 text-blue-600' }
}

export default function NotificationBell({ userId }: NotificationBellProps) {
  const router = useRouter()
  const supabase = createClient()
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [pulse, setPulse] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const channelNameRef = useRef(`notifications:${userId}:${Math.random().toString(36).slice(2, 8)}`)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const loadCount = async () => {
      const { count: unread } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false)
      setCount(unread ?? 0)
    }
    const loadLatest = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id,title,body,type,is_read,project_id,payment_id,update_id,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10)
      setItems((data ?? []) as NotificationItem[])
    }
    const timer = window.setTimeout(() => {
      void loadCount()
      void loadLatest()
    }, 0)

    const channel = supabase
      .channel(channelNameRef.current)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            setCount((prev) => prev + 1)
            setPulse(true)
            const title = String(payload.new.title ?? 'New notification')
            const body = String(payload.new.body ?? '')
            toast(title, { description: body })
            window.setTimeout(() => setPulse(false), 1500)
          }
          await Promise.all([loadCount(), loadLatest()])
        }
      )
      .subscribe()

    return () => {
      window.clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [supabase, userId])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const openNotification = async (item: NotificationItem) => {
    const wasRead = item.is_read
    if (!wasRead) {
      setCount((prev) => Math.max(0, prev - 1))
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, is_read: true } : row)))
      try {
        await fetch('/api/notifications/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notification_id: item.id }),
        })
      } catch {
        // Navigation still proceeds if mark-read fails.
      }
    }
    setOpen(false)
    const target = getWebNotificationTarget(item)
    router.push(target)
  }

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications/mark-all-read', { method: 'POST' })
      setCount(0)
      setItems((prev) => prev.map((item) => ({ ...item, is_read: true })))
    } catch {
      // Keep menu functional even if this fails.
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
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

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-gray-200 bg-white shadow-xl transition-all duration-200">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-base font-semibold text-gray-900">Notifications</span>
            <button type="button" onClick={() => void markAllRead()} className="text-sm font-medium text-orange-500">
              Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto px-2 py-2">
            {items.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-gray-500">No notifications yet</p>
            ) : (
              items.map((item) => (
                (() => {
                  const visual = iconForType(item.type)
                  const Icon = visual.icon
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void openNotification(item)}
                      className={`mb-2 block w-full rounded-2xl border p-3 text-left ${
                        item.is_read ? 'border-gray-100 bg-white' : 'border-orange-100 border-l-4 border-l-orange-500 bg-orange-50'
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
                    </button>
                  )
                })()
                
              ))
            )}
          </div>
          <div className="border-t border-gray-100 px-4 py-3 text-right">
            <Link href="/notifications" className="text-sm font-semibold text-orange-600" onClick={() => setOpen(false)}>
              See more
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
