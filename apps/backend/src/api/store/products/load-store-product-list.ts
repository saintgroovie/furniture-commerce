/**
 * Shared store product list loader for default `/store/products` and
 * opt-in `/store/catalog-products` (PERF-02 / G1 → W3c projected query).
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

/** Fixed browse field set - no `*` / no unused relations (W3c). */
export const BROWSE_PRODUCT_FIELDS = [
  "id",
  "handle",
  "title",
  "status",
  "thumbnail",
  "metadata",
  "variants.id",
  "variants.sku",
  "variants.price_set.prices.amount",
  "images.url",
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
  "variants.id",
  "variants.sku",
  "variants.price_set.prices.amount",
  "images.url",
  "product_categories.category_id",
  "product_classification.product_type",
] as const

export async function loadStoreProductList(
  req: MedusaRequest,
  options?: { mode?: StoreProductListMode }
): Promise<Array<Record<string, unknown>>> {
  const mode = options?.mode ?? "default"
  const query = req.scope.resolve("query") as {
    graph: (args: {
      entity: string
      fields: string[]
      filters?: Record<string, unknown>
    }) => Promise<{ data: unknown[] }>
  }
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
  result = result.map((p) => {
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
