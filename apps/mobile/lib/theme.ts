/** Visual tokens aligned with `apps/web` dashboard / bottom-nav. */
export const colors = {
  background: '#F2EDE8',
  foreground: '#2C2C2A',
  muted: '#78716C',
  mutedLight: '#A8A29E',
  border: '#E0D5CC',
  brand: '#D85A30',
  brandDark: '#B8471F',
  white: '#FFFFFF',
  rolePillBg: '#FBF0EB',
  emptyBg: '#FAF5F0',
  inviteBg: '#FBF0EB',
  green: '#166534',
  red: '#991B1B',
  cardBg: '#FFFFFF',
  cardBorder: '#E8DDD4',
  headerBg: '#2C2C2A',
  inputBg: '#FFFFFF',
  pageBg: '#F2EDE8',
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
  if (status === 'active') return { backgroundColor: '#DCFCE7', color: '#166534' }
  if (status === 'pending' || status === 'on_hold') return { backgroundColor: '#FEF3C7', color: '#92400E' }
  if (status === 'completed') return { backgroundColor: '#F2EDE8', color: '#78716C' }
  if (status === 'cancelled') return { backgroundColor: '#FEE2E2', color: '#991B1B' }
  return { backgroundColor: '#F2EDE8', color: '#78716C' }
}

export function statusBarColor(status: string) {
  if (status === 'on_hold') return '#F59E0B'
  if (status === 'active') return '#166534'
  if (status === 'completed') return '#78716C'
  if (status === 'cancelled') return '#991B1B'
  return '#E0D5CC'
}
