export const PROJECT_DRAFT_STORAGE_KEY = 'project_draft'

export type ProjectDraft = {
  project_name: string
  address: string
  city: string
  pincode: string
  project_type: string
  estimated_budget?: number
  start_date?: string
}
