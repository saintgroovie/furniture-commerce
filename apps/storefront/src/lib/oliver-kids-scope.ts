/**
 * Oliver детская линейка — см. backend `oliver-kids-scope.ts` (keep handles in sync).
 */
export const OLIVER_KIDS_COLLECTION_KEY = "oliver-kids" as const

export const OLIVER_KIDS_HANDLES = new Set([
  "ol-81-1",
  "ol-82-1",
  "ol-83-1",
  "ol-84-1",
  "ol-84-2",
  "ol-85-1",
  "ol-85-2",
  "ol-86-1",
  "ol-95-1",
  "ol-95-3",
])

export function isOliverKidsHandle(handle: string | undefined | null): boolean {
  if (!handle) return false
  return OLIVER_KIDS_HANDLES.has(handle.trim().toLowerCase())
}

export function isOliverKidsCollectionProduct(
  product: Record<string, unknown>
): boolean {
  const meta = product.metadata as Record<string, unknown> | undefined
  if (meta?.collection === OLIVER_KIDS_COLLECTION_KEY) return true
  const handle = product.handle
  if (typeof handle === "string" && isOliverKidsHandle(handle)) return true
  return false
}
