/**
 * Buyer-facing sale price from native Medusa pricing.
 *
 * Source of truth is the backend: `variants[0].calculated_price` (price list)
 * and the tier-aware `metadata.buyer_default_configuration.original_min_unit_price`.
 * The storefront never computes a discount from unrelated data - if the backend
 * does not confirm a lower price-list amount, there is no sale to show.
 */

export type SalePrice = {
  /** What the buyer pays (already the opening / tier-aware price). */
  amount: number
  /** Pre-sale price with the same tier multiplier. */
  originalAmount: number
  /** Whole percent, rounded. */
  percent: number
}

function positive(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Original (pre-sale) opening price for a product, or null when no sale.
 * Order: backend default configuration → variants[0].calculated_price.
 */
export function resolveOriginalOpeningPrice(
  product: Record<string, unknown>
): number | null {
  const meta = product.metadata as Record<string, unknown> | undefined
  const cfg = meta?.buyer_default_configuration as
    | { min_unit_price?: unknown; original_min_unit_price?: unknown }
    | undefined
  if (cfg && typeof cfg === "object") {
    const sale = positive(cfg.min_unit_price)
    const original = positive(cfg.original_min_unit_price)
    if (sale != null) return original != null && original > sale ? original : null
  }
  return resolveOriginalBasePrice(product)
}

export function salePercent(original: number, sale: number): number {
  if (!(original > 0) || !(sale > 0) || sale >= original) return 0
  return Math.round(((original - sale) / original) * 100)
}

/**
 * Combine an already-resolved buyer price with the backend original.
 * `amount` must be the price the buyer actually pays for this presentation
 * (card opening price, PDP configured price, …).
 */
export function resolveSalePrice(
  product: Record<string, unknown>,
  amount: number | null | undefined
): SalePrice | null {
  if (amount == null || !(amount > 0)) return null
  const original = resolveOriginalOpeningPrice(product)
  if (original == null || original <= amount) return null
  return { amount, originalAmount: original, percent: salePercent(original, amount) }
}

/**
 * Raw (pre-tier) original variant price for PDP: pairs with `getPrice()`
 * (= `calculated_amount`) so both go through the same material × color formula.
 * Null when no native price list lowers the price.
 */
export function resolveOriginalBasePrice(
  product: Record<string, unknown>
): number | null {
  const variants = product.variants as Array<Record<string, unknown>> | undefined
  const cp = variants?.[0]?.calculated_price as
    | {
        calculated_amount?: unknown
        original_amount?: unknown
        is_calculated_price_price_list?: unknown
      }
    | undefined
  if (!cp || cp.is_calculated_price_price_list !== true) return null
  const sale = positive(cp.calculated_amount)
  const original = positive(cp.original_amount)
  return sale != null && original != null && original > sale ? original : null
}
