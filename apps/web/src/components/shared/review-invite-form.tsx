'use client'

import { useEffect, useMemo, useState } from 'react'

type Props = {
  projectId: string
  revieweeId: string
  hasExistingReview?: boolean
  existingReview?: {
    rating: number
    comment: string | null
  } | null
}

const QUESTIONS = [
  { key: 'quality', label: 'Quality of work' },
  { key: 'response', label: 'Response time' },
  { key: 'behavior', label: 'Behavior' },
  { key: 'timeliness', label: 'Timeliness' },
  { key: 'workmanship', label: 'Workmanship' },
] as const

function parseStoredReview(comment: string | null, fallbackRating: number) {
  const parseScore = (label: string): number | null => {
    const match = comment?.match(new RegExp(`${label}:\\s*(\\d+(?:\\.\\d+)?)\\/5`, 'i'))
    if (!match) return null
    const value = Number(match[1])
    return Number.isFinite(value) ? Math.max(1, Math.min(5, Math.round(value))) : null
  }

  const fallback = Math.max(1, Math.min(5, Math.round(fallbackRating || 0)))
  const parsedComment = comment?.match(/Comment:\s*(.*)$/i)?.[1]?.trim() ?? ''

  return {
    quality: parseScore('Quality') ?? fallback,
    response: parseScore('Response') ?? fallback,
    behavior: parseScore('Behavior') ?? fallback,
    timeliness: parseScore('Timeliness') ?? fallback,
    workmanship: parseScore('Workmanship') ?? fallback,
    comment: parsedComment,
  }
}

export default function ReviewInviteForm({
  projectId,
  revieweeId,
  hasExistingReview = false,
  existingReview = null,
}: Props) {
  const [scores, setScores] = useState<Record<(typeof QUESTIONS)[number]['key'], number>>({
    quality: 0,
    response: 0,
    behavior: 0,
    timeliness: 0,
    workmanship: 0,
  })
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [hasReviewLocked, setHasReviewLocked] = useState(hasExistingReview)
  const [isEditing, setIsEditing] = useState(!hasExistingReview)

  useEffect(() => {
    setHasReviewLocked(hasExistingReview)
    if (hasExistingReview) setIsEditing(false)
  }, [hasExistingReview])

  const parsedExisting = useMemo(
    () => (existingReview ? parseStoredReview(existingReview.comment, existingReview.rating) : null),
    [existingReview]
  )

  useEffect(() => {
    if (!parsedExisting) return
    setScores({
      quality: parsedExisting.quality,
      response: parsedExisting.response,
      behavior: parsedExisting.behavior,
      timeliness: parsedExisting.timeliness,
      workmanship: parsedExisting.workmanship,
    })
    setComment(parsedExisting.comment)
  }, [parsedExisting])

  const submit = async () => {
    if (hasReviewLocked && !isEditing) return
    const hasMissingRating = Object.values(scores).some((value) => value < 1)
    if (hasMissingRating) {
      setMessage('Please select at least 1 star for every rating category.')
      return
    }
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
      setHasReviewLocked(true)
      setIsEditing(false)
    } catch {
      setMessage('Could not submit review')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold" style={{ color: '#1A1A1A' }}>Rate this professional</h3>
      {hasReviewLocked ? (
        <p className="mt-1 text-xs" style={{ color: '#6B7280' }}>
          You already reviewed this professional for this project.
        </p>
      ) : null}
      {hasReviewLocked && !isEditing ? (
        <button
          type="button"
          onClick={() => {
            setIsEditing(true)
            setMessage(null)
          }}
          className="mt-2 rounded-md border px-3 py-1.5 text-xs font-semibold"
          style={{ borderColor: '#E8590C', color: '#E8590C' }}
        >
          Edit existing review
        </button>
      ) : null}
      <div className="mt-3 space-y-3">
        {QUESTIONS.map((q) => (
          <div key={q.key} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-xs font-medium" style={{ color: '#7A6F66' }}>{q.label}</span>
              {scores[q.key] === 0 ? (
                <p className="mt-0.5 text-[11px]" style={{ color: '#9CA3AF' }}>
                  Not rated yet
                </p>
              ) : null}
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  disabled={hasReviewLocked && !isEditing}
                  onClick={() => setScores((prev) => ({ ...prev, [q.key]: star }))}
                  className="text-lg"
                  style={{
                    color: star <= scores[q.key] ? '#E8590C' : '#D1D5DB',
                    opacity: hasReviewLocked && !isEditing ? 0.6 : 1,
                  }}
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
        readOnly={hasReviewLocked && !isEditing}
        placeholder="Additional comments (optional)"
        className="mt-3 w-full rounded-md border p-2 text-sm"
        style={{
          borderColor: '#E5E7EB',
          backgroundColor: hasReviewLocked && !isEditing ? '#F9FAFB' : '#FFFFFF',
          color: hasReviewLocked && !isEditing ? '#6B7280' : 'inherit',
        }}
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={submitting || (hasReviewLocked && !isEditing)}
        className="mt-3 rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: '#E8590C' }}
      >
        {submitting ? 'Submitting...' : hasReviewLocked ? (isEditing ? 'Update review' : 'Review submitted') : 'Submit review'}
      </button>
      {message ? <p className="mt-2 text-xs" style={{ color: message.includes('success') ? '#166534' : '#B91C1C' }}>{message}</p> : null}
    </div>
  )
}

