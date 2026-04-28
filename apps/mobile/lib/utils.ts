export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Same wording as web `UpdatesFeed` / `ProjectChat` style relative labels. */
export function relativeTime(dateValue: string): string {
  const diffMs = Date.now() - new Date(dateValue).getTime()
  const minutes = Math.floor(diffMs / (1000 * 60))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(dateValue).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function dateLabelForFeed(dateValue: string): string {
  const date = new Date(dateValue)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-IN', { month: 'long', day: 'numeric' })
}

export function chatDateSeparatorLabel(dateValue: string): string {
  const date = new Date(dateValue)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return 'Today'
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-IN', { month: 'long', day: 'numeric' })
}

export function formatMessageTime(dateValue: string): string {
  const date = new Date(dateValue)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()
  const time = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return time
  if (isYesterday) return `Yesterday ${time}`
  return `${date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}, ${time}`
}

export function formatPhoneIndian(phone?: string | null): string {
  if (!phone) return 'Not available'
  const digits = phone.replace(/\D/g, '')
  const local = digits.length >= 10 ? digits.slice(-10) : digits
  if (local.length !== 10) return phone
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`
}

export function relativeMonths(dateValue: string): string {
  const now = Date.now()
  const then = new Date(dateValue).getTime()
  const days = Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)))
  const months = Math.max(1, Math.floor(days / 30))
  return `${months} month${months === 1 ? '' : 's'} ago`
}

export function starText(avg: number): string {
  const rounded = Math.round(avg)
  const filled = '★'.repeat(Math.max(0, Math.min(5, rounded)))
  const empty = '☆'.repeat(5 - Math.max(0, Math.min(5, rounded)))
  return `${filled}${empty}`
}

export function notificationGroupLabel(dateValue: string): string {
  const date = new Date(dateValue)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString('en-IN', { month: 'long', day: 'numeric' })
}
