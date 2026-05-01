import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Matches mobile profile formatting */
export function formatPhoneIndian(phone?: string | null): string {
  if (!phone) return 'Not available'
  const digits = phone.replace(/\D/g, '')
  const local = digits.length >= 10 ? digits.slice(-10) : digits
  if (local.length !== 10) return phone
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`
}

export type ParsedReview = {
  quality: number | null
  response: number | null
  behavior: number | null
  timeliness: number | null
  workmanship: number | null
  comment: string | null
  overallComment: string | null
}

export const METRIC_CONFIG = [
  { key: 'quality', label: 'Quality', emoji: '🔨' },
  { key: 'response', label: 'Response', emoji: '⚡' },
  { key: 'behavior', label: 'Behavior', emoji: '🤝' },
  { key: 'timeliness', label: 'Timeliness', emoji: '⏱️' },
  { key: 'workmanship', label: 'Workmanship', emoji: '🏆' },
] as const

export type MetricConfigKey = (typeof METRIC_CONFIG)[number]['key']

export function reviewMetricScore(parsed: ParsedReview, key: MetricConfigKey): number | null {
  switch (key) {
    case 'quality':
      return parsed.quality
    case 'response':
      return parsed.response
    case 'behavior':
      return parsed.behavior
    case 'timeliness':
      return parsed.timeliness
    case 'workmanship':
      return parsed.workmanship
  }
}

/** Parses pipe-separated review metrics + optional Comment suffix stored in `reviews.comment`. */
export function parseReviewComment(raw: string | null | undefined): ParsedReview {
  if (!raw) {
    return {
      quality: null,
      response: null,
      behavior: null,
      timeliness: null,
      workmanship: null,
      comment: null,
      overallComment: null,
    }
  }

  const parts = raw.split('|').map((s) => s.trim())

  const result: ParsedReview = {
    quality: null,
    response: null,
    behavior: null,
    timeliness: null,
    workmanship: null,
    comment: null,
    overallComment: null,
  }

  for (const part of parts) {
    const lower = part.toLowerCase()
    const scoreMatch = part.match(/:\s*(\d+)\/5/)
    const score = scoreMatch ? parseInt(scoreMatch[1]!, 10) : null

    if (lower.startsWith('quality')) result.quality = score
    else if (lower.startsWith('response')) result.response = score
    else if (lower.startsWith('behavior')) result.behavior = score
    else if (lower.startsWith('timeliness')) result.timeliness = score
    else if (lower.startsWith('workmanship')) result.workmanship = score
    else if (lower.startsWith('comment:')) {
      result.comment = part.replace(/^comment:\s*/i, '').trim()
    }
  }

  const hasMetrics =
    result.quality !== null ||
    result.response !== null ||
    result.behavior !== null ||
    result.timeliness !== null ||
    result.workmanship !== null

  if (!hasMetrics) {
    result.overallComment = raw
  }

  return result
}

/** Relative time for review list headers (matches Concept B mock). */
export function reviewListingTimeLabel(iso: string, nowMs: number): string {
  const months = Math.floor((nowMs - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30))
  if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`
  return 'Recently'
}

export function formatReviewsSectionCount(count: number): string {
  if (count === 1) return '1 review'
  return `${count} reviews`
}
