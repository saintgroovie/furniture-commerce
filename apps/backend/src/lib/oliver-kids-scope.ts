/**
 * Oliver детская линейка (Babysecret) — отдельно от взрослого каталога `oliver`.
 * Синхронизировать с `apps/storefront/src/lib/oliver-kids-scope.ts`.
 */
export const OLIVER_KIDS_COLLECTION_KEY = "oliver-kids" as const

/** Workbook / Medusa handles детской линейки Oliver (OL-81+ nursery). */
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

export function resolveOliverKidsCollectionForHandle(
  handle: string,
  seedCollection?: string | null
): string | null {
  if (isOliverKidsHandle(handle)) return OLIVER_KIDS_COLLECTION_KEY
  const c = seedCollection?.trim().toLowerCase()
  if (c === OLIVER_KIDS_COLLECTION_KEY) return OLIVER_KIDS_COLLECTION_KEY
  return null
}

/** Seed / prefill must not tag kids handles as generic `oliver`. */
export function assertOliverKidsSeedCollection(handle: string, collection: string | undefined): void {
  if (!isOliverKidsHandle(handle)) return
  const c = collection?.trim().toLowerCase()
  if (c === "oliver") {
    throw new Error(
      `Oliver kids handle ${handle} has medusa_collection_handle=oliver; must be ${OLIVER_KIDS_COLLECTION_KEY}`
    )
  }
}

export const OLIVER_KIDS_METADATA_PATCH = {
  collection: OLIVER_KIDS_COLLECTION_KEY,
  storefront_section: "kids",
  room_type: "детская",
  cart_group: "Woodright Kids",
} as const
