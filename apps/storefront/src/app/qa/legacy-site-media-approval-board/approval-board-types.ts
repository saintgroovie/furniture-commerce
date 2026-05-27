export type DesignerDecision = "approve" | "reject" | "needs_review" | "pending"

export type OperatorRole =
  | "front"
  | "front_3_4"
  | "side"
  | "detail"
  | "interior"
  | "scheme"
  | "unknown"

export type DuplicateStatus = "unchecked" | "not_duplicate" | "possible_duplicate" | "duplicate_reject"

export type TitleSource = "price_list" | "seed_products" | "normalized" | "filename_guess" | "unknown"

export type MotifSource =
  | "price_list"
  | "seed_products"
  | "normalized"
  | "title_parse"
  | "handle_prefix"
  | "operator_note"
  | "filename_guess"
  | "checklist_color"
  | "unknown"

export type DecorSource = MotifSource

export type DecorConfidence = "high" | "low" | "unknown"

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
  operator_role?: OperatorRole | null
  operator_duplicate_status?: DuplicateStatus | null
  operator_duplicate_note?: string
  product_title_source?: TitleSource | null
  product_identity_source?: TitleSource | null
  motif_source?: MotifSource | null
  expected_motif_from_sku_prefix?: string | null
  legacy_page_motif?: string | null
  operator_note_motif?: string | null
  resolved_motif?: string | null
  legacy_metadata_mismatch?: boolean
  operator_confirmed_motif?: boolean
  auto_role_guess?: OperatorRole | null
  auto_role_confidence?: "high" | "medium" | "low" | null
  auto_role_reason?: string | null
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

export type PoolMediaRef = {
  id: string
  kind: "inventory" | "seed" | "candidate_top"
  label: string
  filename: string | null
  preview_repo_rel: string | null
  preview_url: string | null
  source_type: string | null
}

export type SkuPoolContext = {
  handle: string
  sku: string | null
  collection: string | null
  product_title: string | null
  product_title_raw: string | null
  product_type_title: string | null
  product_title_source: TitleSource
  product_identity_source: TitleSource
  title_confidence: "high" | "low"
  collection_label: string | null
  category: string | null
  dimensions_label: string | null
  is_willie_winkie: boolean
  expected_motif_from_sku_prefix: string | null
  legacy_page_motif: string | null
  resolved_motif: string | null
  legacy_metadata_mismatch: boolean
  motif_subcollection: string | null
  motif_subcollection_expected: string | null
  motif_subcollection_observed: string | null
  catalog_code_label: string | null
  motif_source: MotifSource
  motif_confidence: DecorConfidence
  motif_mismatch: boolean
  decor_motif: string | null
  decor_motif_expected: string | null
  decor_motif_observed: string | null
  decor_source: DecorSource
  decor_confidence: DecorConfidence
  decor_mismatch: boolean
  existing_media: PoolMediaRef[]
  has_reference_media: boolean
}

export type PersistedItemState = {
  designer_decision: DesignerDecision
  notes: string
  operator_role?: OperatorRole | null
  operator_duplicate_status?: DuplicateStatus | null
  operator_duplicate_note?: string
}

export type BoardPersistedState = {
  version: 2
  savedAt: string
  decisions: Record<string, PersistedItemState>
}
