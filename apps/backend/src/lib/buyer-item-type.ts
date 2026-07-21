/**
 * Buyer-facing furniture item type (кровать / комод / зеркало…).
 *
 * Distinct from ProductClassification (STANDARD | CONFIGURABLE | BESPOKE)
 * and from motif (Ant's Village) / collection (Willie Winkie).
 *
 * Priority (documented SoT):
 * 1. confirmed product-handle dictionary (owner-approved matrix / draft)
 * 2. metadata.category_handle (structured ingest), with merchandising
 *    category_override when mis-tagged accessories
 * 3. product_categories[].handle (Medusa category link), via alias map
 * 4. title/handle inference — fail-safe for display/facets/sort only;
 *    never written back to DB; source tagged `title_fallback`
 * 5. unknown — product stays in catalog; omitted from type facets;
 *    listed in QA inventory
 *
 * Reuses merchandising type resolution so sort and facets share one key space.
 */

import {
  inferItemTypeKeyFromText,
  resolveMerchandisingItemType,
  type ResolvedMerchandisingItemType,
} from "./catalog-merchandising-order"

/** Alias Medusa / legacy category handles → canonical facet keys. */
export const BUYER_ITEM_TYPE_HANDLE_ALIASES: Record<string, string> = {
  "stoly-i-stoliki": "stoly",
  stoliki: "stoly",
  tables: "stoly",
  beds: "krovati",
  wardrobes: "shkafy",
  chests: "komody",
  mirrors: "zerkala",
  clocks: "chasy",
  shelves: "polki",
  bookcases: "stellazhi",
  chairs: "stulya",
  "changing-tops": "pelenalnye-stoleshnicy",
  "changing-top": "pelenalnye-stoleshnicy",
  pelenalnye: "pelenalnye-stoleshnicy",
  bumpers: "bortiki",
  canopies: "baldahiny",
}

/**
 * Exact product-handle → canonical buyer item type.
 *
 * Evidence: Willie Winkie Flow A operator matrix
 * (vv-painting-sku-matrix-filled.csv, operator_decision=approve,
 * proposed_category=stoly-i-stoliki) + matching launch-a draft categories.
 * Canonicalized via BUYER_ITEM_TYPE_HANDLE_ALIASES → `stoly`.
 * No DB write; browse projection only.
 */
export const CONFIRMED_PRODUCT_HANDLE_BUYER_ITEM_TYPES: Readonly<
  Record<string, string>
> = {
  "mo-81-1": "stoly",
  "sh-81-1": "stoly",
  "fa-06-1": "stoly",
}

export type BuyerItemTypeSource =
  | "confirmed_handle"
  | "category_handle"
  | "product_category"
  | "category_override"
  | "title_fallback"
  | "unknown"

export type ResolvedBuyerItemType = {
  key: string | null
  source: BuyerItemTypeSource
  /** True when key is safe to show in buyer type facets. */
  facetEligible: boolean
}

export type BuyerItemTypeInventoryRow = {
  id: string
  handle: string
  title: string
  collection: string | null
  classification: string | null
  resolved_product_type: string | null
  source: BuyerItemTypeSource
  unresolved_reason: string | null
}

function asMeta(product: Record<string, unknown>): Record<string, unknown> {
  const m = product.metadata
  return m && typeof m === "object" && !Array.isArray(m)
    ? (m as Record<string, unknown>)
    : {}
}

function normalizeHandle(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const key = raw.trim().toLowerCase()
  return key || null
}

function canonicalizeTypeKey(raw: string): string {
  const key = raw.trim().toLowerCase()
  return BUYER_ITEM_TYPE_HANDLE_ALIASES[key] ?? key
}

function categoryHandlesFromProduct(product: Record<string, unknown>): string[] {
  const out: string[] = []
  const pcs = product.product_categories
  if (!Array.isArray(pcs)) return out
  for (const row of pcs) {
    if (!row || typeof row !== "object") continue
    const r = row as Record<string, unknown>
    const handle =
      normalizeHandle(r.handle) ??
      normalizeHandle((r.category as { handle?: unknown } | undefined)?.handle)
    if (handle) out.push(canonicalizeTypeKey(handle))
  }
  return out
}

function confirmedTypeFromProductHandle(
  product: Record<string, unknown>
): string | null {
  const handle = normalizeHandle(product.handle)
  if (!handle) return null
  const key = CONFIRMED_PRODUCT_HANDLE_BUYER_ITEM_TYPES[handle]
  return key ? canonicalizeTypeKey(key) : null
}

/**
 * Resolve buyer furniture type. Never mutates `product` or the database.
 */
export function resolveBuyerItemType(
  product: Record<string, unknown>
): ResolvedBuyerItemType {
  const confirmed = confirmedTypeFromProductHandle(product)
  if (confirmed) {
    return {
      key: confirmed,
      source: "confirmed_handle",
      facetEligible: true,
    }
  }

  const meta = asMeta(product)
  const structured = normalizeHandle(meta.category_handle)
  if (structured) {
    const merch = resolveMerchandisingItemType(product)
    if (merch.source === "category_override") {
      return {
        key: merch.key,
        source: "category_override",
        facetEligible: true,
      }
    }
    return {
      key: canonicalizeTypeKey(structured),
      source: "category_handle",
      facetEligible: true,
    }
  }

  const fromCategories = categoryHandlesFromProduct(product)
  if (fromCategories.length > 0) {
    return {
      key: fromCategories[0]!,
      source: "product_category",
      facetEligible: true,
    }
  }

  const merch: ResolvedMerchandisingItemType =
    resolveMerchandisingItemType(product)
  if (merch.source === "title_fallback" && merch.key !== "unknown") {
    return {
      key: merch.key,
      source: "title_fallback",
      facetEligible: true,
    }
  }

  // Explicit second-pass title inference (covers keys merchandising ranks omit).
  const title = typeof product.title === "string" ? product.title : ""
  const handle = typeof product.handle === "string" ? product.handle : ""
  const inferred = inferItemTypeKeyFromText(`${title} ${handle}`)
  if (inferred) {
    return {
      key: inferred,
      source: "title_fallback",
      facetEligible: true,
    }
  }

  return {
    key: null,
    source: "unknown",
    facetEligible: false,
  }
}

/** Alias matching product-type SoT naming in ops prompts. */
export const resolveBuyerProductType = resolveBuyerItemType

/**
 * Shallow-project buyer type onto browse DTO metadata (in-memory only).
 * Prefer filling `category_handle` when missing so storefront facets /
 * merchandising stay on one field without duplicating matchers.
 */
export function projectBuyerItemTypeOntoProduct<
  T extends Record<string, unknown>,
>(product: T): T {
  const resolved = resolveBuyerItemType(product)
  const meta = { ...asMeta(product) }
  const existing = normalizeHandle(meta.category_handle)

  // Authoritative projected type for facets: fill missing handles, and overwrite
  // when merchandising category_override corrects a misclassified handle
  // (e.g. furniture wrongly tagged zerkala/chasy).
  if (resolved.key && resolved.facetEligible) {
    if (
      !existing ||
      resolved.source === "category_override" ||
      resolved.source === "confirmed_handle"
    ) {
      meta.category_handle = resolved.key
    }
  }
  meta.buyer_item_type = resolved.key
  meta.buyer_item_type_source = resolved.source

  return {
    ...product,
    metadata: meta,
  }
}

export function projectBuyerItemTypesOntoProducts<
  T extends Record<string, unknown>,
>(products: readonly T[]): T[] {
  return products.map((p) => projectBuyerItemTypeOntoProduct(p))
}

/** Stable product key for catalog dedupe (id preferred, else handle). */
export function catalogProductDedupeKey(
  product: Record<string, unknown>
): string | null {
  if (typeof product.id === "string" && product.id.trim()) {
    return product.id.trim()
  }
  if (typeof product.handle === "string" && product.handle.trim()) {
    return `handle:${product.handle.trim().toLowerCase()}`
  }
  return null
}

export function dedupeCatalogProductsById<T extends Record<string, unknown>>(
  products: readonly T[]
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const product of products) {
    const key = catalogProductDedupeKey(product)
    if (!key) {
      out.push(product)
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    out.push(product)
  }
  return out
}

export function buildMissingBuyerItemTypeInventory(
  products: readonly Record<string, unknown>[]
): BuyerItemTypeInventoryRow[] {
  const rows: BuyerItemTypeInventoryRow[] = []
  for (const product of products) {
    const resolved = resolveBuyerItemType(product)
    if (
      resolved.source === "category_handle" ||
      resolved.source === "product_category" ||
      resolved.source === "confirmed_handle"
    ) {
      continue
    }
    const meta = asMeta(product)
    const classification = (
      product.product_classification as { product_type?: string } | undefined
    )?.product_type
    rows.push({
      id: typeof product.id === "string" ? product.id : "",
      handle: typeof product.handle === "string" ? product.handle : "",
      title: typeof product.title === "string" ? product.title : "",
      collection:
        typeof meta.collection === "string" ? meta.collection : null,
      classification: classification ?? null,
      resolved_product_type: resolved.key,
      source: resolved.source,
      unresolved_reason:
        resolved.source === "unknown"
          ? "no_category_handle_or_inferable_title"
          : resolved.source === "title_fallback"
            ? "missing_structured_category_handle"
            : null,
    })
  }
  return rows
}

/**
 * Facet counts for buyer item types over a storefront-visible product set.
 * Skips unknown (not facet-eligible). Does not invent labels.
 */
export function countBuyerItemTypeFacets(
  products: readonly Record<string, unknown>[]
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const product of products) {
    const meta = asMeta(product)
    const projected = normalizeHandle(meta.category_handle)
    if (projected) {
      counts.set(projected, (counts.get(projected) ?? 0) + 1)
      continue
    }
    const resolved = resolveBuyerItemType(product)
    if (!resolved.facetEligible || !resolved.key) continue
    counts.set(resolved.key, (counts.get(resolved.key) ?? 0) + 1)
  }
  return counts
}
