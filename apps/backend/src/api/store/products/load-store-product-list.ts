/**
 * Shared store product list loader for default `/store/products` and
 * opt-in `/store/catalog-products` (PERF-02 / G1 → W3c projected query).
 *
 * Browse latency (W3e): omit nested `price_set` (batched later) and full
 * `images.*`. Keep lean `images.url` so catalog cards can show a short gallery
 * strip; `/store/catalog-products` projection caps to
 * `CATALOG_BROWSE_MAX_IMAGES`. Thumbnail alone is not enough (extras come from
 * `product.images`, not from execution `urls` which are often hero-only).
 * Default `/store/products` unchanged.
 */
import type { MedusaRequest } from "@medusajs/framework/http"
import { BUYER_PUBLIC_PRODUCT_STATUS } from "../../../lib/buyer-publication"
import { QueryContext } from "@medusajs/framework/utils"
import {
  dedupeCatalogProductsById,
  projectBuyerItemTypesOntoProducts,
} from "../../../lib/buyer-item-type"
import { projectDefaultBuyerConfigurationsOntoProducts } from "../../../lib/default-buyer-configuration"
import { sortProductsByMerchandisingOrder } from "../../../lib/catalog-merchandising-order"
import {
  attachStoreCalculatedPrices,
  resolveStorePricingContext,
  slimStoreCalculatedPrice,
  type StoreCalculatedPrice,
} from "../../../lib/store-pricing/store-calculated-price"
import { attachBuyerPurchaseContract } from "./attach-buyer-purchase"

export type StoreProductListMode = "default" | "browse"

/**
 * Default `/store/products` field set - full projection matching main contract
 * (PDP handle fallback and other consumers). Lean fields are browse-only.
 */
const DEFAULT_PRODUCT_FIELDS = [
  "*",
  "variants.*",
  "variants.options.*",
  "variants.price_set.prices.amount",
  "options.*",
  "images.*",
  "product_categories.*",
  "product_classification.*",
] as const

/**
 * Browse product graph fields - no nested pricing; lean image URLs only.
 * Exported for fidelity / measure scripts.
 */
export const BROWSE_PRODUCT_FIELDS = [
  "id",
  "handle",
  "title",
  "status",
  "thumbnail",
  "metadata",
  "images.url",
  "variants.id",
  "variants.sku",
  "variants.metadata",
  "product_categories.handle",
  "product_classification.product_type",
] as const

/** Browse field set when category/product_type filters need relations. */
const BROWSE_FILTERED_PRODUCT_FIELDS = [
  "id",
  "handle",
  "title",
  "status",
  "thumbnail",
  "metadata",
  "images.url",
  "variants.id",
  "variants.sku",
  "variants.metadata",
  "product_categories.category_id",
  "product_categories.handle",
  "product_classification.product_type",
] as const

type QueryGraph = {
  graph: (args: {
    entity: string
    fields: string[]
    filters?: Record<string, unknown>
    context?: Record<string, unknown>
  }) => Promise<{ data: unknown[] }>
}

/** Keep each browse graph materialization short enough for /health to run. */
const BROWSE_PRODUCT_CHUNK = 32
const BROWSE_VARIANT_CHUNK = 80

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve)
  })
}

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
}

async function loadBrowseProductsInChunks(
  query: QueryGraph,
  fields: string[],
  filters: Record<string, unknown>
): Promise<Array<Record<string, unknown>>> {
  const { data: idRows } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters,
  })
  const ids = (idRows ?? [])
    .map((row) =>
      row && typeof row === "object" ? (row as { id?: unknown }).id : undefined
    )
    .filter((id): id is string => typeof id === "string" && id.length > 0)
  const result: Array<Record<string, unknown>> = []
  for (const slice of chunkIds(ids, BROWSE_PRODUCT_CHUNK)) {
    const { data } = await query.graph({
      entity: "product",
      fields,
      filters: { ...filters, id: slice },
    })
    if (Array.isArray(data)) {
      result.push(...(data as Array<Record<string, unknown>>))
    }
    await yieldEventLoop()
  }
  return result
}

function flattenVariantPrices(
  products: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  return products.map((p) => {
    const variants = p.variants as
      | Array<
          Record<string, unknown> & {
            price_set?: { prices?: unknown[] }
          }
        >
      | undefined
    if (!Array.isArray(variants)) return p
    return {
      ...p,
      variants: variants.map((variant) =>
        !variant.prices && variant.price_set?.prices
          ? { ...variant, prices: variant.price_set.prices }
          : variant
      ),
    }
  })
}

async function attachBrowseVariantPrices(
  query: QueryGraph,
  products: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  const variantIds: string[] = []
  for (const p of products) {
    const variants = p.variants
    if (!Array.isArray(variants)) continue
    for (const v of variants) {
      if (!v || typeof v !== "object") continue
      const id = (v as { id?: unknown }).id
      if (typeof id === "string" && id) variantIds.push(id)
    }
  }
  if (variantIds.length === 0) {
    return products.map((p) => ({ ...p, images: Array.isArray(p.images) ? p.images : [] }))
  }

  /* Base prices (`price_set.prices` excludes price-list rows) + native
     calculated price (sale price lists) in one variant graph. The calculated
     context mirrors the cart line-item override (first region / currency). */
  const pricingContext = await resolveStorePricingContext(query)
  const pricedVariants: unknown[] = []
  const variantFields = pricingContext
    ? ["id", "price_set.prices.amount", "calculated_price.*"]
    : ["id", "price_set.prices.amount"]
  const variantContext = pricingContext
    ? {
        context: {
          calculated_price: QueryContext({
            region_id: pricingContext.region_id,
            currency_code: pricingContext.currency_code,
          }),
        },
      }
    : {}
  for (const slice of chunkIds(variantIds, BROWSE_VARIANT_CHUNK)) {
    const { data } = await query.graph({
      entity: "product_variant",
      fields: variantFields,
      filters: { id: slice },
      ...variantContext,
    })
    if (Array.isArray(data)) pricedVariants.push(...data)
    await yieldEventLoop()
  }

  const pricesByVariantId = new Map<string, Array<{ amount: number }>>()
  const calculatedByVariantId = new Map<string, StoreCalculatedPrice>()
  for (const row of pricedVariants ?? []) {
    if (!row || typeof row !== "object") continue
    const v = row as {
      id?: unknown
      price_set?: { prices?: Array<{ amount?: unknown }> }
      prices?: Array<{ amount?: unknown }>
      calculated_price?: unknown
    }
    if (typeof v.id !== "string") continue
    const calculated = slimStoreCalculatedPrice(v.calculated_price)
    if (calculated) calculatedByVariantId.set(v.id, calculated)
    const raw = v.prices ?? v.price_set?.prices
    if (!Array.isArray(raw)) continue
    const amounts = raw
      .map((p) =>
        p && typeof p === "object" && typeof p.amount === "number"
          ? { amount: p.amount }
          : null
      )
      .filter((p): p is { amount: number } => p != null)
    pricesByVariantId.set(v.id, amounts)
  }

  return products.map((p) => {
    const variants = p.variants
    const nextVariants = Array.isArray(variants)
      ? variants.map((variant) => {
          if (!variant || typeof variant !== "object") return {}
          const v = variant as Record<string, unknown>
          const id = typeof v.id === "string" ? v.id : undefined
          const prices = id ? pricesByVariantId.get(id) : undefined
          const calculated = id ? calculatedByVariantId.get(id) : undefined
          const slim: Record<string, unknown> = {
            id: v.id,
            sku: v.sku,
          }
          if (v.metadata && typeof v.metadata === "object") slim.metadata = v.metadata
          if (prices) slim.prices = prices
          if (calculated) slim.calculated_price = calculated
          return slim
        })
      : variants
    return {
      ...p,
      images: Array.isArray(p.images) ? p.images : [],
      variants: nextVariants,
    }
  })
}

/**
 * Variant metadata (axis sort, per-SKU material tiers) is loaded in browse
 * only so the default configuration opens on the same SKU and tier as the PDP.
 * It is not part of the browse payload.
 */
function dropBrowseVariantMetadata(
  products: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  return products.map((p) => {
    const variants = p.variants
    if (!Array.isArray(variants)) return p
    return {
      ...p,
      variants: variants.map((variant) => {
        if (!variant || typeof variant !== "object") return variant
        const rest = { ...(variant as Record<string, unknown>) }
        delete rest.metadata
        return rest
      }),
    }
  })
}

export async function loadStoreProductList(
  req: MedusaRequest,
  options?: {
    mode?: StoreProductListMode
    /** Exact product ids (server-side callers, e.g. promotion slot). */
    ids?: string[]
  }
): Promise<Array<Record<string, unknown>>> {
  const mode = options?.mode ?? "default"
  const query = req.scope.resolve("query") as QueryGraph
  const productType = (req.query.product_type as string) || undefined
  const categoryId = (req.query.category_id as string) || undefined
  const handle = (req.query.handle as string) || undefined

  const filters: Record<string, unknown> = {
    status: BUYER_PUBLIC_PRODUCT_STATUS,
  }
  if (handle) filters.handle = handle
  if (options?.ids) {
    if (options.ids.length === 0) return []
    filters.id = options.ids
  }

  let fields: string[]
  if (mode === "browse") {
    // Catalog listing never uses `*` - even with optional filters.
    fields =
      productType || categoryId
        ? [...BROWSE_FILTERED_PRODUCT_FIELDS]
        : [...BROWSE_PRODUCT_FIELDS]
  } else {
    fields = [...DEFAULT_PRODUCT_FIELDS]
  }

  let result: Array<Record<string, unknown>>
  if (mode === "browse" && !handle && !options?.ids) {
    result = await loadBrowseProductsInChunks(query, fields, filters)
  } else {
    const { data: products } = await query.graph({
      entity: "product",
      fields,
      filters: Object.keys(filters).length ? filters : undefined,
    })
    result = (products ?? []) as Array<Record<string, unknown>>
  }

  if (mode === "browse") {
    result = await attachBrowseVariantPrices(query, result)
  } else {
    result = flattenVariantPrices(result)
    result = await attachStoreCalculatedPrices(query, result)
  }

  if (categoryId) {
    result = result.filter((p) => {
      const pcs = p.product_categories as
        | Array<{ category_id?: string }>
        | undefined
      return (
        Array.isArray(pcs) && pcs.some((pc) => pc.category_id === categoryId)
      )
    })
  }
  if (productType) {
    result = result.filter((p) => {
      const fromClassification = (
        p.product_classification as Record<string, string> | undefined
      )?.product_type
      return fromClassification === productType
    })
  }

  // Browse listing: dedupe → buyer item type → default configuration →
  // merchandising order (before any future limit/offset). Default
  // `/store/products` still gets default-configuration projection so
  // handle-based PDP fallback shares the same opening price contract as browse.
  if (mode === "browse") {
    result = projectBuyerItemTypesOntoProducts(dedupeCatalogProductsById(result))
    await yieldEventLoop()
    result = projectDefaultBuyerConfigurationsOntoProducts(result)
    result = dropBrowseVariantMetadata(result)
    await yieldEventLoop()
    result = sortProductsByMerchandisingOrder(result)
  } else {
    result = projectDefaultBuyerConfigurationsOntoProducts(result)
    /* PDP handle fallback uses this list; attach the same purchase DTO as /:id. */
    result = result.map((product) => attachBuyerPurchaseContract(product))
  }

  return result
}
