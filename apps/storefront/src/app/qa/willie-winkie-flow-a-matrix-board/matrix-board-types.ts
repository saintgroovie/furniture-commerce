export const TODO_OPERATOR = "TODO_OPERATOR"

export type OperatorDecision = "approve" | "reject" | "hold" | "TODO_OPERATOR" | ""
export type MedusaProductType = "STANDARD" | "CONFIGURABLE" | "BESPOKE" | "TODO_OPERATOR" | ""
export type PublishStatus = "draft" | "published" | "TODO_OPERATOR" | ""
export type VariantStrategy = "single_default" | "configurable_tiers" | "TODO_OPERATOR" | ""

export type MatrixRow = {
  handle: string
  painting_prefix: string
  legacy_title: string
  legacy_collection_hint: string
  proposed_medusa_collection: string
  proposed_category: string
  legacy_cs_cart_product_id: string
  flow_a_media_count: string
  workbook_row_key: string
  workbook_product_code: string
  painting_name: string
  medusa_product_type: MedusaProductType
  variant_strategy: VariantStrategy
  price_rub: string
  compare_at_price_rub: string
  currency: string
  status_draft_or_published: PublishStatus
  category_seed_needed: string
  ingestion_allowed: string
  operator_decision: OperatorDecision
  operator_notes: string
  media_filenames?: string[]
  media_preview_urls?: string[]
}

export type RowValidation = {
  handle: string
  is_complete_for_approve: boolean
  is_valid_approve: boolean
  missing_fields: string[]
  errors: string[]
  warnings: string[]
}

export type MatrixBootstrap = {
  generated_at: string
  repo_root: string
  filled_csv_path: string
  template_meta: Record<string, unknown>
  rows: MatrixRow[]
  governance: Record<string, unknown>
  acceptable_values: Record<string, string[]>
}

export type MatrixReadiness = {
  generated_at: string
  readiness: boolean
  seed_draft_allowed_later: boolean
  total_rows: number
  approve_count: number
  reject_count: number
  hold_count: number
  pending_decision_count: number
  rows_ready_for_approve: number
  rows_blocked: number
  mandatory_filled_cells: number
  mandatory_total_cells: number
  row_validations: RowValidation[]
  reason: string
}

export type DecisionFilter = "all" | "approve" | "hold" | "reject" | "missing" | "ready"
