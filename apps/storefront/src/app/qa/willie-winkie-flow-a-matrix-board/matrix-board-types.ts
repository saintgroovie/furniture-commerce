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

export type WorkbookConfidence = "exact" | "likely" | "weak"

export type WorkbookCandidate = {
  candidate_id: string
  source_sheet: string
  workbook_row_key: string
  workbook_product_code: string
  candidate_title: string
  painting_name: string | null
  category: string | null
  category_raw: string | null
  price: number | null
  currency: string | null
  confidence: WorkbookConfidence
  why_matched: string[]
  raw_row_excerpt: Record<string, unknown>
}

export type HandleCandidates = {
  handle: string
  candidates: WorkbookCandidate[]
  has_workbook_source: boolean
  best_confidence: WorkbookConfidence | null
}

export type CandidatesPayload = {
  generated_at: string
  parsed_sheets_path: string
  workbook_rows: number
  by_handle: HandleCandidates[]
}

export type FieldSource = "source" | "manual"

export type RowFieldSources = Partial<Record<keyof MatrixRow, FieldSource>>
