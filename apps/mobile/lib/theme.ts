/** Visual tokens aligned with `apps/web` dashboard / bottom-nav. */
export const colors = {
  background: '#FAFAFA',
  foreground: '#1A1A1A',
  muted: '#7A6F66',
  mutedLight: '#999999',
  border: '#E0D5CC',
  brand: '#E8590C',
  brandDark: '#C44A0A',
  white: '#FFFFFF',
  rolePillBg: '#FFF8F5',
  emptyBg: '#FFFBF7',
  inviteBg: '#FEF3E2',
  green: '#4CAF50',
  red: '#F44336',
} as const

export const stageProgress: Record<string, number> = {
  foundation: 10,
  plinth: 25,
  walls: 45,
  slab: 60,
  plastering: 80,
  finishing: 100,
}

export const customerStatusLabel: Record<string, string> = {
  on_hold: 'Awaiting contractor',
  pending: 'Awaiting contractor',
  active: 'In Progress',
  completed: 'Completed',
  cancelled: 'Contractor declined',
}

export function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function initialsFromName(name?: string | null) {
  if (!name) return 'U'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'U'
}

export function daysAgoText(dateValue?: string) {
  if (!dateValue) return 'No updates yet'
  const now = Date.now()
  const then = new Date(dateValue).getTime()
  const diffDays = Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)))
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

export function statusPillStyles(status: string) {
  if (status === 'active') return { backgroundColor: '#E8F5E9', color: '#2E7D32' }
  if (status === 'pending' || status === 'on_hold') return { backgroundColor: '#FEF3E2', color: '#B8860B' }
  if (status === 'completed') return { backgroundColor: '#F5F5F5', color: '#616161' }
  if (status === 'cancelled') return { backgroundColor: '#FFEBEE', color: '#C62828' }
  return { backgroundColor: '#F5F5F5', color: '#616161' }
}

export function statusBarColor(status: string) {
  if (status === 'on_hold') return '#F59E0B'
  if (status === 'active') return '#10B981'
  if (status === 'completed') return '#6B7280'
  if (status === 'cancelled') return '#EF4444'
  return colors.border
}
