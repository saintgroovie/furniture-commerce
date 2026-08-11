/**
 * Canonical material tier (construction execution) contract.
 *
 * Source of truth: `product.metadata.material_tiers` — object keyed by tier
 * code (existing Willie Winkie shape, extended with buyer label, description,
 * price multiplier and explicit position). The single Medusa variant RUB price
 * is the price of the `solid_full` execution; every other tier derives its
 * price as `round(base * price_multiplier)`.
 *
 * Consumers:
 * - scripts/normalize-material-tiers-gated.ts (writes normalized metadata)
 * - api/store/carts/[id]/line-items/route.ts (server-side price resolution)
 * - storefront mirror: apps/storefront/src/lib/material-tiers.ts
 */

export const MATERIAL_TIER_LDSP = "solid_front_ldsp_body"
export const MATERIAL_TIER_FULL_SOLID = "solid_full"

export type MaterialTierEntry = {
  key: string
  label_ru: string
  description_ru: string
  price_multiplier: number
  position: number
  /** Preserved operator fields from earlier Launch A shape (price_rub / price_known). */
  [extra: string]: unknown
}

/** Canonical two-execution set: LDSP body first (default), full solid second. */
export const CANONICAL_MATERIAL_TIERS: Record<
  string,
  Pick<MaterialTierEntry, "key" | "label_ru" | "description_ru" | "price_multiplier" | "position">
> = {
  [MATERIAL_TIER_LDSP]: {
    key: MATERIAL_TIER_LDSP,
    label_ru: "Фасады из массива + корпус ЛДСП",
    description_ru: "Практичное исполнение с фасадами из натурального массива",
    price_multiplier: 0.7,
    position: 0,
  },
  [MATERIAL_TIER_FULL_SOLID]: {
    key: MATERIAL_TIER_FULL_SOLID,
    label_ru: "Полностью из массива",
    description_ru: "Премиальное исполнение полностью из натурального массива",
    price_multiplier: 1,
    position: 1,
  },
}

/** `round(full_solid_price × multiplier)` — the one shared price formula. */
export function resolveMaterialTierPrice(basePrice: number, multiplier: number): number {
  return Math.round(basePrice * multiplier)
}

function isValidTierEntry(value: unknown): value is MaterialTierEntry {
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
 * Parse normalized `metadata.material_tiers`. Returns tiers sorted by
 * `position`, or null when the product has no valid normalized tier set
 * (missing metadata, legacy label-only shape, fewer than 2 tiers).
 */
export function parseMaterialTiers(
  metadata: Record<string, unknown> | null | undefined
): MaterialTierEntry[] | null {
  const raw = metadata?.material_tiers
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null
  const entries: MaterialTierEntry[] = []
  for (const [code, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidTierEntry(value)) continue
    if (value.key !== code) continue
    entries.push(value)
  }
  if (entries.length < 2) return null
  return entries.slice().sort((a, b) => a.position - b.position)
}

/** Find one tier by its code inside a parsed tier list. */
export function findMaterialTier(
  tiers: MaterialTierEntry[],
  code: string
): MaterialTierEntry | null {
  return tiers.find((t) => t.key === code) ?? null
}
