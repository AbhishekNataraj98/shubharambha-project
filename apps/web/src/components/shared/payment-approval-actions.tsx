'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type PaymentApprovalActionsProps = {
  projectId: string
  paymentId: string
}

export default function PaymentApprovalActions({ projectId, paymentId }: PaymentApprovalActionsProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState<'approve' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const respond = async (action: 'approve' | 'decline') => {
    setIsSubmitting(action)
    setError(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/payments/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: paymentId, action }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        setError(payload.error ?? 'Could not process payment')
        return
      }
      router.refresh()
    } catch {
      setError('Could not process payment')
    } finally {
      setIsSubmitting(null)
    }
  }

  return (
    <div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={isSubmitting !== null}
          onClick={() => respond('approve')}
          className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isSubmitting === 'approve' ? 'Approving...' : 'Approve'}
        </button>
        <button
          type="button"
          disabled={isSubmitting !== null}
          onClick={() => respond('decline')}
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isSubmitting === 'decline' ? 'Declining...' : 'Decline'}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
