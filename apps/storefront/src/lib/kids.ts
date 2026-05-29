import { getRoomSets, getRoomSetBySlug } from "@/lib/api/room-sets"
import { getProducts } from "@/lib/api/products"
import { BESPOKE_PRODUCT_TYPE } from "@/lib/bespoke"
import {
  isMedusaCanonicalSeedDemoProduct,
  isOliverKidsCollectionProduct,
  isProductInActiveCatalogScope,
} from "@/lib/catalog-scope"

export const KIDS_ROOM_TYPE = "детская"

type RoomSetDetail = { room_set?: Record<string, unknown> } | null

/**
 * Resolves kids storefront assortment — union of:
 *
 * 1. **Room-set kids-only** — products in at least one kids room set
 *    (`room_type` «детская») and in **no** non-kids room sets.
 *    Canonical Medusa seed demo SKUs (`isMedusaCanonicalSeedDemoProduct`) are
 *    dropped here so `/kids/catalog` is not driven by placeholder inventory.
 *
 * 2. **Oliver kids line** — published store products with
 *    `metadata.collection === OLIVER_KIDS_COLLECTION_KEY`, in active catalog
 *    scope, not BESPOKE, and not present in any non-kids room set (same
 *    cross-section rule as (1)).
 *
 * Used for:
 *   - `/kids/catalog`
 *   - exclusion from `/catalog` (with main catalog’s own demo/collection rules)
 *   - cart grouping ("Woodright Kids" vs "Woodright")
 */
export type ResolveKidsProductsOptions = {
  /** When set (e.g. `/catalog` already fetched `/store/products`), avoids a second identical request. */
  storeProducts?: Array<Record<string, unknown>>
}

export async function resolveKidsProducts(
  options?: ResolveKidsProductsOptions
): Promise<{
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
      if (
        product &&
        pid &&
        !ids.has(pid) &&
        !nonKidsProductIds.has(pid) &&
        !isMedusaCanonicalSeedDemoProduct(product)
      ) {
        ids.add(pid)
        products.push(product)
      }
    }
  }

  let storeProducts: Array<Record<string, unknown>> = []
  if (options?.storeProducts) {
    storeProducts = options.storeProducts
  } else {
    try {
      const storeData = await getProducts()
      storeProducts = (storeData.products ?? []) as Array<Record<string, unknown>>
    } catch {
      storeProducts = []
    }
  }

  for (const p of storeProducts) {
    if (!isOliverKidsCollectionProduct(p)) continue
    if (!isProductInActiveCatalogScope(p)) continue
    const classification = p.product_classification as
      | { product_type?: string }
      | undefined
    if (classification?.product_type === BESPOKE_PRODUCT_TYPE) continue

    const pid = p.id as string | undefined
    if (!pid || ids.has(pid) || nonKidsProductIds.has(pid)) continue
    ids.add(pid)
    products.push(p)
  }

  return { ids, products }
}
