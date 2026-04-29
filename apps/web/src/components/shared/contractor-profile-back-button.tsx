'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

type ContractorProfileBackButtonProps = {
  projectId?: string | null
  fallbackHref: string
}

export default function ContractorProfileBackButton({ projectId, fallbackHref }: ContractorProfileBackButtonProps) {
  const router = useRouter()

  const className =
    'mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full border bg-white/90 text-gray-800 shadow-sm'
  const style = { borderColor: '#FFEAD8' as const }

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
