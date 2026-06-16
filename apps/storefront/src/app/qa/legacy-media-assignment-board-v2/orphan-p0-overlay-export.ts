import type { OrphanP0OverlayCandidate, OrphanP0OverlayData } from "./orphan-p0-overlay-types"
import type { OrphanP0OverlayPersistedState } from "./orphan-p0-overlay-types"

export type OrphanP0OverlayExport = {
  version: "1"
  exported_at: string
  overlay_id: string
  do_not_auto_apply: true
  review_meta: {
    scope: "orphan_p0_assignment_board_v2_overlay"
    local_dev_only: true
    production_rollout: false
    not_product_media_assignment: true
  }
  summary: {
    resolved_candidates: number
    pending_unresolved: number
    focused_pack_index: number | null
    focused_catalog_handle: string | null
  }
  routing_plan: Array<{
    pack_index: number
    sku_like_handle: string
    catalog_handle: string | null
    filename: string
    source_url: string | null
    mapping_status: string
    routable: boolean
    operator_note: string | null
  }>
  pending_unresolved: OrphanP0OverlayCandidate[]
}

export function buildOrphanP0OverlayExport(
  data: OrphanP0OverlayData,
  overlayState: OrphanP0OverlayPersistedState
): OrphanP0OverlayExport {
  return {
    version: "1",
    exported_at: new Date().toISOString(),
    overlay_id: data.overlay_id,
    do_not_auto_apply: true,
    review_meta: {
      scope: "orphan_p0_assignment_board_v2_overlay",
      local_dev_only: true,
      production_rollout: false,
      not_product_media_assignment: true,
    },
    summary: {
      resolved_candidates: data.validation.resolved_candidates,
      pending_unresolved: data.validation.pending_unresolved,
      focused_pack_index: overlayState.focusedPackIndex,
      focused_catalog_handle: overlayState.focusedCatalogHandle,
    },
    routing_plan: data.resolved_candidates.map((c) => ({
      pack_index: c.pack_index,
      sku_like_handle: c.sku_like_handle,
      catalog_handle: c.catalog_handle,
      filename: c.filename,
      source_url: c.source_url,
      mapping_status: c.catalog_handle_mapping_status,
      routable: true,
      operator_note: overlayState.routingNotes[String(c.pack_index)] ?? null,
    })),
    pending_unresolved: data.pending_unresolved,
  }
}
