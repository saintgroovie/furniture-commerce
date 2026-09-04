import { collectProductImageUrls } from "./media-health"
import { productHasRubPrice } from "./price-sanity"
import type { AttentionCounts, ProductReadinessSummary } from "./seller-product-types"
import { computeSiteReadiness, type ProductType } from "./site-readiness"

export type { AttentionCounts, ProductReadinessSummary }

function resolveClassification(product: Record<string, unknown>): ProductType {
  const cls = product.product_classification as { product_type?: string } | undefined
  const t = cls?.product_type
  if (t === "STANDARD" || t === "CONFIGURABLE" || t === "BESPOKE") return t
  return "UNKNOWN"
}

function productHasMedia(product: Record<string, unknown>): boolean {
  const thumbnail = product.thumbnail
  if (typeof thumbnail === "string" && thumbnail.trim()) return true
  return collectProductImageUrls(product).length > 0
}

/**
 * List-oriented seller summary. Visibility comes from `computeSiteReadiness`
 * (no RoomSet / static-file checks). Extra codes are list-only (price/media).
 */
export function summarizeProductReadiness(
  product: Record<string, unknown>
): ProductReadinessSummary {
  const detailed = computeSiteReadiness(product)
  const published = detailed.product.status === "published"
  const visible =
    detailed.storefront.visible_in_catalog ||
    detailed.storefront.visible_in_kids ||
    detailed.storefront.visible_in_project
  const has_price = productHasRubPrice(product)
  const has_media = productHasMedia(product)
  const classification = resolveClassification(product)

  const codes: string[] = []
  const seen = new Set<string>()
  const push = (code: string) => {
    if (seen.has(code)) return
    seen.add(code)
    codes.push(code)
  }

  if (!published) push("draft")
  if (!has_media) push("missing_media")
  if (!has_price && classification !== "BESPOKE") push("missing_price")
  if (published && !visible) push("published_invisible")

  for (const warning of detailed.warnings) {
    push(warning.code)
  }

  const warning_count = detailed.warnings.filter((w) => w.severity === "warning").length
  const error_count = detailed.warnings.filter((w) => w.severity === "error").length

  return {
    published,
    visible,
    has_price,
    has_media,
    warning_count,
    error_count,
    codes,
  }
}

export function aggregateAttention(summaries: ProductReadinessSummary[]): AttentionCounts {
  const counts: AttentionCounts = {
    missing_media: 0,
    missing_price: 0,
    drafts: 0,
    published_invisible: 0,
    not_ready: 0,
  }
  for (const summary of summaries) {
    if (summary.codes.includes("missing_media")) counts.missing_media += 1
    if (summary.codes.includes("missing_price")) counts.missing_price += 1
    if (summary.codes.includes("draft")) counts.drafts += 1
    if (summary.codes.includes("published_invisible")) counts.published_invisible += 1
  }
  return counts
}
