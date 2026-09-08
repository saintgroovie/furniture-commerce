import { getBaseUrl, medusaFetch } from "./base"

export type PromotionSlotItem = {
  product_id: string
  /** Buyer opening price (tier-aware) - what the cart charges. */
  sale_price: number
  original_price: number
  discount_percent: number
  /** Catalog browse DTO (same shape as `/store/catalog-products`). */
  product: Record<string, unknown>
}

export type PromotionSlotPayload = {
  slot: {
    id: string
    key: string
    label: string | null
    rotation_interval_ms: number
    updated_at: string | null
  } | null
  items: PromotionSlotItem[]
}

const EMPTY: PromotionSlotPayload = { slot: null, items: [] }

/**
 * Catalog Promotion Window payload. Fail-open for the catalog: any error →
 * empty payload (the grid renders without the card).
 *
 * Always `no-store`: the card advertises a discount, and PDP / cart pricing is
 * uncached, so the promo must never outlive a sale that the seller just ended
 * or changed. The payload is tiny (≤ 6 products, one targeted graph query).
 */
export async function getPromotionSlot(): Promise<PromotionSlotPayload> {
  try {
    const res = await medusaFetch(`${getBaseUrl()}/store/woodright/promotion-slot`)
    if (!res.ok) return EMPTY
    const json = (await res.json()) as Partial<PromotionSlotPayload> | null
    if (!json || !json.slot || !Array.isArray(json.items)) return EMPTY
    const items = json.items.filter(
      (i): i is PromotionSlotItem =>
        Boolean(i) &&
        typeof i.product_id === "string" &&
        typeof i.sale_price === "number" &&
        typeof i.original_price === "number" &&
        Boolean(i.product) &&
        typeof i.product === "object"
    )
    if (items.length === 0) return EMPTY
    return { slot: json.slot, items }
  } catch {
    return EMPTY
  }
}
