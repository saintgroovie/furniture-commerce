/**
 * Storefront mirror of apps/backend/src/lib/finish-color-premium-contract.ts.
 *
 * Standard finish = first key in paint/finish executions. Any other finish
 * multiplies the configured price by 1.05. Cart line pricing is resolved on
 * the backend from the same rule — this module is display-only.
 */

export const FINISH_COLOR_PREMIUM_MULTIPLIER = 1.05
export const FINISH_COLOR_STANDARD_MULTIPLIER = 1

/** Color multiplier given the standard (first) key and the active pick. */
export function resolveFinishColorMultiplier(
  finishKey: string | null | undefined,
  standardFinishKey: string | null | undefined
): number {
  const standard = typeof standardFinishKey === "string" ? standardFinishKey.trim() : ""
  if (!standard) return FINISH_COLOR_STANDARD_MULTIPLIER
  const key = typeof finishKey === "string" ? finishKey.trim() : ""
  if (!key || key === standard) return FINISH_COLOR_STANDARD_MULTIPLIER
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
