'use client'

import { useState } from 'react'
import { METRIC_CONFIG, parseReviewComment, reviewListingTimeLabel, reviewMetricScore } from '@/lib/utils'

/** Warmer, lighter than charcoal — review card header */
const REVIEW_CARD_HEADER_BG = '#4a423c'

function StarRatingStrip({ rating }: { rating: number }) {
  const r = Math.min(5, Math.max(0, rating))
  return (
    <span className="inline-flex items-center leading-none text-[#F59E0B]">
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.min(1, Math.max(0, r - i))
        return (
          <span
            key={i}
            className="relative inline-flex h-[11px] w-[9px] shrink-0 items-center justify-start overflow-hidden text-[10px] leading-none"
          >
            <span className="pointer-events-none absolute left-0 top-0 text-[10px] opacity-[0.38]">☆</span>
            <span
              className="relative inline-flex overflow-hidden"
              style={{ width: `${fill * 100}%`, maxWidth: '100%' }}
            >
              <span className="inline-block w-[9px] shrink-0 whitespace-nowrap text-left">★</span>
            </span>
          </span>
        )
      })}
    </span>
  )
}

export type ConceptBReviewCardRow = {
  id: string
  rating: number
  comment: string | null
  created_at: string
  reviewer_id: string
  project_id: string
}

type ConceptBReviewCardsProps = {
  reviews: ConceptBReviewCardRow[]
  reviewerNameById: Record<string, string>
}

export default function ConceptBReviewCards({ reviews, reviewerNameById }: ConceptBReviewCardsProps) {
  const [nowMs] = useState(() => Date.now())

  return (
    <>
      {reviews.map((review) => {
        const parsed = parseReviewComment(review.comment)
        const reviewerName = (reviewerNameById[review.reviewer_id] ?? '').trim() || 'Customer'
        const rating = Number(review.rating)
        const timeAgo = reviewListingTimeLabel(review.created_at, nowMs)
        const initial = reviewerName.charAt(0).toUpperCase()

        return (
          <div
            key={review.id}
            className="overflow-hidden rounded-[14px] bg-white shadow-[0_1px_0_rgba(44,44,42,0.04)]"
            style={{ border: '0.5px solid #E8DDD4' }}
          >
            <div
              className="flex items-center gap-2.5 rounded-t-[14px] px-3 py-2.5"
              style={{ backgroundColor: REVIEW_CARD_HEADER_BG }}
            >
              <div
                className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold text-white"
                style={{
                  backgroundColor: '#D85A30',
                  border: '2px solid rgba(255,255,255,0.18)',
                }}
              >
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold text-white">{reviewerName}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <StarRatingStrip rating={rating} />
                  <span className="text-[10px] font-bold text-white">{rating.toFixed(1)}</span>
                  <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    ·
                  </span>
                  <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.65)' }}>
                    {timeAgo}
                  </span>
                </div>
              </div>
            </div>
            <div
              className="flex flex-wrap gap-1 bg-white px-2.5 pb-2 pt-2"
              style={{
                borderBottom: parsed.comment || parsed.overallComment ? '0.5px solid #F2EDE8' : 'none',
              }}
            >
              {METRIC_CONFIG.map((metric) => {
                const score = reviewMetricScore(parsed, metric.key)
                if (score === null) return null
                const isFull = score === 5
                return (
                  <div
                    key={metric.key}
                    className="flex items-center gap-0.5 rounded-full px-2 py-1"
                    style={{
                      backgroundColor: isFull ? '#F0FDF4' : '#FBF0EB',
                      border: `0.5px solid ${isFull ? '#BBF7D0' : '#F5DDD4'}`,
                    }}
                  >
                    <span className="text-[10px]">{metric.emoji}</span>
                    <span className="text-[9px] font-semibold" style={{ color: '#2C2C2A' }}>
                      {metric.label}
                    </span>
                    <span className="text-[9px] font-extrabold" style={{ color: isFull ? '#166534' : '#D85A30' }}>
                      {score}/5
                    </span>
                  </div>
                )
              })}
            </div>
            {parsed.comment || parsed.overallComment ? (
              <div className="bg-white px-2.5 pb-2.5 pt-0">
                <div
                  className="rounded-lg px-2.5 py-2"
                  style={{
                    backgroundColor: '#FBF0EB',
                    borderLeftWidth: 3,
                    borderLeftStyle: 'solid',
                    borderLeftColor: '#D85A30',
                  }}
                >
                  <p className="text-[11px] italic leading-snug" style={{ color: '#78716C' }}>
                    {`"${parsed.comment ?? parsed.overallComment}"`}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
    </>
  )
}
