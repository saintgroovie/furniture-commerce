/**
 * Kids storefront metadata — keep in sync with `apps/storefront/src/lib/kids.ts`.
 */
export const KIDS_ROOM_TYPE = "детская"
export const WILLIE_WINKIE_COLLECTION_KEY = "willie-winkie" as const

export function isKidsMetadataStorefrontProduct(
  product: Record<string, unknown>
): boolean {
  const meta = (product.metadata as Record<string, unknown> | undefined) ?? {}
  if (meta.storefront_section === "kids") return true
  const collection = meta.collection
  if (typeof collection === "string" && collection === WILLIE_WINKIE_COLLECTION_KEY) {
    return true
  }
  return false
}
