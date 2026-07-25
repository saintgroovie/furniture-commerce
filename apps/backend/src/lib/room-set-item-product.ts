/**
 * Application invariant for RoomSetItem ↔ Product links:
 * each item must have exactly one product even though the Medusa link
 * is many-to-many (needed so one product can appear in many rooms).
 */

export function exactlyOneProduct<T>(
  products: T[] | null | undefined
): { ok: true; product: T } | { ok: false; reason: "missing" | "ambiguous" } {
  if (!Array.isArray(products) || products.length === 0) {
    return { ok: false, reason: "missing" }
  }
  if (products.length > 1) {
    return { ok: false, reason: "ambiguous" }
  }
  return { ok: true, product: products[0] }
}
