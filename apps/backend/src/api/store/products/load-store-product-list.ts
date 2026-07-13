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

export type StoreProductListMode = "default" | "browse"

/**
 * Default `/store/products` field set - full projection matching main contract
 * (PDP handle fallback and other consumers). Lean fields are browse-only.
 */
const DEFAULT_PRODUCT_FIELDS = [
  "*",
  "variants.*",
  "variants.price_set.prices.amount",
  "images.*",
  "productType.*",
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
  "product_categories.category_id",
  "product_classification.product_type",
] as const

type QueryGraph = {
  graph: (args: {
    entity: string
    fields: string[]
    filters?: Record<string, unknown>
  }) => Promise<{ data: unknown[] }>
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

  const { data: pricedVariants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "price_set.prices.amount"],
    filters: { id: variantIds },
  })

  const pricesByVariantId = new Map<string, Array<{ amount: number }>>()
  for (const row of pricedVariants ?? []) {
    if (!row || typeof row !== "object") continue
    const v = row as {
      id?: unknown
      price_set?: { prices?: Array<{ amount?: unknown }> }
      prices?: Array<{ amount?: unknown }>
    }
    if (typeof v.id !== "string") continue
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
          const slim: Record<string, unknown> = {
            id: v.id,
            sku: v.sku,
          }
          if (prices) slim.prices = prices
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

export async function loadStoreProductList(
  req: MedusaRequest,
  options?: { mode?: StoreProductListMode }
): Promise<Array<Record<string, unknown>>> {
  const mode = options?.mode ?? "default"
  const query = req.scope.resolve("query") as QueryGraph
  const productType = (req.query.product_type as string) || undefined
  const categoryId = (req.query.category_id as string) || undefined
  const handle = (req.query.handle as string) || undefined

  const filters: Record<string, unknown> = { status: "published" }
  if (handle) filters.handle = handle

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

  const { data: products } = await query.graph({
    entity: "product",
    fields,
    filters: Object.keys(filters).length ? filters : undefined,
  })

  let result = (products ?? []) as Array<Record<string, unknown>>

  if (mode === "browse") {
    result = await attachBrowseVariantPrices(query, result)
  } else {
    result = flattenVariantPrices(result)
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
      const fromProductType = (
        p.productType as Record<string, string> | undefined
      )?.product_type
      return fromClassification === productType || fromProductType === productType
    })
  }
  return result
}
