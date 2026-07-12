import type { DisplayEntry } from "./display-group"
import { getPrice } from "./format"
import { getCollectionLabel } from "./product-metadata"

export type CatalogProductClassification = "STANDARD" | "CONFIGURABLE" | "BESPOKE"

export type CatalogFilterState = {
  q?: string
  /** ProductClassification filter (`type` query param). Not product category. */
  type?: CatalogProductClassification
  category: string[]
  collection: string[]
  priceMin?: number
  priceMax?: number
  sort?: "price_asc" | "price_desc"
}

export const PRODUCT_TYPE_FILTER_LABELS: Record<string, string> = {
  STANDARD: "Готовые",
  CONFIGURABLE: "С выбором исполнения",
  BESPOKE: "По проекту",
}

export const CATALOG_CLASSIFICATION_VALUES = [
  "STANDARD",
  "CONFIGURABLE",
  "BESPOKE",
] as const

export function isCatalogProductClassification(
  value: string | undefined | null
): value is CatalogProductClassification {
  return (
    value === "STANDARD" || value === "CONFIGURABLE" || value === "BESPOKE"
  )
}

export const CATEGORY_FILTER_LABELS: Record<string, string> = {
  krovati: "Кровати",
  shkafy: "Шкафы",
  komody: "Комоды",
  tumby: "Тумбы",
  stoly: "Столы",
  zerkala: "Зеркала",
  stellazhi: "Стеллажи",
  polki: "Полки",
  stulya: "Стулья",
  sunduki: "Сундуки",
  chasy: "Часы",
  konsoli: "Консоли",
  skameyki: "Скамейки",
  kresla: "Кресла",
  divany: "Диваны",
  bortiki: "Бортики",
  baldahiny: "Балдахины",
}

function humanizeFilterKey(key: string): string {
  return key
    .trim()
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase("ru-RU") + word.slice(1))
    .join(" ")
}

const COLLECTION_FILTER_LABELS: Record<string, string> = {
  greenwich: "Greenwich",
  oliver: "Oliver",
  "oliver-kids": "Oliver Kids",
  "willie-winkie": "Willie Winkie",
  monchelsea: "Monchelsea",
  provence: "Provence",
  country: "Кантри",
  "country-london-paris": "Кантри",
}

export type CatalogFacetOption = {
  value: string
  label: string
  count: number
}

export type CatalogFacets = {
  types: CatalogFacetOption[]
  categories: CatalogFacetOption[]
  collections: CatalogFacetOption[]
  priceRange: { min: number; max: number } | null
}

function meta(product: Record<string, unknown>): Record<string, unknown> {
  return (product.metadata as Record<string, unknown> | undefined) ?? {}
}

export function getProductCategoryKey(product: Record<string, unknown>): string | null {
  const handle = meta(product).category_handle
  if (typeof handle === "string" && handle.trim()) {
    return handle.trim().toLowerCase()
  }
  return null
}

export function getCategoryFilterLabel(key: string): string {
  return CATEGORY_FILTER_LABELS[key] ?? humanizeFilterKey(key)
}

export function getCollectionFilterKey(product: Record<string, unknown>): string | null {
  const collection = meta(product).collection
  if (typeof collection === "string" && collection.trim()) {
    return normalizeCollectionFilterKey(collection)
  }
  const label = meta(product).collection_label
  if (typeof label === "string" && label.trim()) return normalizeCollectionFilterKey(label)
  const buyerLabel = getCollectionLabel(product)
  if (buyerLabel) return normalizeCollectionFilterKey(buyerLabel)
  return null
}

export function getCollectionFilterLabel(key: string): string {
  if (COLLECTION_FILTER_LABELS[key]) return COLLECTION_FILTER_LABELS[key]!
  const sample = { metadata: { collection: key } }
  return getCollectionLabel(sample) ?? key
}

function productSearchText(product: Record<string, unknown>): string {
  const m = meta(product)
  const parts = [
    product.title,
    m.canonical_name,
    product.handle,
    getCollectionLabel(product),
    m.collection_label,
    getCategoryFilterLabel(getProductCategoryKey(product) ?? ""),
  ]
  return parts
    .filter((p) => typeof p === "string" && p.trim())
    .join(" ")
    .toLowerCase()
}

export function normalizeCollectionFilterKey(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/[_\s]+/g, "-")
  if (!key) return key
  if (key.startsWith("country")) return "country"
  if (key === "кантри") return "country"
  if (key === "molly") return "willie-winkie"
  if (key === "willie-winkie" || key === "willie-winkie-kids") return "willie-winkie"
  if (key === "willie") return "willie-winkie"
  return key
}

function matchesText(product: Record<string, unknown>, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return productSearchText(product).includes(needle)
}

function matchesType(
  product: Record<string, unknown>,
  type: CatalogFilterState["type"]
): boolean {
  if (!type) return true
  const pt = (product.product_classification as { product_type?: string } | undefined)
    ?.product_type
  return pt === type
}

function matchesCategory(product: Record<string, unknown>, categories: string[]): boolean {
  if (!categories.length) return true
  const key = getProductCategoryKey(product)
  return key != null && categories.includes(key)
}

function matchesCollection(product: Record<string, unknown>, collections: string[]): boolean {
  if (!collections.length) return true
  const key = getCollectionFilterKey(product)
  return key != null && collections.includes(key)
}

/** getPrice() may return NaN on malformed backend price fields — treat any
    non-finite value as "no price" so it can't slip through range checks. */
function finiteProductPrice(product: Record<string, unknown>): number | null {
  const price = getPrice(product)
  return price != null && Number.isFinite(price) ? price : null
}

function matchesPrice(
  product: Record<string, unknown>,
  priceMin?: number,
  priceMax?: number
): boolean {
  if (priceMin == null && priceMax == null) return true
  const price = finiteProductPrice(product)
  if (price == null) return false
  if (priceMin != null && price < priceMin) return false
  if (priceMax != null && price > priceMax) return false
  return true
}

/** AND across groups; OR inside multi-select groups. */
export function applyCatalogFilters(
  products: Record<string, unknown>[],
  state: CatalogFilterState
): Record<string, unknown>[] {
  return products.filter(
    (p) =>
      matchesText(p, state.q ?? "") &&
      matchesType(p, state.type) &&
      matchesCategory(p, state.category) &&
      matchesCollection(p, state.collection) &&
      matchesPrice(p, state.priceMin, state.priceMax)
  )
}

function countByKey(
  products: Record<string, unknown>[],
  getKey: (p: Record<string, unknown>) => string | null
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const p of products) {
    const key = getKey(p)
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function mapToFacetOptions(
  counts: Map<string, number>,
  labelFn: (key: string) => string,
  currentCounts?: Map<string, number>
): CatalogFacetOption[] {
  return Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label: labelFn(value),
      count: currentCounts ? currentCounts.get(value) ?? 0 : count,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"))
}

/**
 * Facets from products matching all filters except `excludeGroup`
 * (avoids dead options when possible).
 *
 * Prefer `buildAllCatalogFacets` on catalog pages (one coordinated pass).
 * This helper keeps legacy semantics: all facet fields are derived from the
 * single self-excluding pool for `excludeGroup`.
 */
export function buildCatalogFacets(
  products: Record<string, unknown>[],
  state: CatalogFilterState,
  excludeGroup?: "type" | "category" | "collection" | "price"
): CatalogFacets {
  const partial: CatalogFilterState = { ...state }
  if (excludeGroup === "type") partial.type = undefined
  if (excludeGroup === "category") partial.category = []
  if (excludeGroup === "collection") partial.collection = []
  if (excludeGroup === "price") {
    partial.priceMin = undefined
    partial.priceMax = undefined
  }

  const pool = applyCatalogFilters(products, partial)
  return facetsFromPools(products, state, {
    type: pool,
    category: pool,
    collection: pool,
    price: pool,
  })
}

type FacetPools = {
  type: Record<string, unknown>[]
  category: Record<string, unknown>[]
  collection: Record<string, unknown>[]
  price: Record<string, unknown>[]
}

function facetsFromPools(
  products: Record<string, unknown>[],
  state: CatalogFilterState,
  pools: FacetPools
): CatalogFacets {
  const typeCounts = new Map<string, number>()
  const currentTypeCounts = new Map<string, number>()
  for (const p of products) {
    const pt = (p.product_classification as { product_type?: string } | undefined)
      ?.product_type
    if (pt === "STANDARD" || pt === "CONFIGURABLE" || pt === "BESPOKE") {
      typeCounts.set(pt, (typeCounts.get(pt) ?? 0) + 1)
    }
  }
  for (const p of pools.type) {
    const pt = (p.product_classification as { product_type?: string } | undefined)
      ?.product_type
    if (pt === "STANDARD" || pt === "CONFIGURABLE" || pt === "BESPOKE") {
      currentTypeCounts.set(pt, (currentTypeCounts.get(pt) ?? 0) + 1)
    }
  }

  const tabTypes = ["STANDARD", "CONFIGURABLE"] as const
  const types = tabTypes
    .filter((value) => typeCounts.has(value) || state.type === value)
    .map((value) => ({
      value,
      label: PRODUCT_TYPE_FILTER_LABELS[value] ?? value,
      count: currentTypeCounts.get(value) ?? 0,
    }))

  const categoryCounts = countByKey(products, getProductCategoryKey)
  const currentCategoryCounts = countByKey(pools.category, getProductCategoryKey)
  const collectionCounts = countByKey(products, getCollectionFilterKey)
  const currentCollectionCounts = countByKey(
    pools.collection,
    getCollectionFilterKey
  )

  const prices = pools.price
    .map((p) => finiteProductPrice(p))
    .filter((v): v is number => v != null)
  const priceRange =
    prices.length > 0
      ? { min: Math.min(...prices), max: Math.max(...prices) }
      : null

  return {
    types,
    categories: mapToFacetOptions(
      categoryCounts,
      getCategoryFilterLabel,
      currentCategoryCounts
    ),
    collections: mapToFacetOptions(
      collectionCounts,
      getCollectionFilterLabel,
      currentCollectionCounts
    ),
    priceRange,
  }
}

/**
 * Self-excluding facets in one coordinated pass.
 * For facet group G, pool = all filters except G (never the fully filtered set alone).
 * Matcher flags are computed once per product and reused across pools.
 */
export function buildAllCatalogFacets(
  products: Record<string, unknown>[],
  state: CatalogFilterState
): CatalogFacets {
  const q = state.q ?? ""
  const matchQ = products.map((p) => matchesText(p, q))
  const matchType = products.map((p) => matchesType(p, state.type))
  const matchCategory = products.map((p) =>
    matchesCategory(p, state.category)
  )
  const matchCollection = products.map((p) =>
    matchesCollection(p, state.collection)
  )
  const matchPrice = products.map((p) =>
    matchesPrice(p, state.priceMin, state.priceMax)
  )

  const pick = (
    flags: boolean[]
  ): Record<string, unknown>[] => {
    const out: Record<string, unknown>[] = []
    for (let i = 0; i < products.length; i++) {
      if (flags[i]) out.push(products[i]!)
    }
    return out
  }

  const and = (...parts: boolean[][]): boolean[] => {
    const out = new Array<boolean>(products.length)
    for (let i = 0; i < products.length; i++) {
      let ok = true
      for (const part of parts) {
        if (!part[i]) {
          ok = false
          break
        }
      }
      out[i] = ok
    }
    return out
  }

  // Self-excluding pools: omit the group's own matcher.
  const poolType = pick(
    and(matchQ, matchCategory, matchCollection, matchPrice)
  )
  const poolCategory = pick(
    and(matchQ, matchType, matchCollection, matchPrice)
  )
  const poolCollection = pick(
    and(matchQ, matchType, matchCategory, matchPrice)
  )
  const poolPrice = pick(
    and(matchQ, matchType, matchCategory, matchCollection)
  )

  return facetsFromPools(products, state, {
    type: poolType,
    category: poolCategory,
    collection: poolCollection,
    price: poolPrice,
  })
}

export function sortDisplayEntries(
  entries: DisplayEntry[],
  sort: CatalogFilterState["sort"]
): DisplayEntry[] {
  if (!sort) return entries
  const copy = [...entries]
  const entryPrice = (e: DisplayEntry): number | null => {
    const fromGroup = e.displayGroup?.minPrice
    if (fromGroup != null) return fromGroup
    const p = getPrice(e.product)
    return p ?? null
  }
  const comparePrice = (a: DisplayEntry, b: DisplayEntry): number => {
    const priceA = entryPrice(a)
    const priceB = entryPrice(b)
    if (priceA == null && priceB == null) return 0
    if (priceA == null) return 1
    if (priceB == null) return -1
    return sort === "price_asc" ? priceA - priceB : priceB - priceA
  }
  if (sort === "price_asc") {
    copy.sort(comparePrice)
  } else if (sort === "price_desc") {
    copy.sort(comparePrice)
  }
  return copy
}

export function hasActiveCatalogFilters(state: CatalogFilterState): boolean {
  return Boolean(
    state.q ||
      state.type ||
      state.category.length ||
      state.collection.length ||
      state.priceMin != null ||
      state.priceMax != null
  )
}

export function clearCatalogFilterState(): CatalogFilterState {
  return {
    category: [],
    collection: [],
  }
}
