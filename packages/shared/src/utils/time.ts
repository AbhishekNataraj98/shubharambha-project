export function relativeTime(dateValue: string): string {
  const diffMs = Date.now() - new Date(dateValue).getTime()
  const minutes = Math.floor(diffMs / (1000 * 60))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateValue).toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
  })
}
