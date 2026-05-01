'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

type ContractorProfileBackButtonProps = {
  projectId?: string | null
  fallbackHref: string
  /** Translucent control for dark hero covers */
  overlay?: boolean
}

export default function ContractorProfileBackButton({
  projectId,
  fallbackHref,
  overlay,
}: ContractorProfileBackButtonProps) {
  const router = useRouter()

  const className = overlay
    ? 'inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/30 bg-white/15 text-white shadow-none backdrop-blur-[2px]'
    : 'mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full border bg-white/90 text-gray-800 shadow-sm'
  const style = overlay ? undefined : ({ borderColor: '#FFEAD8' as const })

  const icon = (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )

  if (projectId) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        aria-label="Back"
        onClick={() => router.back()}
      >
        {icon}
      </button>
    )
  }

  return (
    <Link href={fallbackHref} className={className} style={style} aria-label="Back">
      {icon}
    </Link>
  )
}
