/**
 * Material execution (construction tier) resolver — storefront mirror of
 * apps/backend/src/lib/material-tier-contract.ts.
 *
 * Source of truth: `product.metadata.material_tiers` written by the backend
 * normalizer. The single Medusa variant RUB price is the `solid_full` price;
 * display/cart price is `round(base × material_multiplier × color_multiplier)`
 * (see finish-color-premium). This module builds material options; color is
 * applied by the price / chips / CTA consumers.
 */

import { getPrice } from "@/lib/format"

export const MATERIAL_TIER_LDSP = "solid_front_ldsp_body"
export const MATERIAL_TIER_FULL_SOLID = "solid_full"

export type MaterialTierOption = {
  code: string
  label: string
  description: string | null
  multiplier: number
  position: number
  /** round(base × multiplier); null when the product has no numeric price. */
  price: number | null
}

/** `round(full_solid_price × multiplier)` — same formula as the backend. */
export function resolveMaterialTierPrice(basePrice: number, multiplier: number): number {
  return Math.round(basePrice * multiplier)
}

function isValidTierEntry(value: unknown): value is {
  key: string
  label_ru: string
  description_ru?: string
  price_multiplier: number
  position: number
} {
  if (value == null || typeof value !== "object") return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.key === "string" &&
    typeof entry.label_ru === "string" &&
    entry.label_ru.trim().length > 0 &&
    typeof entry.price_multiplier === "number" &&
    Number.isFinite(entry.price_multiplier) &&
    entry.price_multiplier > 0 &&
    entry.price_multiplier <= 1 &&
    typeof entry.position === "number" &&
    Number.isFinite(entry.position)
  )
}

/**
 * Parse normalized `metadata.material_tiers` into ordered dropdown options.
 * Returns null when the product has no valid normalized tier set (fewer than
 * two tiers, legacy label-only shape, missing metadata).
 */
export function buildMaterialTierOptions(
  product: Record<string, unknown>
): MaterialTierOption[] | null {
  const meta = product.metadata as Record<string, unknown> | undefined
  const raw = meta?.material_tiers
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null

  const basePrice = getPrice(product)
  const options: MaterialTierOption[] = []
  for (const [code, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidTierEntry(value)) continue
    if (value.key !== code) continue
    options.push({
      code,
      label: value.label_ru,
      description:
        typeof value.description_ru === "string" && value.description_ru.trim()
          ? value.description_ru
          : null,
      multiplier: value.price_multiplier,
      position: value.position,
      price:
        basePrice != null
          ? resolveMaterialTierPrice(basePrice, value.price_multiplier)
          : null,
    })
  }
  if (options.length < 2) return null
  return options.sort((a, b) => a.position - b.position)
}
