/**
 * Store-side calculated pricing (native Medusa price lists / sale prices).
 *
 * Woodright catalog surfaces historically read the raw `price_set.prices`
 * (base RUB price only - Medusa excludes price-list rows from that relation).
 * A native `sale` price list is only visible through `calculated_price`
 * resolved in a region/currency context - the same context the cart
 * line-item override uses. This module attaches that slim `calculated_price`
 * to variants so browse cards, PDP and cart share one price truth:
 *
 *   calculated_amount  - what the buyer pays (sale price when a price list applies)
 *   original_amount    - base price (strike-through candidate)
 *
 * Storefront `getPrice()` already prefers `calculated_price.calculated_amount`.
 */
import { QueryContext } from "@medusajs/framework/utils"

export type StorePricingContext = {
  region_id: string
  currency_code: string
}

export type StoreCalculatedPrice = {
  calculated_amount: number
  original_amount: number
  currency_code: string
  is_calculated_price_price_list: boolean
  price_list_type: string | null
  price_list_id: string | null
}

type QueryGraph = {
  graph: (args: {
    entity: string
    fields: string[]
    filters?: Record<string, unknown>
    context?: Record<string, unknown>
    pagination?: Record<string, unknown>
  }) => Promise<{ data: unknown[] }>
}

const CONTEXT_CACHE_TTL_MS = 60_000

let contextCache: { value: StorePricingContext | null; expiresAt: number } | null =
  null

/** Test / long-lived process hook. */
export function resetStorePricingContextCache(): void {
  contextCache = null
}

function positiveNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Store default pricing context = first region (same rule as storefront cart
 * creation). Single-region store (Россия / RUB) today; cached in-process.
 */
export async function resolveStorePricingContext(
  query: QueryGraph
): Promise<StorePricingContext | null> {
  const now = Date.now()
  if (contextCache && contextCache.expiresAt > now) return contextCache.value

  const { data } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code", "created_at"],
  })
  const regions = (Array.isArray(data) ? data : []) as Array<{
    id?: unknown
    currency_code?: unknown
    created_at?: unknown
  }>
  const sorted = [...regions].sort((a, b) => {
    const ta = new Date(String(a.created_at ?? "")).getTime() || 0
    const tb = new Date(String(b.created_at ?? "")).getTime() || 0
    return ta - tb
  })
  const first = sorted.find(
    (r) => typeof r.id === "string" && typeof r.currency_code === "string"
  )
  const value: StorePricingContext | null = first
    ? {
        region_id: first.id as string,
        currency_code: (first.currency_code as string).toLowerCase(),
      }
    : null
  contextCache = { value, expiresAt: now + CONTEXT_CACHE_TTL_MS }
  return value
}

/** Slim the Medusa `calculated_price` graph payload to the wire contract. */
export function slimStoreCalculatedPrice(raw: unknown): StoreCalculatedPrice | null {
  if (!raw || typeof raw !== "object") return null
  const cp = raw as Record<string, unknown>
  const calculated = positiveNumber(cp.calculated_amount)
  if (calculated == null) return null
  const original = positiveNumber(cp.original_amount) ?? calculated
  const nested = cp.calculated_price as Record<string, unknown> | undefined
  const priceListId =
    nested && typeof nested.price_list_id === "string" ? nested.price_list_id : null
  const priceListType =
    nested && typeof nested.price_list_type === "string"
      ? nested.price_list_type
      : null
  return {
    calculated_amount: calculated,
    original_amount: original,
    currency_code:
      typeof cp.currency_code === "string" ? cp.currency_code.toLowerCase() : "rub",
    is_calculated_price_price_list: cp.is_calculated_price_price_list === true,
    price_list_type: priceListType,
    price_list_id: priceListId,
  }
}

/**
 * True when a native price list lowers the price below the base price.
 * Anything else (equal, higher, no price list) is not a buyer-facing sale.
 */
export function isStoreSalePrice(
  price: StoreCalculatedPrice | null | undefined
): price is StoreCalculatedPrice {
  return Boolean(
    price &&
      price.is_calculated_price_price_list &&
      price.original_amount > price.calculated_amount
  )
}

function collectVariantIds(products: Array<Record<string, unknown>>): string[] {
  const ids: string[] = []
  for (const p of products) {
    const variants = p.variants
    if (!Array.isArray(variants)) continue
    for (const v of variants) {
      const id = (v as { id?: unknown } | null)?.id
      if (typeof id === "string" && id) ids.push(id)
    }
  }
  return ids
}

/**
 * Load slim calculated prices for variant ids in the store pricing context.
 * Returns an empty map when the store has no region (nothing to price against).
 */
export async function loadStoreCalculatedPrices(
  query: QueryGraph,
  variantIds: string[],
  context?: StorePricingContext | null
): Promise<Map<string, StoreCalculatedPrice>> {
  const out = new Map<string, StoreCalculatedPrice>()
  if (variantIds.length === 0) return out
  const ctx = context ?? (await resolveStorePricingContext(query))
  if (!ctx) return out

  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "calculated_price.*"],
    filters: { id: variantIds },
    context: {
      calculated_price: QueryContext({
        region_id: ctx.region_id,
        currency_code: ctx.currency_code,
      }),
    },
  })
  for (const row of data ?? []) {
    if (!row || typeof row !== "object") continue
    const v = row as { id?: unknown; calculated_price?: unknown }
    if (typeof v.id !== "string") continue
    const slim = slimStoreCalculatedPrice(v.calculated_price)
    if (slim) out.set(v.id, slim)
  }
  return out
}

/**
 * Attach `calculated_price` to every variant of every product (in place copy).
 * Variants without a resolvable calculated price are left untouched so the
 * existing `prices[]` fallback keeps working.
 */
export async function attachStoreCalculatedPrices<
  T extends Record<string, unknown>,
>(query: QueryGraph, products: T[], context?: StorePricingContext | null): Promise<T[]> {
  const variantIds = collectVariantIds(products)
  if (variantIds.length === 0) return products
  const priced = await loadStoreCalculatedPrices(query, variantIds, context)
  if (priced.size === 0) return products
  return products.map((p) => {
    const variants = p.variants
    if (!Array.isArray(variants)) return p
    return {
      ...p,
      variants: variants.map((variant) => {
        if (!variant || typeof variant !== "object") return variant
        const v = variant as Record<string, unknown>
        const slim = typeof v.id === "string" ? priced.get(v.id) : undefined
        return slim ? { ...v, calculated_price: slim } : v
      }),
    }
  })
}
