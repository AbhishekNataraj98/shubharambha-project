'use client'

import Link from 'next/link'
import NotificationBell from '@/components/shared/NotificationBell'

function initialsFromName(name?: string | null) {
  if (!name) return 'U'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'U'
}

export default function AppTopHeader({
  userId,
  profileName,
}: {
  userId: string | null
  profileName?: string | null
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-orange-600/30 bg-[#E8590C]">
      <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="inline-flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-sm font-extrabold text-white">
            S
          </span>
          <span className="text-base font-extrabold text-white">Shubharambha</span>
        </Link>
        <div className="flex items-center gap-2">
          {userId ? <NotificationBell userId={userId} /> : null}
          <Link
            href="/profile"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white"
            aria-label="Profile"
          >
            {initialsFromName(profileName)}
          </Link>
        </div>
      </div>
    </header>
  )
}
