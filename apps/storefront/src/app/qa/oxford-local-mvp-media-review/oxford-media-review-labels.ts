import type { OxfordBacklogClassification, OxfordReviewMediaItem, OxfordSkuReviewRow } from "@/lib/qa/oxford-local-mvp-media-review-types"

export function decisionOfLite(d: { decision?: string } | undefined): string {
  return d?.decision ?? "unset"
}

export function rowNeedsAttention(row: OxfordSkuReviewRow, decisions: Record<string, { decision?: string }>): boolean {
  if (row.gallery_review_backlog_urls.length > 0) return true
  for (const m of row.media_items) {
    if (m.confidence === "ambiguous") return true
    if (decisionOfLite(decisions[m.media_key]) === "unset") return true
  }
  return false
}

/** Sidebar + SKU panel: short status for designers. */
export function skuRowHumanStatus(
  row: OxfordSkuReviewRow,
  decisions: Record<string, { decision?: string }>
): "Ready" | "Needs review" | "Missing product" | "No media" | "Ambiguous" {
  if (!row.product_in_local_medusa_db) return "Missing product"
  if (row.review_status === "no_media_candidates") return "No media"
  if (
    row.review_status === "has_ambiguous_media" ||
    row.gallery_review_backlog_urls.length > 0 ||
    row.media_items.some((m) => m.confidence === "ambiguous")
  ) {
    return "Ambiguous"
  }
  if (rowNeedsAttention(row, decisions)) return "Needs review"
  return "Ready"
}

export function humanConfidence(c?: string | null): string {
  const x = (c ?? "").toLowerCase()
  if (x === "confirmed") return "Confirmed"
  if (x === "probable") return "Probable"
  if (x === "ambiguous") return "Ambiguous"
  if (x === "unassigned") return "Unassigned"
  if (x === "rejected") return "Rejected"
  return c ? c.replace(/_/g, " ") : "Unknown"
}

export function humanSourceKind(sk?: string | null): string {
  const s = (sk ?? "").toLowerCase()
  if (s.includes("backend_static") || s === "backend_static") return "Static"
  if (s.includes("pdf")) return "PDF"
  if (s.includes("legacy") || s.includes("front")) return "Legacy"
  if (s.includes("operator")) return "Operator disk"
  if (s.includes("downloaded")) return "Downloaded"
  if (s.includes("processed")) return "Processed"
  if (s.includes("upload")) return "Upload"
  return sk ? sk.replace(/_/g, " ") : "Source"
}

export function humanMediaClass(mc?: string | null): string {
  const s = (mc ?? "").toLowerCase()
  if (s.includes("white_background")) return "White-bg candidate"
  if (s.includes("interim")) return "Interim"
  if (s.includes("pdf")) return "PDF crop"
  if (s.includes("legacy")) return "Legacy"
  if (s.includes("lifestyle")) return "Lifestyle"
  return mc ? mc.replace(/_/g, " ") : "Unknown"
}

export function humanSuggestedNextAction(m: OxfordReviewMediaItem): string {
  const c = m.backlog_classification as OxfordBacklogClassification | null | undefined
  switch (c) {
    case "source_not_mounted":
      return "Mount Yandex/WOODRIGHT"
    case "manifest_only_legacy_reference":
      return "Keep as legacy reference"
    case "missing_local_file":
      return "Find file manually"
    case "needs_source_recovery":
      return "Find file manually"
    case "unsupported_reference":
      return "Ignore for now"
    case "not_actionable_in_visual_review":
      return "Ignore for now"
    default:
      if (m.preview_status === "source_not_mounted") return "Mount Yandex/WOODRIGHT"
      if (m.preview_status === "manifest_only_no_local_file") return "Keep as legacy reference"
      return "Find file manually"
  }
}

export function humanBacklogReasonShort(m: OxfordReviewMediaItem): string {
  const c = m.backlog_classification
  if (c === "source_not_mounted") return "Source not mounted"
  if (c === "manifest_only_legacy_reference") return "Manifest only"
  if (c === "missing_local_file") return "Missing local file"
  if (c === "unsupported_reference") return "Unsupported path"
  if (c === "needs_source_recovery") return "Needs source recovery"
  return m.preview_error_reason?.trim() || "No preview"
}

export function isExternalAbsolutePath(m: OxfordReviewMediaItem): boolean {
  const p = (m.source_display || m.debug_source_path || "").trim()
  return /^(\/Users\/|\/Volumes\/|\/WOODRIGHT)/i.test(p)
}

export function decisionSummary(
  decisions: Record<string, { decision?: string }>,
  mediaKeys: string[]
): {
  primary: number
  gallery: number
  move: number
  remove: number
  whiteBgLater: number
  doNotUse: number
  other: number
} {
  let primary = 0,
    gallery = 0,
    move = 0,
    remove = 0,
    whiteBgLater = 0,
    doNotUse = 0,
    other = 0
  for (const k of mediaKeys) {
    const d = decisionOfLite(decisions[k])
    if (d === "unset") continue
    if (d === "keep_as_primary") primary++
    else if (d === "keep_in_gallery") gallery++
    else if (d === "move_to_other_sku") move++
    else if (d === "remove_from_assignment") remove++
    else if (d === "needs_white_bg_replacement") whiteBgLater++
    else if (d === "do_not_use" || d === "do_not_use_reference") doNotUse++
    else other++
  }
  return { primary, gallery, move, remove, whiteBgLater, doNotUse, other }
}

export function rowDecisionCount(row: OxfordSkuReviewRow, decisions: Record<string, { decision?: string }>): number {
  return row.media_items.filter((m) => decisionOfLite(decisions[m.media_key]) !== "unset").length
}
