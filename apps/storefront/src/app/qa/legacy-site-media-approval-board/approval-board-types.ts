export type DesignerDecision = "approve" | "reject" | "needs_review" | "pending"

export type ChecklistItem = {
  candidate_id: string
  handle: string
  filename: string
  url: string
  source_page: string
  collection: string
  role_guess: string
  color_guess: string
  confidence: number
  proposed_status?: string
  designer_decision: DesignerDecision
  notes: string
  do_not_auto_apply?: boolean
  local_preview?: string | null
  download_status?: string
}

export type ChecklistPayload = {
  generated_at?: string
  candidate_count?: number
  default_decision?: string
  reviewed_at?: string
  review_tool?: string
  source_pack_path?: string
  items: ChecklistItem[]
  _meta?: {
    repo_root?: string
    pack_dir?: string
    checklist_path?: string
  }
}

export type DecisionFilter = "all" | DesignerDecision

export type BoardPersistedState = {
  version: 1
  savedAt: string
  decisions: Record<string, { designer_decision: DesignerDecision; notes: string }>
}
