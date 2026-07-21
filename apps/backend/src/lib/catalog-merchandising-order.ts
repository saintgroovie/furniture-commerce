/**
 * Buyer catalog default merchandising order (backend SoT).
 *
 * Applied to `/store/catalog-products` (browse list) before the response is
 * returned. Storefront default sort must remain identity so cards follow this
 * order after client-side filters. Explicit price sorts override on the client.
 *
 * Tuple (all ASC): collection_furniture_class → collection_rank →
 * collection_block_key → item_tier → item_type_rank → title → handle → id
 *
 * See docs/catalog-merchandising-order.md
 */

export const MERCHANDISING_ITEM_TIER = {
  ANCHOR: 10,
  SUPPORTING: 20,
  COMPLEMENTARY: 30,
  ACCESSORY: 80,
  UNKNOWN: 90,
} as const

export type MerchandisingItemTier =
  (typeof MERCHANDISING_ITEM_TIER)[keyof typeof MERCHANDISING_ITEM_TIER]

/** Collection blocks — homepage features Greenwich; editable in one place. */
export const COLLECTION_MERCHANDISING_RANK: Record<string, number> = {
  greenwich: 10,
  oliver: 20,
  "oliver-adult": 20,
  monchelsea: 30,
  "willie-winkie": 40,
  "oliver-kids": 50,
  // Paused / legacy — keep stable if they appear in raw lists
  provence: 80,
  oxford: 81,
  // `country-london-paris` normalizes to `country` (see normalize helper)
  country: 82,
  "princess-rose": 83,
}

export const UNASSIGNED_COLLECTION_RANK = 90
export const UNKNOWN_COLLECTION_RANK = 95

/**
 * Normalized item-type keys → type rank inside a tier.
 * Lower = earlier within the same tier.
 */
const TYPE_RANK: Record<string, { tier: MerchandisingItemTier; rank: number }> =
  {
    krovati: { tier: MERCHANDISING_ITEM_TIER.ANCHOR, rank: 10 },
    shkafy: { tier: MERCHANDISING_ITEM_TIER.ANCHOR, rank: 20 },
    komody: { tier: MERCHANDISING_ITEM_TIER.ANCHOR, rank: 30 },
    stoly: { tier: MERCHANDISING_ITEM_TIER.ANCHOR, rank: 40 },
    stellazhi: { tier: MERCHANDISING_ITEM_TIER.ANCHOR, rank: 50 },
    divany: { tier: MERCHANDISING_ITEM_TIER.ANCHOR, rank: 60 },
    tumby: { tier: MERCHANDISING_ITEM_TIER.SUPPORTING, rank: 10 },
    konsoli: { tier: MERCHANDISING_ITEM_TIER.SUPPORTING, rank: 20 },
    sunduki: { tier: MERCHANDISING_ITEM_TIER.SUPPORTING, rank: 30 },
    stulya: { tier: MERCHANDISING_ITEM_TIER.SUPPORTING, rank: 40 },
    kresla: { tier: MERCHANDISING_ITEM_TIER.SUPPORTING, rank: 50 },
    skameyki: { tier: MERCHANDISING_ITEM_TIER.SUPPORTING, rank: 60 },
    polki: { tier: MERCHANDISING_ITEM_TIER.COMPLEMENTARY, rank: 10 },
    bortiki: { tier: MERCHANDISING_ITEM_TIER.COMPLEMENTARY, rank: 20 },
    baldahiny: { tier: MERCHANDISING_ITEM_TIER.COMPLEMENTARY, rank: 30 },
    "pelenalnye-stoleshnicy": {
      tier: MERCHANDISING_ITEM_TIER.COMPLEMENTARY,
      rank: 40,
    },
    zerkala: { tier: MERCHANDISING_ITEM_TIER.ACCESSORY, rank: 10 },
    chasy: { tier: MERCHANDISING_ITEM_TIER.ACCESSORY, rank: 20 },
  }

const UNKNOWN_TYPE = {
  key: "unknown",
  tier: MERCHANDISING_ITEM_TIER.UNKNOWN,
  rank: 50,
} as const

export type ResolvedMerchandisingItemType = {
  key: string
  tier: MerchandisingItemTier
  typeRank: number
  source: "category_handle" | "category_override" | "title_fallback" | "unknown"
}

export type MerchandisingSortKey = {
  collectionKey: string | null
  /** 0 = collection has furniture-tier items; 1 = accessory/unknown-only block */
  collectionFurnitureClass: 0 | 1
  collectionRank: number
  /** Stable block id so equal ranks never interleave different collections. */
  collectionBlockKey: string
  itemTypeKey: string
  itemTier: MerchandisingItemTier
  itemTypeRank: number
  title: string
  handle: string
  id: string
  resolutionSource: ResolvedMerchandisingItemType["source"]
}

function asMeta(product: Record<string, unknown>): Record<string, unknown> {
  const m = product.metadata
  return m && typeof m === "object" && !Array.isArray(m)
    ? (m as Record<string, unknown>)
    : {}
}

export function normalizeMerchandisingCollectionKey(
  raw: string | null | undefined
): string | null {
  if (raw == null) return null
  const key = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[·•]/g, " ")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
  if (!key) return null
  if (key.startsWith("country")) return "country"
  if (key === "molly") return "willie-winkie"
  if (
    key === "willie-winkie-kids" ||
    key === "вилли-винки" ||
    key === "willie"
  ) {
    return "willie-winkie"
  }
  if (key === "оливер" || key === "oliver") return "oliver"
  if (
    key === "oliver-kids" ||
    key === "оливер-kids" ||
    key === "оливер-детская"
  ) {
    return "oliver-kids"
  }
  if (key === "гринвич" || key === "greenwich") return "greenwich"
  if (key === "мончелси" || key === "monchelsea") return "monchelsea"
  if (key === "прованс" || key === "provence") return "provence"
  return key
}

export function collectionMerchandisingRank(
  collectionKey: string | null
): number {
  if (collectionKey == null) return UNASSIGNED_COLLECTION_RANK
  return (
    COLLECTION_MERCHANDISING_RANK[collectionKey] ?? UNKNOWN_COLLECTION_RANK
  )
}

function normalizeCategoryHandle(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const key = raw.trim().toLowerCase()
  return key || null
}

function productSearchBlob(product: Record<string, unknown>): string {
  const meta = asMeta(product)
  const parts = [
    product.title,
    product.handle,
    meta.canonical_name,
    meta.collection_label,
  ]
  return parts
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .join(" ")
    .toLocaleLowerCase("ru-RU")
}

/** Furniture tokens that must not be treated as pure accessory mirrors. */
const FURNITURE_WITH_MIRROR_RE =
  /шкаф|гардероб|туалетн|столик|комод|тумб|консол|кровать|стол\b|стеллаж|полк/

const PURE_MIRROR_RE = /зеркало|зеркала|зеркалом|mirror/
// Avoid JS `\\b` (ASCII-only): require the word «часы», not «часовой».
const PURE_CLOCK_RE = /часы|clock/

/**
 * Last-resort type inference from title/handle when category_handle is missing
 * or must be overridden. Order matters: furniture-before-accessory.
 */
export function inferItemTypeKeyFromText(blob: string): string | null {
  const t = blob.toLocaleLowerCase("ru-RU")
  if (!t.trim()) return null

  // Accessory only when not primarily furniture (e.g. шкаф с зеркалом).
  // Require the noun «зеркало» — not adjective «зеркальная вставка».
  if (PURE_MIRROR_RE.test(t) && !FURNITURE_WITH_MIRROR_RE.test(t)) {
    return "zerkala"
  }
  if (PURE_CLOCK_RE.test(t) && !FURNITURE_WITH_MIRROR_RE.test(t)) {
    return "chasy"
  }

  // Specific accessories before broader furniture stems they contain.
  if (/пеленальн|changing\s*top/.test(t)) return "pelenalnye-stoleshnicy"
  if (/бортик/.test(t)) return "bortiki"
  if (/балдахин|canopy/.test(t)) return "baldahiny"

  // Nightstands before beds: «прикроватная» contains «кроват» as a substring.
  if (/тумб/.test(t)) return "tumby"
  if (/кровать|кровати/.test(t) || /(?:^|[^a-z])bed(?:[^a-z]|$)/.test(t)) {
    return "krovati"
  }
  if (/шкаф|гардероб|wardrobe/.test(t)) return "shkafy"
  if (/комод/.test(t)) return "komody"
  if (/стеллаж|библиотек/.test(t)) return "stellazhi"
  if (/письменн|обеденн|рабоч(?:ий|его)?\s+стол|стол(?:\s|$)|table/.test(t)) {
    return "stoly"
  }
  if (/диван|sofa/.test(t)) return "divany"
  if (/консол/.test(t)) return "konsoli"
  if (/сундук/.test(t)) return "sunduki"
  if (/стул|chair/.test(t)) return "stulya"
  if (/кресл/.test(t)) return "kresla"
  if (/скам|банкет/.test(t)) return "skameyki"
  if (/полк/.test(t)) return "polki"
  return null
}

function lookupType(
  key: string
): { tier: MerchandisingItemTier; rank: number } | null {
  return TYPE_RANK[key] ?? null
}

/**
 * Resolve furniture kind for merchandising. Never mutates `product`.
 * Structured `category_handle` wins unless fail-closed override applies.
 */
export function resolveMerchandisingItemType(
  product: Record<string, unknown>
): ResolvedMerchandisingItemType {
  const meta = asMeta(product)
  const category = normalizeCategoryHandle(meta.category_handle)
  const blob = productSearchBlob(product)

  if (category === "zerkala" || category === "chasy") {
    // Mis-tagged furniture (wardrobe/vanity under zerkala) stays furniture.
    if (FURNITURE_WITH_MIRROR_RE.test(blob)) {
      const inferred = inferItemTypeKeyFromText(blob)
      const key =
        inferred && inferred !== "zerkala" && inferred !== "chasy"
          ? inferred
          : "shkafy"
      const hit = lookupType(key) ?? UNKNOWN_TYPE
      return {
        key,
        tier: hit.tier,
        typeRank: hit.rank,
        source: "category_override",
      }
    }
    const hit = lookupType(category)!
    return {
      key: category,
      tier: hit.tier,
      typeRank: hit.rank,
      source: "category_handle",
    }
  }

  if (category) {
    const hit = lookupType(category)
    if (hit) {
      return {
        key: category,
        tier: hit.tier,
        typeRank: hit.rank,
        source: "category_handle",
      }
    }
    // Unknown structured category → keep key, unknown tier (fail-closed).
    return {
      key: category,
      tier: MERCHANDISING_ITEM_TIER.UNKNOWN,
      typeRank: 50,
      source: "category_handle",
    }
  }

  const inferred = inferItemTypeKeyFromText(blob)
  if (inferred) {
    const hit = lookupType(inferred) ?? UNKNOWN_TYPE
    return {
      key: inferred,
      tier: hit.tier,
      typeRank: hit.rank,
      source: "title_fallback",
    }
  }

  return {
    key: UNKNOWN_TYPE.key,
    tier: UNKNOWN_TYPE.tier,
    typeRank: UNKNOWN_TYPE.rank,
    source: "unknown",
  }
}

export function getProductCollectionKeyForMerchandising(
  product: Record<string, unknown>
): string | null {
  const meta = asMeta(product)
  if (typeof meta.collection === "string" && meta.collection.trim()) {
    return normalizeMerchandisingCollectionKey(meta.collection)
  }
  if (typeof meta.collection_label === "string" && meta.collection_label.trim()) {
    return normalizeMerchandisingCollectionKey(meta.collection_label)
  }
  return null
}

function collectionBlockKey(collectionKey: string | null): string {
  return collectionKey ?? "<none>"
}

function isFurnitureMerchandisingTier(tier: MerchandisingItemTier): boolean {
  return (
    tier === MERCHANDISING_ITEM_TIER.ANCHOR ||
    tier === MERCHANDISING_ITEM_TIER.SUPPORTING ||
    tier === MERCHANDISING_ITEM_TIER.COMPLEMENTARY
  )
}

/**
 * Build sort key. Pass `furnitureBearingCollections` from the full pool so
 * accessory-only collection blocks cannot open the catalog when furniture
 * exists elsewhere (product invariant + contiguous collection blocks).
 */
export function buildMerchandisingSortKey(
  product: Record<string, unknown>,
  furnitureBearingCollections?: ReadonlySet<string>
): MerchandisingSortKey {
  const collectionKey = getProductCollectionKeyForMerchandising(product)
  const block = collectionBlockKey(collectionKey)
  const resolved = resolveMerchandisingItemType(product)
  const title = typeof product.title === "string" ? product.title : ""
  const handle = typeof product.handle === "string" ? product.handle : ""
  const id = typeof product.id === "string" ? product.id : ""
  const hasFurniture =
    furnitureBearingCollections == null
      ? isFurnitureMerchandisingTier(resolved.tier)
      : furnitureBearingCollections.has(block)
  return {
    collectionKey,
    collectionFurnitureClass: hasFurniture ? 0 : 1,
    collectionRank: collectionMerchandisingRank(collectionKey),
    collectionBlockKey: block,
    itemTypeKey: resolved.key,
    itemTier: resolved.tier,
    itemTypeRank: resolved.typeRank,
    title,
    handle,
    id,
    resolutionSource: resolved.source,
  }
}

function compareMerchandisingKeys(
  a: MerchandisingSortKey,
  b: MerchandisingSortKey
): number {
  // Furniture-bearing collection blocks first (global open-with-accessory guard),
  // then configured collection rank, then block key (contiguous equal ranks).
  if (a.collectionFurnitureClass !== b.collectionFurnitureClass) {
    return a.collectionFurnitureClass - b.collectionFurnitureClass
  }
  if (a.collectionRank !== b.collectionRank) {
    return a.collectionRank - b.collectionRank
  }
  const byBlock = a.collectionBlockKey.localeCompare(b.collectionBlockKey, "en")
  if (byBlock !== 0) return byBlock
  if (a.itemTier !== b.itemTier) return a.itemTier - b.itemTier
  if (a.itemTypeRank !== b.itemTypeRank) {
    return a.itemTypeRank - b.itemTypeRank
  }
  const byTitle = a.title.localeCompare(b.title, "ru")
  if (byTitle !== 0) return byTitle
  const byHandle = a.handle.localeCompare(b.handle, "en")
  if (byHandle !== 0) return byHandle
  return a.id.localeCompare(b.id, "en")
}

/**
 * Stable merchandising sort. Does not mutate the input array or product objects.
 */
export function sortProductsByMerchandisingOrder<
  T extends Record<string, unknown>,
>(products: readonly T[]): T[] {
  const furnitureBearing = new Set<string>()
  for (const product of products) {
    const block = collectionBlockKey(
      getProductCollectionKeyForMerchandising(product)
    )
    const tier = resolveMerchandisingItemType(product).tier
    if (isFurnitureMerchandisingTier(tier)) {
      furnitureBearing.add(block)
    }
  }

  const decorated = products.map((product, index) => ({
    product,
    index,
    key: buildMerchandisingSortKey(product, furnitureBearing),
  }))
  decorated.sort((a, b) => {
    const cmp = compareMerchandisingKeys(a.key, b.key)
    if (cmp !== 0) return cmp
    return a.index - b.index
  })
  return decorated.map((d) => d.product)
}

/** True when tier is the accessory layer (mirrors, clocks, decor). */
export function isAccessoryMerchandisingTier(
  tier: MerchandisingItemTier
): boolean {
  return tier === MERCHANDISING_ITEM_TIER.ACCESSORY
}
