/**
 * Backend-resolved default buyer configuration for CONFIGURABLE products.
 *
 * SoT for the axis-sorted opening SKU shared by:
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
import { productMetadataForVariant } from "./variant-capabilities"

export type BuyerDefaultConfiguration = {
  /** Cheapest valid unit price in RUB (integer). */
  min_unit_price: number
  /**
   * Pre-sale opening price (same tier multiplier applied to the native
   * `calculated_price.original_amount`). Present only when a native price
   * list lowers the price - strike-through candidate for card / PDP.
   */
  original_min_unit_price?: number
  /** Default material tier code (position 0 / LDSP when tiers exist). */
  material_execution_code: string | null
  material_execution_label: string | null
  material_price_multiplier: number
  /** Opening variant id. Not variants[0] and not the cheapest SKU. */
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

/**
 * Native sale: price list lowers the calculated amount below the base
 * (`original_amount`). Returns the original amount or null when no sale.
 */
function variantOriginalUnitPrice(
  variant: Record<string, unknown>,
  basePrice: number
): number | null {
  const calculated = variant.calculated_price as
    | {
        original_amount?: unknown
        is_calculated_price_price_list?: unknown
      }
    | undefined
  if (!calculated || calculated.is_calculated_price_price_list !== true) return null
  const original = calculated.original_amount
  if (
    typeof original === "number" &&
    Number.isFinite(original) &&
    original > basePrice
  ) {
    return original
  }
  return null
}

function axisSortKey(variant: Record<string, unknown>): number[] | null {
  const meta = variant.metadata
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null
  const axes = (meta as { variant_axes?: unknown }).variant_axes
  if (!axes || typeof axes !== "object" || Array.isArray(axes)) return null
  const keys = Object.keys(axes).sort()
  if (keys.length === 0) return null
  return keys.map((key) => {
    const item = (axes as Record<string, { sort?: unknown }>)[key]
    const sort = Number(item?.sort)
    return Number.isFinite(sort) ? sort : 0
  })
}

/**
 * Same confirmed sleeping size as the storefront mattress fallback
 * (`buyer-variant-axis.ts`). Used only when variant_axes are missing,
 * so array order cannot open a larger SKU than the PDP.
 */
function confirmedMattressSort(variant: Record<string, unknown>): number | null {
  const meta = variant.metadata
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null
  const size = (meta as { mattress_size?: unknown }).mattress_size
  if (!size || typeof size !== "object" || Array.isArray(size)) return null
  const row = size as {
    source?: unknown
    confidence?: unknown
    width_cm?: unknown
    length_cm?: unknown
    display?: unknown
    key?: unknown
  }
  if (row.source !== "title" || row.confidence !== "high") return null
  if (!Number.isInteger(row.width_cm) || !Number.isInteger(row.length_cm)) return null
  const width = row.width_cm as number
  const length = row.length_cm as number
  if (width <= 0 || length <= 0) return null
  const display = `${width} × ${length} см`
  if (row.display != null && row.display !== display) return null
  if (row.key != null && row.key !== `${width}x${length}`) return null
  return width * 1000 + length
}

function openingPurchasableVariant(
  product: Record<string, unknown>
): { id: string; basePrice: number; originalPrice: number | null } | null {
  /* Same opening SKU as the PDP sparse map: lowest axis sort, then SKU.
     Array order is variant_rank, which is not that order. */
  const variants = product.variants
  if (!Array.isArray(variants) || variants.length === 0) return null
  const records = variants.filter(
    (item): item is Record<string, unknown> => !!item && typeof item === "object"
  )
  const keys = records.map(axisSortKey)
  const mattressSorts = records.map(confirmedMattressSort)
  const bySku = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    String(a.sku ?? "").localeCompare(String(b.sku ?? ""), "ru")
  const ordered =
    records.length >= 2 && keys.every((key) => key != null)
      ? [...records].sort((a, b) => {
          const left = axisSortKey(a) ?? []
          const right = axisSortKey(b) ?? []
          const width = Math.max(left.length, right.length)
          for (let i = 0; i < width; i++) {
            const delta = (left[i] ?? 0) - (right[i] ?? 0)
            if (delta) return delta
          }
          return bySku(a, b)
        })
      : records.length >= 2 && mattressSorts.every((key) => key != null)
        ? [...records].sort((a, b) => {
            const delta = (confirmedMattressSort(a) ?? 0) - (confirmedMattressSort(b) ?? 0)
            return delta || bySku(a, b)
          })
        : records
  const raw = ordered[0]
  if (!raw) return null
  const id = typeof raw.id === "string" ? raw.id : null
  if (!id) return null
  const basePrice = variantUnitPrice(raw)
  if (basePrice == null) return null
  return { id, basePrice, originalPrice: variantOriginalUnitPrice(raw, basePrice) }
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

  const variants = Array.isArray(product.variants) ? product.variants : []
  const opening = variants.find(
    (item): item is Record<string, unknown> =>
      !!item &&
      typeof item === "object" &&
      (item as { id?: unknown }).id === purchasable.id
  )
  const productMeta =
    product.metadata &&
    typeof product.metadata === "object" &&
    !Array.isArray(product.metadata)
      ? (product.metadata as Record<string, unknown>)
      : null
  const variantMeta =
    opening?.metadata &&
    typeof opening.metadata === "object" &&
    !Array.isArray(opening.metadata)
      ? (opening.metadata as Record<string, unknown>)
      : null
  const meta = productMetadataForVariant(productMeta, variantMeta)
  const tiers = parseMaterialTiers(meta)

  if (tiers && tiers.length > 0) {
    /* parseMaterialTiers already sorts by position; position 0 = cheapest default. */
    const tier = tiers[0]!
    const minUnitPrice = resolveMaterialTierPrice(
      purchasable.basePrice,
      tier.price_multiplier
    )
    /* Original goes through the same tier formula so card / PDP strike-through
       and cart share one rounding path. */
    const originalMinUnitPrice =
      purchasable.originalPrice != null
        ? resolveMaterialTierPrice(purchasable.originalPrice, tier.price_multiplier)
        : null
    return {
      min_unit_price: minUnitPrice,
      ...(originalMinUnitPrice != null && originalMinUnitPrice > minUnitPrice
        ? { original_min_unit_price: originalMinUnitPrice }
        : {}),
      material_execution_code: tier.key,
      material_execution_label: tier.label_ru,
      material_price_multiplier: tier.price_multiplier,
      variant_id: purchasable.id,
      color_multiplier: 1,
    }
  }

  return {
    min_unit_price: purchasable.basePrice,
    ...(purchasable.originalPrice != null
      ? { original_min_unit_price: purchasable.originalPrice }
      : {}),
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
