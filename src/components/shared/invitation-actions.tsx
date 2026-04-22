'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type InvitationActionsProps = {
  projectId: string
}

export default function InvitationActions({ projectId }: InvitationActionsProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState<'accept' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const respond = async (action: 'accept' | 'decline') => {
    setIsSubmitting(action)
    setError(null)
    try {
      const response = await fetch('/api/invitations/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, action }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        setError(payload.error ?? 'Could not process invitation')
        return
      }
      router.refresh()
    } catch {
      setError('Could not process invitation')
    } finally {
      setIsSubmitting(null)
    }
  }

  return (
    <div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={isSubmitting !== null}
          onClick={() => respond('accept')}
          className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {isSubmitting === 'accept' ? 'Accepting...' : 'Accept'}
        </button>
        <button
          type="button"
          disabled={isSubmitting !== null}
          onClick={() => respond('decline')}
          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {isSubmitting === 'decline' ? 'Declining...' : 'Decline'}
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
