/**
 * Finish-color premium contract.
 *
 * Buyer-facing paint/finish swatches: the first option in the product's
 * finish list is the standard (usually milk / white). Any other finish adds
 * +5% on top of the material-tier price.
 *
 * unit_price = round(solid_full_base × material_multiplier × color_multiplier)
 *
 * Consumers:
 * - api/store/carts/[id]/line-items/route.ts
 * - storefront mirror: apps/storefront/src/lib/finish-color-premium.ts
 */

export const FINISH_COLOR_PREMIUM_MULTIPLIER = 1.05
export const FINISH_COLOR_STANDARD_MULTIPLIER = 1

const FINISH_EXECUTION_KEYS = [
  "paint_finish_executions",
  "finish_color_executions",
] as const

function executionEntriesFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): Array<{ key: string; label: string | null }> {
  if (!metadata) return []
  for (const field of FINISH_EXECUTION_KEYS) {
    const raw = metadata[field]
    if (!Array.isArray(raw) || raw.length === 0) continue
    const entries: Array<{ key: string; label: string | null }> = []
    for (const entry of raw) {
      if (entry == null || typeof entry !== "object") continue
      const key = (entry as { key?: unknown }).key
      if (typeof key !== "string" || !key.trim()) continue
      const labelRaw = (entry as { label?: unknown }).label
      const label =
        typeof labelRaw === "string" && labelRaw.trim() ? labelRaw.trim() : null
      entries.push({ key: key.trim(), label })
    }
    if (entries.length > 0) return entries
  }
  return []
}

function executionKeysFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): string[] {
  return executionEntriesFromMetadata(metadata).map((e) => e.key)
}

/** First finish key in buyer-facing metadata order — the standard color. */
export function standardFinishKeyFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  const keys = executionKeysFromMetadata(metadata)
  return keys[0] ?? null
}

/** True when finishKey is listed in product finish metadata (or metadata empty). */
export function isKnownFinishExecutionKey(
  metadata: Record<string, unknown> | null | undefined,
  finishKey: string | null | undefined
): boolean {
  const key = typeof finishKey === "string" ? finishKey.trim() : ""
  if (!key) return false
  const known = executionKeysFromMetadata(metadata)
  if (known.length === 0) return false
  return known.includes(key)
}

export function finishLabelFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  finishKey: string | null | undefined
): string | null {
  const key = typeof finishKey === "string" ? finishKey.trim() : ""
  if (!key) return null
  const entry = executionEntriesFromMetadata(metadata).find((e) => e.key === key)
  return entry?.label ?? null
}

/**
 * Color multiplier for a picked finish key.
 * Missing key → standard (1). Unknown key must be rejected by the cart route
 * before calling this (defense in depth: unknown → standard, never invent premium).
 */
export function resolveFinishColorMultiplier(
  metadata: Record<string, unknown> | null | undefined,
  finishKey: string | null | undefined
): number {
  const standard = standardFinishKeyFromMetadata(metadata)
  if (!standard) return FINISH_COLOR_STANDARD_MULTIPLIER
  const key = typeof finishKey === "string" ? finishKey.trim() : ""
  if (!key || key === standard) return FINISH_COLOR_STANDARD_MULTIPLIER
  const known = executionKeysFromMetadata(metadata)
  if (known.length > 0 && !known.includes(key)) {
    return FINISH_COLOR_STANDARD_MULTIPLIER
  }
  return FINISH_COLOR_PREMIUM_MULTIPLIER
}

/** Shared configured price: material × color on top of solid_full base. */
export function resolveConfiguredUnitPrice(
  basePrice: number,
  materialMultiplier: number,
  colorMultiplier: number = FINISH_COLOR_STANDARD_MULTIPLIER
): number {
  return Math.round(basePrice * materialMultiplier * colorMultiplier)
}
