import { getRoomSets, getRoomSetBySlug } from "@/lib/api/room-sets"

export const KIDS_ROOM_TYPE = "детская"

type RoomSetDetail = { room_set?: Record<string, unknown> } | null

/**
 * Resolves kids-only products — products that appear in at least one
 * kids room set (room_type "детская") and in NO non-kids room sets.
 *
 * Single source of truth for the kids content criterion — used for:
 *   - inclusion in /kids/catalog
 *   - exclusion from /catalog
 *   - visual grouping in cart ("Woodright Kids" vs "Woodright")
 *
 * Cross-section products (in both kids and non-kids room sets) are
 * intentionally excluded and remain in the main catalog / adult cart group.
 */
export async function resolveKidsProducts(): Promise<{
  ids: Set<string>
  products: Array<Record<string, unknown>>
}> {
  const data = await getRoomSets()
  const roomSets = (data.room_sets ?? []) as Array<{
    slug?: string
    room_type?: string
  }>

  const kidsSlugs: string[] = []
  const nonKidsSlugs: string[] = []

  for (const rs of roomSets) {
    if (!rs.slug) continue
    if (rs.room_type === KIDS_ROOM_TYPE) kidsSlugs.push(rs.slug)
    else nonKidsSlugs.push(rs.slug)
  }

  const fetchDetail = async (slug: string): Promise<RoomSetDetail> => {
    try {
      return await getRoomSetBySlug(slug)
    } catch {
      return null
    }
  }

  const [kidsDetails, nonKidsDetails] = await Promise.all([
    Promise.all(kidsSlugs.map(fetchDetail)),
    Promise.all(nonKidsSlugs.map(fetchDetail)),
  ])

  const extractProductIds = (details: RoomSetDetail[]): Set<string> => {
    const out = new Set<string>()
    for (const d of details) {
      if (!d) continue
      const items = ((d.room_set as Record<string, unknown>)?.items ??
        []) as Array<{ product?: Record<string, unknown> }>
      for (const item of items) {
        const pid = item.product?.id as string | undefined
        if (pid) out.add(pid)
      }
    }
    return out
  }

  const nonKidsProductIds = extractProductIds(nonKidsDetails)

  const ids = new Set<string>()
  const products: Array<Record<string, unknown>> = []

  for (const d of kidsDetails) {
    if (!d) continue
    const items = ((d.room_set as Record<string, unknown>)?.items ??
      []) as Array<{ product?: Record<string, unknown> }>
    for (const item of items) {
      const product = item.product
      const pid = product?.id as string | undefined
      if (product && pid && !ids.has(pid) && !nonKidsProductIds.has(pid)) {
        ids.add(pid)
        products.push(product)
      }
    }
  }

  return { ids, products }
}
