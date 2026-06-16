export type OrphanP0OverlayCandidate = {
  pack_index: number
  source_decision_id: string | null
  filename: string
  basename_no_ext: string
  source_url: string | null
  sku_like_handle: string
  catalog_handle: string | null
  catalog_handle_mapping_status: string
  original_decision: string
  recommended_next_step: string
  do_not_auto_apply: boolean
  notes: string
  overlay_badge: string
  routable: boolean
  pending_reason?: string
  enrichment_status?: string
}

export type OrphanP0OverlayValidation = {
  total_input_candidates: number
  resolved_candidates: number
  pending_unresolved: number
  unique_resolved_catalog_handles: number
  co02_in_resolved: number
  co02_in_pending: number
  reject_noise_in_overlay: number
  do_not_auto_apply_all: boolean
  pending_handles: string[]
}

export type OrphanP0OverlayData = {
  review_tool: string
  overlay_id: string
  do_not_auto_apply: boolean
  created_at: string
  sources: { mapping: string; enrichment: string }
  validation: OrphanP0OverlayValidation
  resolved_candidates: OrphanP0OverlayCandidate[]
  pending_unresolved: OrphanP0OverlayCandidate[]
  by_catalog_handle: Record<string, OrphanP0OverlayCandidate[]>
}

export type OrphanP0OverlayPersistedState = {
  version: "1"
  savedAt: string
  focusedPackIndex: number | null
  focusedCatalogHandle: string | null
  routingNotes: Record<string, string>
}
