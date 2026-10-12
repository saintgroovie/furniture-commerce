import { orderedSparseVariants, sparseVariantMap } from "./sparse-variant-map"

export function formatRub(amount: number): string {
  return amount.toLocaleString("ru-RU") + " ₽"
}

/** Short customer-facing order number (Medusa display_id, not internal order_… id). */
export function getOrderDisplayNumber(order: Record<string, unknown>): string {
  const custom = order.custom_display_id
  if (custom != null && String(custom).trim()) {
    return String(custom)
  }
  const displayId = order.display_id
  if (displayId != null && String(displayId).trim() !== "") {
    return String(displayId)
  }
  const id = String(order.id ?? "")
  const suffix = id.replace(/^order_/i, "")
  return suffix.length > 8 ? suffix.slice(-8).toUpperCase() : suffix.toUpperCase()
}

/** Medusa v2 amounts are major currency units (rubles for RUB). */
export function getPrice(product: Record<string, unknown>): number | null {
  const variants = product.variants as Array<Record<string, unknown>> | undefined
  if (!variants?.length) return null
  const map = sparseVariantMap(product)
  const openingId = map ? orderedSparseVariants(map)[0]?.id : undefined
  const v =
    (openingId ? variants.find((item) => item.id === openingId) : undefined) ??
    variants[0]
  if (!v) return null
  const cp = v.calculated_price as Record<string, unknown> | undefined
  if (cp?.calculated_amount != null) return Number(cp.calculated_amount)
  const prices =
    (v.prices as Array<Record<string, unknown>> | undefined) ??
    (v.price_set as { prices?: Array<Record<string, unknown>> } | undefined)?.prices
  if (prices?.length && prices[0].amount != null) return Number(prices[0].amount)
  return null
}

/**
 * Base RUB of one variant, before the material-tier multiplier.
 * Prefer the backend-resolved `calculated_amount` so an active price list
 * is the amount this SKU actually sells for. A raw `prices[]` row that
 * belongs to a price list is not a mattress or size base.
 */
export function priceOfVariant(
  variant: Record<string, unknown> | null | undefined
): number | null {
  if (!variant) return null
  const calculated = variant.calculated_price as Record<string, unknown> | undefined
  if (calculated?.calculated_amount != null) return Number(calculated.calculated_amount)
  const prices =
    (variant.prices as Array<Record<string, unknown>> | undefined) ??
    (variant.price_set as { prices?: Array<Record<string, unknown>> } | undefined)
      ?.prices
  const base = prices?.find((price) => price.price_list_id == null && price.amount != null)
  if (base) return Number(base.amount)
  if (prices?.length && prices[0].amount != null) return Number(prices[0].amount)
  return null
}

/** PDP amount. A selected variant without its own price stays unpriced: never another SKU's price. */
export function pdpVariantPrice(
  product: Record<string, unknown>,
  selectedVariant: Record<string, unknown> | null | undefined
): number | null {
  return selectedVariant ? priceOfVariant(selectedVariant) : getPrice(product)
}
