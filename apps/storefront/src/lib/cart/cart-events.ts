"use client"

/**
 * Lightweight client-side pub/sub for cart changes, so the header counter
 * (a separate client island) can react to add/remove happening anywhere on
 * the page without shared state or a provider around the whole app.
 */
export const CART_UPDATED_EVENT = "wr:cart-updated"

export type CartUpdatedDetail = {
  /** Absolute item count, when the caller knows it (preferred). */
  count?: number
  /** Fallback: relative change, applied to the counter's current value. */
  delta?: number
  /** Viewport point the fly-to-cart dot should launch from (e.g. CTA center). */
  from?: { x: number; y: number }
}

export function countCartItems(cart: unknown): number | undefined {
  if (!cart || typeof cart !== "object") return undefined
  const items = (cart as { items?: unknown }).items
  if (!Array.isArray(items)) return undefined
  return items.reduce<number>(
    (sum, item) =>
      sum + (Number((item as { quantity?: number })?.quantity) || 0),
    0
  )
}

export function emitCartUpdated(detail: CartUpdatedDetail): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT, { detail }))
}
