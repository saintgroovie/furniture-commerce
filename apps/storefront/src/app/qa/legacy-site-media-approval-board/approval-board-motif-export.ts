import { buildCandidateMotifView } from "./approval-board-operator-motif"
import type { ChecklistItem, SkuPoolContext } from "./approval-board-types"

export function enrichItemMotifFields(
  item: ChecklistItem,
  ctx: SkuPoolContext | undefined
): Partial<ChecklistItem> {
  if (!ctx?.is_willie_winkie && item.collection !== "willie-winkie") {
    return {
      product_identity_source: ctx?.product_identity_source ?? item.product_identity_source ?? null,
      motif_source: ctx?.motif_source ?? item.motif_source ?? null,
    }
  }
  const view = buildCandidateMotifView(ctx, item)
  return {
    expected_motif_from_sku_prefix: view.expected_motif_from_sku_prefix,
    legacy_page_motif: view.legacy_page_motif,
    operator_note_motif: view.operator_note_motif,
    resolved_motif: view.resolved_motif,
    legacy_metadata_mismatch: view.legacy_metadata_mismatch,
    operator_confirmed_motif: view.operator_confirmed_motif,
    motif_source: view.motif_source,
    product_identity_source: ctx?.product_identity_source ?? item.product_identity_source ?? null,
  }
}
