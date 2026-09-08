/**
 * Pure resolver: slot config + already-priced catalog products → active items.
 *
 * Skips (each with an explicit reason for admin preview):
 * - product not found / not published
 * - BESPOKE classification
 * - not purchasable by sales policy (`purchase.can_purchase === false`)
 * - no native sale price (no price list or price list not lower)
 * - no usable image
 *
 * Order = slot `product_ids` order. No Medusa runtime imports.
 */
import {
  isSlotWithinSchedule,
  normalizeProductIds,
  type PromotionSlotRecord,
} from "./slot-contract"

export type PromotionSkipReason =
  | "not_found"
  | "unpublished"
  | "bespoke"
  | "not_purchasable"
  | "no_sale_price"
  | "no_image"

export type PromotionCandidateProduct = Record<string, unknown> & {
  id?: unknown
  status?: unknown
  thumbnail?: unknown
  images?: unknown
  variants?: unknown
  metadata?: unknown
  product_classification?: unknown
  purchase?: unknown
}

export type ResolvedPromotionItem = {
  product_id: string
  /** Buyer opening price (after tier multiplier) - what the cart charges. */
  sale_price: number
  /** Pre-sale opening price (same tier multiplier). */
  original_price: number
  /** Whole percent, rounded; 0 when not meaningful. */
  discount_percent: number
}

export type PromotionSkip = { product_id: string; reason: PromotionSkipReason }

export type PromotionResolution = {
  /** False when slot disabled / outside schedule (items are still empty). */
  active: boolean
  items: ResolvedPromotionItem[]
  skipped: PromotionSkip[]
}

function positive(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null
}

function hasUsableImage(product: PromotionCandidateProduct): boolean {
  if (typeof product.thumbnail === "string" && product.thumbnail.trim()) return true
  if (Array.isArray(product.images)) {
    return product.images.some(
      (img) =>
        img &&
        typeof img === "object" &&
        typeof (img as { url?: unknown }).url === "string" &&
        ((img as { url: string }).url as string).trim().length > 0
    )
  }
  return false
}

/**
 * Buyer opening prices. Prefers backend `buyer_default_configuration`
 * (tier-aware). Falls back to variants[0].calculated_price.
 */
export function resolvePromotionPrices(
  product: PromotionCandidateProduct
): { sale_price: number; original_price: number } | null {
  const meta =
    product.metadata && typeof product.metadata === "object"
      ? (product.metadata as Record<string, unknown>)
      : null
  const cfg = meta?.buyer_default_configuration as
    | { min_unit_price?: unknown; original_min_unit_price?: unknown }
    | undefined
  if (cfg) {
    const sale = positive(cfg.min_unit_price)
    const original = positive(cfg.original_min_unit_price)
    if (sale != null && original != null && original > sale) {
      return { sale_price: sale, original_price: original }
    }
    if (sale != null) return null
  }
  const variants = product.variants
  if (!Array.isArray(variants) || variants.length === 0) return null
  const v0 = variants[0] as Record<string, unknown> | null
  const cp = v0?.calculated_price as
    | {
        calculated_amount?: unknown
        original_amount?: unknown
        is_calculated_price_price_list?: unknown
      }
    | undefined
  if (!cp || cp.is_calculated_price_price_list !== true) return null
  const sale = positive(cp.calculated_amount)
  const original = positive(cp.original_amount)
  if (sale == null || original == null || original <= sale) return null
  return { sale_price: sale, original_price: original }
}

export function discountPercent(original: number, sale: number): number {
  if (!(original > 0) || !(sale > 0) || sale >= original) return 0
  return Math.round(((original - sale) / original) * 100)
}

export function classifyPromotionCandidate(
  product: PromotionCandidateProduct | undefined
): { ok: true; item: Omit<ResolvedPromotionItem, "product_id"> } | { ok: false; reason: PromotionSkipReason } {
  if (!product) return { ok: false, reason: "not_found" }
  if (product.status !== undefined && product.status !== "published") {
    return { ok: false, reason: "unpublished" }
  }
  const classification = product.product_classification as
    | { product_type?: unknown }
    | undefined
  if (classification?.product_type === "BESPOKE") {
    return { ok: false, reason: "bespoke" }
  }
  const purchase = product.purchase as { can_purchase?: unknown } | undefined
  if (purchase && purchase.can_purchase === false) {
    return { ok: false, reason: "not_purchasable" }
  }
  const prices = resolvePromotionPrices(product)
  if (!prices) return { ok: false, reason: "no_sale_price" }
  if (!hasUsableImage(product)) return { ok: false, reason: "no_image" }
  return {
    ok: true,
    item: {
      sale_price: prices.sale_price,
      original_price: prices.original_price,
      discount_percent: discountPercent(prices.original_price, prices.sale_price),
    },
  }
}

export function resolvePromotionItems(
  slot: PromotionSlotRecord | null,
  productsById: ReadonlyMap<string, PromotionCandidateProduct>,
  now: Date = new Date()
): PromotionResolution {
  if (!slot || !slot.enabled || !isSlotWithinSchedule(slot, now)) {
    return { active: false, items: [], skipped: [] }
  }
  const items: ResolvedPromotionItem[] = []
  const skipped: PromotionSkip[] = []
  for (const productId of normalizeProductIds(slot.product_ids)) {
    const verdict = classifyPromotionCandidate(productsById.get(productId))
    if (verdict.ok) {
      items.push({ product_id: productId, ...verdict.item })
    } else {
      skipped.push({ product_id: productId, reason: verdict.reason })
    }
  }
  return { active: true, items, skipped }
}
