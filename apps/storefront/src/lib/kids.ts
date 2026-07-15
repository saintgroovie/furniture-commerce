import {
  getRoomSets,
  getRoomSetProductIdsBySlug,
} from "@/lib/api/room-sets"
import { getCatalogProducts } from "@/lib/api/products"
import { BESPOKE_PRODUCT_TYPE } from "@/lib/bespoke"
import {
  isOliverKidsCollectionProduct,
  isMedusaCanonicalSeedDemoProduct,
  isProductInActiveCatalogScope,
} from "@/lib/catalog-scope"

export const KIDS_ROOM_TYPE = "детская"

export const WILLIE_WINKIE_COLLECTION_KEY = "willie-winkie" as const

/** Kids storefront metadata union (Willie Winkie Flow A + generic kids section). */
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

/** Kids PDP / chrome: metadata kids section or Oliver kids collection. */
export function isKidsStorefrontProduct(
  product: Record<string, unknown>
): boolean {
  return (
    isKidsMetadataStorefrontProduct(product) ||
    isOliverKidsCollectionProduct(product)
  )
}

/**
 * Fast kids check for a cart line item — no room-set / catalog fan-out.
 * Order: explicit BESPOKE → not kids (fail-closed even with kids stamps);
 * then line metadata stamp from add-to-cart; then expanded
 * `item.product.metadata` / Oliver handle fallbacks.
 * Room-set-only exclusivity from `resolveKidsProducts` is intentionally skipped
 * here; kids room-set CTA stamps `storefront_section: "kids"` on add.
 */
export function isKidsCartLineItem(item: Record<string, unknown>): boolean {
  const lineMeta = (item.metadata as Record<string, unknown> | undefined) ?? {}

  const productRaw = (item.product as Record<string, unknown> | undefined) ?? {}
  const handleFromLine =
    typeof item.product_handle === "string" ? item.product_handle : undefined
  const product: Record<string, unknown> = {
    ...productRaw,
    handle:
      (typeof productRaw.handle === "string" && productRaw.handle) ||
      handleFromLine,
    metadata: (productRaw.metadata as Record<string, unknown> | undefined) ?? {},
  }

  // BESPOKE never enters the kids cart path (even if stamped kids metadata).
  const classification = product.product_classification as
    | { product_type?: string }
    | undefined
  const legacyType = product.productType as { product_type?: string } | undefined
  const productType = classification?.product_type ?? legacyType?.product_type
  if (productType === BESPOKE_PRODUCT_TYPE) return false

  if (lineMeta.storefront_section === "kids" || lineMeta.cart_group === "kids") {
    return true
  }

  return (
    isKidsMetadataStorefrontProduct(product) ||
    isOliverKidsCollectionProduct(product)
  )
}

type RoomSetIdsDetail = {
  room_set?: { items?: Array<{ product?: { id?: string } }> }
}

/** Thrown when RoomSet membership cannot be trusted (fail-closed for /catalog). */
export class KidsMembershipError extends Error {
  readonly code = "KIDS_MEMBERSHIP_UNAVAILABLE" as const
  readonly cause?: unknown
  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = "KidsMembershipError"
    this.cause = options?.cause
  }
}

export type KidsRoomSetMembership = {
  kidsRoomSetProductIds: Set<string>
  nonKidsRoomSetProductIds: Set<string>
}

export type RoomSetMembershipClients = {
  getRoomSets: typeof getRoomSets
  /** Lean detail: product ids only (`?view=product_ids`). */
  getRoomSetProductIdsBySlug: typeof getRoomSetProductIdsBySlug
}

/**
 * Independent RoomSet membership fetch (list + lean id details).
 * Empty active room-sets list is a valid success (membership sets empty).
 * Any list failure or any lean detail failure → KidsMembershipError (no partial sets).
 * Demo-SKU filtering happens at rehydrate time against store products (lean has ids only).
 */
export async function fetchKidsRoomSetMembership(
  clients: RoomSetMembershipClients = {
    getRoomSets,
    getRoomSetProductIdsBySlug,
  }
): Promise<KidsRoomSetMembership> {
  let data: { room_sets?: Array<{ slug?: string; room_type?: string }> }
  try {
    data = await clients.getRoomSets()
  } catch (cause) {
    throw new KidsMembershipError("Failed to load room sets for kids membership", {
      cause,
    })
  }

  if (!Array.isArray(data.room_sets)) {
    throw new KidsMembershipError(
      "Invalid room sets list for kids membership (room_sets missing or not an array)"
    )
  }

  const roomSets = data.room_sets
  const kidsSlugs: string[] = []
  const nonKidsSlugs: string[] = []

  for (const rs of roomSets) {
    if (rs == null || typeof rs !== "object") {
      throw new KidsMembershipError(
        "Invalid room set entry for kids membership (null or non-object)"
      )
    }
    if (typeof rs.slug !== "string" || !rs.slug) {
      throw new KidsMembershipError(
        "Invalid room set entry for kids membership (missing slug)"
      )
    }
    if (rs.room_type === KIDS_ROOM_TYPE) kidsSlugs.push(rs.slug)
    else nonKidsSlugs.push(rs.slug)
  }

  const fetchLean = async (slug: string): Promise<RoomSetIdsDetail> => {
    let detail: unknown
    try {
      detail = await clients.getRoomSetProductIdsBySlug(slug)
    } catch (cause) {
      throw new KidsMembershipError(
        `Failed to load room set detail for kids membership: ${slug}`,
        { cause }
      )
    }
    if (detail == null || typeof detail !== "object") {
      throw new KidsMembershipError(
        `Invalid lean room set detail for kids membership (${slug}: null or non-object)`
      )
    }
    return detail as RoomSetIdsDetail
  }

  const [kidsDetails, nonKidsDetails] = await Promise.all([
    Promise.all(kidsSlugs.map(fetchLean)),
    Promise.all(nonKidsSlugs.map(fetchLean)),
  ])

  const extractProductIds = (
    details: RoomSetIdsDetail[],
    label: string
  ): Set<string> => {
    const out = new Set<string>()
    for (const d of details) {
      if (d == null || typeof d !== "object") {
        throw new KidsMembershipError(
          `Invalid lean room set detail for kids membership (${label}: null detail)`
        )
      }
      const items = d.room_set?.items
      if (!d.room_set || !Array.isArray(items)) {
        throw new KidsMembershipError(
          `Invalid lean room set detail for kids membership (${label})`
        )
      }
      for (const item of items) {
        if (item == null || typeof item !== "object") {
          throw new KidsMembershipError(
            `Lean room set item null/non-object for kids membership (${label})`
          )
        }
        const pid = item.product?.id
        if (typeof pid !== "string" || !pid) {
          throw new KidsMembershipError(
            `Lean room set item missing product.id for kids membership (${label})`
          )
        }
        out.add(pid)
      }
    }
    return out
  }

  const nonKidsRoomSetProductIds = extractProductIds(nonKidsDetails, "non-kids")
  const kidsRoomSetProductIds = new Set<string>()
  for (const pid of extractProductIds(kidsDetails, "kids")) {
    if (!nonKidsRoomSetProductIds.has(pid)) {
      kidsRoomSetProductIds.add(pid)
    }
  }

  return {
    kidsRoomSetProductIds,
    nonKidsRoomSetProductIds,
  }
}

/**
 * Resolves kids storefront assortment — union of:
 *
 * 1. **Room-set kids-only** — products in at least one kids room set
 *    (`room_type` «детская») and in **no** non-kids room sets; rehydrated
 *    from published store products by id (lean RoomSet payload is not SoT).
 * 2. **Oliver kids line** — metadata.collection Oliver kids, active scope, not BESPOKE.
 * 3. **Kids metadata storefront line** — storefront_section kids / willie-winkie.
 *
 * Membership (RoomSet) and store products are fetched in parallel when not supplied.
 * RoomSet membership failures throw KidsMembershipError - callers must fail-closed
 * (never treat as empty kids set on /catalog).
 */
export type ResolveKidsProductsOptions = {
  storeProducts?: Array<Record<string, unknown>>
  /** Sync membership or Promise (for tests / parallel handoff). */
  membership?: KidsRoomSetMembership | Promise<KidsRoomSetMembership>
}

export async function resolveKidsProducts(
  options?: ResolveKidsProductsOptions
): Promise<{
  ids: Set<string>
  products: Array<Record<string, unknown>>
}> {
  const membershipPromise =
    options?.membership !== undefined
      ? Promise.resolve(options.membership)
      : fetchKidsRoomSetMembership()

  const storePromise =
    options?.storeProducts !== undefined
      ? Promise.resolve(options.storeProducts)
      : getCatalogProducts().then(
          (storeData) =>
            (storeData.products ?? []) as Array<Record<string, unknown>>
        )

  const [membership, storeProducts] = await Promise.all([
    membershipPromise,
    storePromise,
  ])

  const { kidsRoomSetProductIds, nonKidsRoomSetProductIds } = membership
  const storeById = new Map<string, Record<string, unknown>>()
  for (const p of storeProducts) {
    const pid = p.id as string | undefined
    if (pid) storeById.set(pid, p)
  }

  const ids = new Set<string>()
  const products: Array<Record<string, unknown>> = []

  for (const pid of kidsRoomSetProductIds) {
    if (ids.has(pid) || nonKidsRoomSetProductIds.has(pid)) continue
    const fromStore = storeById.get(pid)
    if (fromStore) {
      if (isMedusaCanonicalSeedDemoProduct(fromStore)) continue
      if (!isProductInActiveCatalogScope(fromStore)) continue
      const classification = fromStore.product_classification as
        | { product_type?: string }
        | undefined
      // BESPOKE is not kids-nav assortment; main catalog excludes it via
      // classification scope, not via kids membership.
      if (classification?.product_type === BESPOKE_PRODUCT_TYPE) continue
      ids.add(pid)
      products.push(fromStore)
      continue
    }
    // Not in published store list: still exclude from /catalog.
    ids.add(pid)
  }

  for (const p of storeProducts) {
    if (!isOliverKidsCollectionProduct(p) && !isKidsMetadataStorefrontProduct(p)) {
      continue
    }
    if (!isProductInActiveCatalogScope(p)) continue
    const classification = p.product_classification as
      | { product_type?: string }
      | undefined
    if (classification?.product_type === BESPOKE_PRODUCT_TYPE) continue

    const pid = p.id as string | undefined
    if (!pid || ids.has(pid) || nonKidsRoomSetProductIds.has(pid)) continue
    ids.add(pid)
    products.push(p)
  }

  return { ids, products }
}
