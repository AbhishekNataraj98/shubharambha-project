export const CONSTRUCTION_STAGES = [
  { value: 'foundation', label: 'Foundation', emoji: '⛏️',  progress: 10  },
  { value: 'plinth',     label: 'Plinth',     emoji: '🏗️', progress: 25  },
  { value: 'walls',      label: 'Walls',      emoji: '🧱', progress: 45  },
  { value: 'slab',       label: 'Slab',       emoji: '🪨', progress: 60  },
  { value: 'plastering', label: 'Plastering', emoji: '🖌️', progress: 80  },
  { value: 'finishing',  label: 'Finishing',  emoji: '✨',  progress: 100 },
] as const

export type ConstructionStage = 
  typeof CONSTRUCTION_STAGES[number]['value']
