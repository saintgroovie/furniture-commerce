/**
 * Backend-resolved default buyer configuration for CONFIGURABLE products.
 *
 * SoT for the cheapest valid purchasable opening state shared by:
 * - catalog card minimum price
 * - PDP auto-selected controls
 * - cart line pricing when material_execution_code is omitted
 *
 * Storefront must not invent a different min combination from unrelated fields.
 */

import {
  parseMaterialTiers,
  resolveMaterialTierPrice,
} from "./material-tier-contract"

export type BuyerDefaultConfiguration = {
  /** Cheapest valid unit price in RUB (integer). */
  min_unit_price: number
  /** Default material tier code (position 0 / LDSP when tiers exist). */
  material_execution_code: string | null
  material_execution_label: string | null
  material_price_multiplier: number
  /** First purchasable variant id with a positive price, or null. */
  variant_id: string | null
  /** Standard finish color multiplier for the default opening state. */
  color_multiplier: 1
}

function variantUnitPrice(variant: Record<string, unknown>): number | null {
  const calculated = variant.calculated_price as
    | { calculated_amount?: unknown }
    | undefined
  if (
    calculated &&
    typeof calculated.calculated_amount === "number" &&
    Number.isFinite(calculated.calculated_amount) &&
    calculated.calculated_amount > 0
  ) {
    return calculated.calculated_amount
  }
  const prices = variant.prices
  if (!Array.isArray(prices)) return null
  for (const p of prices) {
    if (!p || typeof p !== "object") continue
    const amount = (p as { amount?: unknown }).amount
    if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) {
      return amount
    }
  }
  return null
}

function openingPurchasableVariant(
  product: Record<string, unknown>
): { id: string; basePrice: number } | null {
  /* Same opening variant as storefront getPrice / ProductCta: variants[0].
     Do not skip to a later priced variant — that would diverge card vs PDP/cart. */
  const variants = product.variants
  if (!Array.isArray(variants) || variants.length === 0) return null
  const raw = variants[0]
  if (!raw || typeof raw !== "object") return null
  const v = raw as Record<string, unknown>
  const id = typeof v.id === "string" ? v.id : null
  if (!id) return null
  const basePrice = variantUnitPrice(v)
  if (basePrice == null) return null
  return { id, basePrice }
}

/**
 * Resolve the opening buyer configuration. Returns null when the product has
 * no positive purchasable variant price (unavailable / unpriced).
 */
export function resolveDefaultBuyerConfiguration(
  product: Record<string, unknown>
): BuyerDefaultConfiguration | null {
  const purchasable = openingPurchasableVariant(product)
  if (!purchasable) return null

  const meta =
    product.metadata &&
    typeof product.metadata === "object" &&
    !Array.isArray(product.metadata)
      ? (product.metadata as Record<string, unknown>)
      : null
  const tiers = parseMaterialTiers(meta)

  if (tiers && tiers.length > 0) {
    /* parseMaterialTiers already sorts by position; position 0 = cheapest default. */
    const tier = tiers[0]!
    return {
      min_unit_price: resolveMaterialTierPrice(
        purchasable.basePrice,
        tier.price_multiplier
      ),
      material_execution_code: tier.key,
      material_execution_label: tier.label_ru,
      material_price_multiplier: tier.price_multiplier,
      variant_id: purchasable.id,
      color_multiplier: 1,
    }
  }

  return {
    min_unit_price: purchasable.basePrice,
    material_execution_code: null,
    material_execution_label: null,
    material_price_multiplier: 1,
    variant_id: purchasable.id,
    color_multiplier: 1,
  }
}

export function projectDefaultBuyerConfigurationOntoProduct<
  T extends Record<string, unknown>,
>(product: T): T {
  const resolved = resolveDefaultBuyerConfiguration(product)
  if (!resolved) return product
  const meta =
    product.metadata &&
    typeof product.metadata === "object" &&
    !Array.isArray(product.metadata)
      ? { ...(product.metadata as Record<string, unknown>) }
      : {}
  meta.buyer_default_configuration = resolved
  return { ...product, metadata: meta }
}

export function projectDefaultBuyerConfigurationsOntoProducts<
  T extends Record<string, unknown>,
>(products: T[]): T[] {
  return products.map((p) => projectDefaultBuyerConfigurationOntoProduct(p))
}
