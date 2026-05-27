import type { SkuPoolContext } from "./approval-board-types"
import {
  expectedMotifFromSkuPrefix,
  isKnownWwSkuPrefix,
  wwHandlePrefix,
} from "./api/_lib/ww-sku-prefix-motifs"

/** Legacy checklist collection slugs that are WW motifs, not top-level collections. */
export const WW_MOTIF_COLLECTION_SLUGS = new Set(["molly"])

export function normalizeTopLevelCollection(
  handle: string,
  rawCollection: string | null | undefined
): string | null {
  if (!rawCollection && !handle) return null
  const h = handle.toLowerCase()
  const raw = (rawCollection || "").toLowerCase()
  const prefix = wwHandlePrefix(h)

  if (raw === "willie-winkie") return "willie-winkie"
  if (prefix && isKnownWwSkuPrefix(prefix)) return "willie-winkie"
  if (WW_MOTIF_COLLECTION_SLUGS.has(raw)) return "willie-winkie"

  return rawCollection || null
}

export function isWillieWinkieTaxonomy(
  handle: string,
  collection: string | null | undefined,
  ctx?: Pick<SkuPoolContext, "is_willie_winkie" | "collection">
): boolean {
  if (ctx?.is_willie_winkie) return true
  if (normalizeTopLevelCollection(handle, collection) === "willie-winkie") return true
  return false
}

export function resolvedMotifLabel(
  handle: string,
  ctx?: Pick<
    SkuPoolContext,
    "resolved_motif" | "expected_motif_from_sku_prefix" | "motif_subcollection"
  >
): string | null {
  return (
    ctx?.resolved_motif ??
    ctx?.expected_motif_from_sku_prefix ??
    ctx?.motif_subcollection ??
    expectedMotifFromSkuPrefix(handle) ??
    null
  )
}
