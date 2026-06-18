export type OrphanDecision =
  | "map_candidate"
  | "reject_noise"
  | "needs_more_context"
  | "blocked_cross_sku"
  | "content_request"
  | "pending"

export type PriorityTier = "P0_review_first" | "P1_white_bg_sku" | "P2_possible_product" | "P3_low_noise_or_ambiguous"

export type OrphanDuplicateMatch = {
  inventory_id: string
  filename: string
  match_kind: "exact_basename" | "normalized_basename"
}

export type OrphanExistingMediaPreview = {
  url: string
  basename: string
  source: "board_product" | "candidate_pool"
}

export type OrphanEnrichment = {
  duplicate_evidence: {
    has_evidence: boolean
    matches: OrphanDuplicateMatch[]
  }
  sku_context: {
    handle: string | null
    title: string | null
    collection: string | null
    in_assignment_board: boolean
    assignment_board_url: string | null
    candidate_pool_count: number
    existing_media: OrphanExistingMediaPreview[]
  }
  precheck_summary: string
}

export type ReviewRow = {
  source_id: string
  source_kind: "yandex_public" | "legacy_site" | string
  basename: string
  source_url: string | null
  source_path: string | null
  source_page_url: string | null
  local_cache_path?: string | null
  legacy_cache_provenance: string | null
  legacy_newly_included: boolean | null
  sku_guess: string | null
  handle_guess: string | null
  collection_guess: string | null
  role_guess: string | null
  color_guess: string | null
  classification_status: string
  classification_reason: string | null
  priority_score: number
  priority_tier: PriorityTier
  priority_reasons: string[]
  cross_sku_risk: boolean
  why_not_safe: string
  preview_url: string | null
  enrichment: OrphanEnrichment
  operator_decision: OrphanDecision
  operator_notes: string
}

export type DashboardStats = {
  total_queue_rows: number
  p0_count: number
  needs_manual_mapping_count: number
  newly_included_legacy_count: number
  stable_safe_supplement_count: number
  co02_missing_targets: string[]
}

export type BootstrapPayload = {
  generated_at: string
  audit_variant: string
  stats: DashboardStats
  items: ReviewRow[]
  _meta: {
    repo_root: string
    audit_dir: string
    queue_path: string
    manifest_path: string
  }
}

export type ExportPayload = {
  generated_at: string
  review_tool: "source-media-orphan-review-board"
  do_not_auto_apply: true
  source_orphan_review_only: true
  not_product_media_assignment: true
  audit_variant: string
  item_count: number
  decisions: Array<{
    source_id: string
    basename: string
    source_url: string | null
    operator_decision: OrphanDecision
    operator_notes: string
    priority_tier: PriorityTier
    classification_status: string
    do_not_auto_apply: true
    source_orphan_review_only: true
    not_product_media_assignment: true
  }>
}
