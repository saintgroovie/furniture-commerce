import { openingVariant } from "./opening-variant"
import { wwPriceEvidence } from "./verified-september-catalog"
import { variantRubPrice } from "./variant-rub-price"

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
  return variantRubPrice(openingVariant(product), true)
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
  return variantRubPrice(variant, true)
}

/** PDP amount. A selected variant without its own price stays unpriced: never another SKU's price. */
export function pdpVariantPrice(
  product: Record<string, unknown>,
  selectedVariant: Record<string, unknown> | null | undefined
): number | null {
  return selectedVariant ? priceOfVariant(selectedVariant) : getPrice(product)
}

/** Opening SKU and its configured amount, as resolved by the backend. */
export function buyerDefaultConfiguration(product: Record<string, unknown>): {
  variantId: string | null
  minUnitPrice: number | null
} {
  const meta = product.metadata
  const cfg =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as { buyer_default_configuration?: unknown }).buyer_default_configuration
      : null
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
    return { variantId: null, minUnitPrice: null }
  }
  const rec = cfg as { variant_id?: unknown; min_unit_price?: unknown }
  const variantId =
    typeof rec.variant_id === "string" && rec.variant_id ? rec.variant_id : null
  const min = rec.min_unit_price
  let minUnitPrice =
    typeof min === "number" && Number.isFinite(min) && min > 0 ? min : null
  const evidence = wwPriceEvidence(variantId)
  if (evidence && (minUnitPrice === evidence.native_base || minUnitPrice === evidence.price)) {
    const variant = (product.variants as Record<string, unknown>[] | undefined)?.find((v) => v.id === variantId)
    if (variant && priceOfVariant(variant) === evidence.price) minUnitPrice = evidence.price
  }
  return { variantId, minUnitPrice }
}

/**
 * Amount shown on the PDP.
 * The opening SKU is `buyer_default_configuration.variant_id`, not `variants[0]`.
 * A selected SKU with no price of its own stays unpriced.
 */
export function pdpDisplayedPrice(input: {
  selectedVariantId: string | null
  selectedOwnPrice: number | null
  openingVariantId: string | null
  openingConfiguredPrice: number | null
  selectedTierPrice: number | null
}): number | null {
  if (input.selectedVariantId != null && input.selectedOwnPrice == null) return null
  const isOpening =
    input.selectedVariantId == null ||
    (input.openingVariantId != null && input.selectedVariantId === input.openingVariantId)
  if (isOpening) {
    return input.openingConfiguredPrice ?? input.selectedTierPrice ?? input.selectedOwnPrice
  }
  return input.selectedTierPrice ?? input.selectedOwnPrice
}
