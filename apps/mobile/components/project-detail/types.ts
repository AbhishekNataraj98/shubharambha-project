export type UpdateItem = {
  id: string
  projectId: string
  postedBy: string
  posterName: string
  description: string
  stageTag: string
  photoUrls: string[]
  materialsUsed: string | null
  createdAt: string
}

export type FeedbackComment = {
  id: string
  updateId: string
  userId: string
  userName: string
  content: string
  createdAt: string
  parentCommentId: string | null
  replies: FeedbackComment[]
}

export type FeedbackState = {
  likesCount: number
  likedByCurrentUser: boolean
  comments: FeedbackComment[]
}

export type ChatMessage = {
  id: string
  projectId: string
  senderId: string
  senderName: string
  content: string
  messageType: 'text' | 'photo' | 'system' | string
  attachmentUrls: string[]
  createdAt: string
}

export type PaymentItem = {
  id: string
  amount: number
  paidToId?: string
  paidToRole?: string | null
  paidToCategory: 'labour' | 'material' | 'contractor_fee' | 'other'
  paymentMode: 'cash' | 'upi' | 'bank_transfer' | 'cheque'
  description: string | null
  status: 'pending_confirmation' | 'confirmed' | 'declined' | 'rejected'
  paidToName: string
  receiptUrl: string | null
  paidAt: string
  createdAt: string
  recordedBy: string
  recordedByName: string
  declineReason: string | null
}

export type PaymentsFilter = 'all' | 'confirmed' | 'pending' | 'declined'

export type PaymentFormData = {
  amount: number
  category?: 'labour' | 'material' | 'contractor_fee' | 'other'
  paid_to?: string
  payment_stage:
    | 'advance'
    | 'plinth'
    | 'brickwork'
    | 'woodwork'
    | 'gf_lintel'
    | 'gf_roof'
    | 'ff_lintel'
    | 'ff_roof'
    | 'sf_lintel'
    | 'sf_rcc'
    | 'plastering'
    | 'flooring'
    | 'painting'
    | 'completion'
  payment_mode: 'cash' | 'upi' | 'bank_transfer' | 'cheque'
  paid_at: string
  description?: string
}

export type DetailTab = 'updates' | 'payments' | 'chat' | 'reports'

export const STAGE_ORDER = [
  'foundation',
  'plinth',
  'walls',
  'slab',
  'plastering',
  'finishing',
] as const

export type StageKey = (typeof STAGE_ORDER)[number]

export const STAGE_LABELS: Record<StageKey, string> = {
  foundation: 'Foundation',
  plinth: 'Plinth',
  walls: 'Walls',
  slab: 'Slab',
  plastering: 'Plastering',
  finishing: 'Finishing',
}
