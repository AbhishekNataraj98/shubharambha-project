export const USER_ROLES = [
  {
    value: 'customer',
    label: 'Customer',
    description: 'I want to build or renovate my home',
    emoji: '🏠',
  },
  {
    value: 'contractor',
    label: 'Contractor',
    description: 'I manage construction projects',
    emoji: '👷',
  },
  {
    value: 'worker',
    label: 'Worker',
    description: 'I am a skilled tradesperson',
    emoji: '🔧',
  },
  {
    value: 'supplier',
    label: 'Supplier',
    description: 'I sell building materials',
    emoji: '🏪',
  },
] as const

export type UserRole = typeof USER_ROLES[number]['value']
