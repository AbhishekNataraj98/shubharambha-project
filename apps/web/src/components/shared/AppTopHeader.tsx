'use client'

import Link from 'next/link'
import NotificationBell from '@/components/shared/NotificationBell'

export default function AppTopHeader({
  userId,
}: {
  userId: string | null
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#F5DDD4] bg-[#2C2C2A]">
      <div className="mx-auto grid w-full max-w-md grid-cols-[40px_1fr_40px] items-center px-4 py-3">
        <Link
          href="/profile"
          className="inline-flex h-10 w-10 items-center justify-center justify-self-start rounded-full bg-white/20 text-sm font-bold text-white"
          aria-label="Profile"
        >
          <span className="text-xl leading-none">👤</span>
        </Link>

        <Link href="/dashboard" className="inline-flex items-center justify-self-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
            <img src="/icons/logo-white.svg" alt="Shubharambha" className="h-5 w-5" />
          </div>
          <span className="text-base font-extrabold text-white">Shubharambha</span>
        </Link>

        <div className="justify-self-end">{userId ? <NotificationBell userId={userId} /> : <div className="h-10 w-10" />}</div>
      </div>
    </header>
  )
}
