'use client'

import { useState } from 'react'

type Props = {
  projectId: string
  revieweeId: string
}

const QUESTIONS = [
  { key: 'quality', label: 'Quality of work' },
  { key: 'response', label: 'Response time' },
  { key: 'behavior', label: 'Behavior' },
  { key: 'timeliness', label: 'Timeliness' },
  { key: 'workmanship', label: 'Workmanship' },
] as const

export default function ReviewInviteForm({ projectId, revieweeId }: Props) {
  const [scores, setScores] = useState<Record<(typeof QUESTIONS)[number]['key'], number>>({
    quality: 5,
    response: 5,
    behavior: 5,
    timeliness: 5,
    workmanship: 5,
  })
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const submit = async () => {
    setSubmitting(true)
    setMessage(null)
    try {
      const response = await fetch('/api/reviews/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          reviewee_id: revieweeId,
          ...scores,
          comment,
        }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        setMessage(payload.error ?? 'Could not submit review')
        return
      }
      setMessage('Review submitted successfully.')
    } catch {
      setMessage('Could not submit review')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold" style={{ color: '#1A1A1A' }}>Rate this professional</h3>
      <div className="mt-3 space-y-3">
        {QUESTIONS.map((q) => (
          <div key={q.key} className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium" style={{ color: '#7A6F66' }}>{q.label}</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setScores((prev) => ({ ...prev, [q.key]: star }))}
                  className="text-lg"
                  style={{ color: star <= scores[q.key] ? '#E8590C' : '#D1D5DB' }}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Additional comments (optional)"
        className="mt-3 w-full rounded-md border p-2 text-sm"
        style={{ borderColor: '#E5E7EB' }}
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={submitting}
        className="mt-3 rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: '#E8590C' }}
      >
        {submitting ? 'Submitting...' : 'Submit review'}
      </button>
      {message ? <p className="mt-2 text-xs" style={{ color: message.includes('success') ? '#166534' : '#B91C1C' }}>{message}</p> : null}
    </div>
  )
}

