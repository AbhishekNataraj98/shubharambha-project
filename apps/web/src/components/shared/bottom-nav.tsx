'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

type NavItem = {
  label: string
  href: string
  icon: ReactNode
  activeWhen: (pathname: string) => boolean
}

const items: NavItem[] = [
  {
    label: 'Home',
    href: '/dashboard',
    activeWhen: (pathname) => pathname === '/dashboard',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path d="M3 11.5L12 4l9 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M6.5 10.5V20h11V10.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    label: 'Projects',
    href: '/projects',
    activeWhen: (pathname) => pathname.startsWith('/projects'),
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path d="M3.5 7.5h6l1.5 2h9.5v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    label: 'Search',
    href: '/contractors',
    activeWhen: (pathname) => pathname.startsWith('/contractors'),
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M16.5 16.5L21 21" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    label: 'Profile',
    href: '/profile',
    activeWhen: (pathname) => pathname.startsWith('/profile'),
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5.5 20c.8-3.1 3.2-5 6.5-5s5.7 1.9 6.5 5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed right-0 bottom-0 left-0 bg-white" style={{ borderTop: '1px solid #E0D5CC' }}>
      <div className="mx-auto grid w-full max-w-md grid-cols-4 px-2 py-3">
        {items.map((item) => {
          const active = item.activeWhen(pathname)
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-1 transition-colors"
              style={{ color: active ? '#E8590C' : '#999' }}
            >
              {item.icon}
              <span className={`text-xs ${active ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
