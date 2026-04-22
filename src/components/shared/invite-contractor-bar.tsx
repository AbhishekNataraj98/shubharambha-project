'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type InviteContractorBarProps = {
  contractorId: string
  contractorName: string
  projectId?: string
}

type ProjectDraft = {
  project_name: string
  address: string
  city: string
  pincode: string
  project_type?: string
  estimated_budget?: number
  start_date?: string
}

export default function InviteContractorBar({
  contractorId,
  contractorName,
  projectId,
}: InviteContractorBarProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendInvite = async () => {
    if (isLoading) return
    const raw = sessionStorage.getItem('projectDraft')
    if (!raw) {
      setError('Project draft not found. Please create project details first.')
      return
    }

    let draft: ProjectDraft
    try {
      draft = JSON.parse(raw) as ProjectDraft
    } catch {
      setError('Invalid draft. Please start project creation again.')
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/invitations/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          contractor_id: contractorId,
          ...draft,
        }),
      })
      const payload = (await response.json()) as { error?: string; projectId?: string }
      if (!response.ok) {
        setError(payload.error ?? 'Failed to send invitation')
        return
      }

      sessionStorage.removeItem('projectDraft')
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Failed to send invitation')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed right-0 bottom-0 left-0 z-30 border-t border-gray-200 bg-orange-50 p-3">
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#E8590C]">Send Construction Invitation</p>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>
        <button
          type="button"
          onClick={sendInvite}
          disabled={isLoading}
          className="rounded-lg bg-[#E8590C] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isLoading ? 'Sending...' : `Invite ${contractorName}`}
        </button>
      </div>
    </div>
  )
}
