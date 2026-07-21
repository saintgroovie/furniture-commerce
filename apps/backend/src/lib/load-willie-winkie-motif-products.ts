import type { MedusaRequest } from "@medusajs/framework/http"
import { isWillieWinkieMotifProduct } from "./motif-theme"

/**
 * Browse-lean product fields for motif aggregation.
 * Kept local so motif routes do not depend on catalog-list refactors.
 */
const MOTIF_PRODUCT_FIELDS = [
  "id",
  "handle",
  "title",
  "status",
  "thumbnail",
  "metadata",
  "variants.id",
  "variants.sku",
  "product_classification.product_type",
] as const

type QueryGraph = {
  graph: (args: {
    entity: string
    fields: string[]
    filters?: Record<string, unknown>
  }) => Promise<{ data: unknown[] }>
}

async function attachMotifVariantPrices(
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
    return products.map((p) => ({
      ...p,
      images: Array.isArray(p.images) ? p.images : [],
    }))
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

/**
 * Load published Willie Winkie motif products for motif Store routes.
 *
 * Intentionally ignores `req.query` (handle / category / product_type). Motif
 * aggregation and PDP motif-context must see the full WW set - otherwise a
 * `?handle=` on `/store/motif-context` would collapse options/related to one row.
 */
export async function loadWillieWinkieMotifProducts(
  req: MedusaRequest
): Promise<Array<Record<string, unknown>>> {
  const query = req.scope.resolve("query") as QueryGraph
  const { data: products } = await query.graph({
    entity: "product",
    fields: [...MOTIF_PRODUCT_FIELDS],
    filters: { status: "published" },
  })
  const published = (products ?? []) as Array<Record<string, unknown>>
  const ww = published.filter(isWillieWinkieMotifProduct)
  return attachMotifVariantPrices(query, ww)
}
