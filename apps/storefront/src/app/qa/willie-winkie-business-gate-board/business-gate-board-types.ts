export const TODO_OPERATOR = "TODO_OPERATOR"
export const REVIEW_VERSION = "1"
export const LS_KEY = "woodright:willie-winkie-business-gate-board:v1"

export type OperatorDecision =
  | "approve_for_seed"
  | "needs_more_info"
  | "exclude_from_pilot"
  | "TODO_OPERATOR"
  | ""

export type ProductType = "STANDARD" | "CONFIGURABLE" | "BESPOKE" | "TODO_OPERATOR" | ""
export type PublishPolicy = "draft" | "published" | "exclude" | "TODO_OPERATOR" | ""
export type VariantStrategy = "single_default" | "configurable_tiers" | "TODO_OPERATOR" | ""

export type GateRow = {
  handle: string
  sku: string
  collection: string
  motif_painting_name: string
  raw_legacy_title: string
  raw_legacy_category: string
  media_count: number
  available_roles: string
  static_sample_public_url: string
  static_sample_repo_path: string
  workbook_row_key: string
  workbook_product_code_ww: string
  price: string
  currency: string
  product_type: ProductType
  variant_strategy: VariantStrategy
  publish_policy: PublishPolicy
  operator_decision: OperatorDecision
  operator_note: string
  media_preview_urls?: string[]
  media_filenames?: string[]
  do_not_auto_apply: true
}

export type RowValidation = {
  handle: string
  is_seed_ready: boolean
  is_complete_for_approve: boolean
  missing_fields: string[]
  errors: string[]
  warnings: string[]
}

export type GateFilter =
  | "all"
  | "incomplete"
  | "seed_ready"
  | "needs_more_info"
  | "excluded"
  | "missing_price"
  | "missing_ww_mapping"
  | "by_motif"
  | "by_product_type"

export type GateBootstrap = {
  generated_at: string
  repo_root: string
  source_packet_path: string
  backend_static_base: string
  review_tool: "willie-winkie-business-gate-board"
  review_version: string
  row_count: number
  rows: GateRow[]
  acceptable_values: {
    product_type: string[]
    variant_strategy: string[]
    publish_policy: string[]
    operator_decision: string[]
  }
}

export type GateSummary = {
  total_rows: number
  approve_for_seed_count: number
  needs_more_info_count: number
  excluded_from_pilot_count: number
  missing_required_fields_count: number
  seed_ready_count: number
}
