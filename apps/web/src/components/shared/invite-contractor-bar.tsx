'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type InviteContractorBarProps = {
  contractorId: string
  contractorName: string
  contractorCity?: string | null
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
  contractorCity,
  projectId,
}: InviteContractorBarProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendInvite = async () => {
    if (isLoading) return
    const yes = window.confirm(`Do you want to invite ${contractorName} for work?`)
    if (!yes) return
    let draft: ProjectDraft
    const raw = sessionStorage.getItem('projectDraft')
    if (!raw) {
      draft = {
        project_name: `Work with ${contractorName}`,
        address: 'Address to be updated',
        city: contractorCity || 'City',
        pincode: '000000',
      }
    } else {
      try {
        draft = JSON.parse(raw) as ProjectDraft
      } catch {
        setError('Invalid draft. Please start project creation again.')
        return
      }
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
    <div className="fixed right-0 bottom-0 left-0 z-30 px-4 py-3" style={{ backgroundColor: 'white', borderTop: '1px solid #E0D5CC' }}>
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-bold" style={{ color: '#1A1A1A' }}>
            Send Invitation
          </p>
          {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
        </div>
        <button
          type="button"
          onClick={sendInvite}
          disabled={isLoading}
          className="flex-shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60 hover:opacity-90"
          style={{ backgroundColor: '#E8590C' }}
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
