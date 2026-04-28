export type UserRole = 'customer' | 'contractor' | 'worker' | 'supplier'

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'cancelled'

export type ConstructionStage =
  | 'foundation'
  | 'plinth'
  | 'walls'
  | 'slab'
  | 'plastering'
  | 'finishing'

export type PaymentMode = 'cash' | 'upi' | 'bank_transfer' | 'cheque'

export type PaymentCategory = 'labour' | 'material' | 'contractor_fee' | 'other'

export interface User {
  id: string
  phone_number: string
  name: string
  role: UserRole
  city: string
  pincode: string
  profile_photo_url?: string
  bio?: string
  is_verified: boolean
  created_at: string
}

export interface Project {
  id: string
  customer_id: string
  contractor_id: string
  name: string
  address: string
  city: string
  status: ProjectStatus
  current_stage: ConstructionStage
  start_date: string
  expected_end_date?: string
  created_at: string
}

export interface Payment {
  id: string
  project_id: string
  recorded_by: string
  paid_to: string
  amount: number
  payment_mode: PaymentMode
  paid_to_category: PaymentCategory
  description: string
  receipt_url?: string
  status: 'pending_confirmation' | 'confirmed'
  paid_at: string
  created_at: string
}

export interface DailyUpdate {
  id: string
  project_id: string
  posted_by: string
  description: string
  stage_tag: ConstructionStage
  photo_urls: string[]
  created_at: string
}

export interface Message {
  id: string
  project_id: string
  sender_id: string
  content: string
  attachment_urls: string[]
  message_type: 'text' | 'photo' | 'system'
  created_at: string
}

import type { Database } from './supabase'

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type UserRow = Tables<'users'>
export type ProjectRow = Tables<'projects'>
export type PaymentRow = Tables<'payments'>
export type DailyUpdateRow = Tables<'daily_updates'>
export type MessageRow = Tables<'messages'>
export type ContractorProfileRow = Tables<'contractor_profiles'>
export type ShopRow = Tables<'shops'>
export type ProductRow = Tables<'products'>