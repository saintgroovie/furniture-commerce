/** Explicit opening SKU shared by catalog, PDP and RoomSet. Undefined = legacy product.
 * Null = invalid pin: fail closed rather than silently choosing another size. */
export function explicitOpeningVariant(
  product: Record<string, unknown>
): Record<string, unknown> | null | undefined {
  const metadata = product.metadata
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined
  if (!Object.prototype.hasOwnProperty.call(metadata, "buyer_opening_variant_id")) return undefined
  const id = (metadata as Record<string, unknown>).buyer_opening_variant_id
  if (typeof id !== "string" || !id.trim()) return null
  const variants = Array.isArray(product.variants) ? product.variants : []
  return variants.find((row): row is Record<string, unknown> =>
    !!row && typeof row === "object" && !Array.isArray(row) &&
    !(row as Record<string, unknown>).deleted_at &&
    (row as Record<string, unknown>).id === id
  ) ?? null
}
