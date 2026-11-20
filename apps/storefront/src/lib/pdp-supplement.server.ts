import "server-only"
import data from "./card-content-source-data.json"
import { buildPdpSupplement, supplementalTitlePresentation, type ContentRecord, type SupplementContext } from "./pdp-supplement-core"

export function selectedPdpSupplement(product: Record<string, unknown>, variantId: string | null, context: SupplementContext) {
  const records = data.rows as unknown as ContentRecord[]
  const selected = records.find(row => row.product_id === product.id && row.variant_id === variantId) ?? null
  return buildPdpSupplement(selected, product, variantId, context)
}

/** Server-only presentation from the same selected source-guarded content record. */
export function selectedPdpTitlePresentation(product: Record<string, unknown>, variantId: string | null, collection: string | null,
  title: Parameters<typeof supplementalTitlePresentation>[4]) {
  const records = data.rows as unknown as ContentRecord[]
  const selected = records.find(row => row.product_id === product.id && row.variant_id === variantId) ?? null
  return supplementalTitlePresentation(selected, product, variantId, collection, title)
}
