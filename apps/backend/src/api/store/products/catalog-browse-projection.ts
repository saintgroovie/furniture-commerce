/**
 * G2 / PERF-03: explicit allowlist projection for `/store/catalog-products`.
 * Replaces G1 metadata denylist — unknown operational keys never enter the
 * catalog wire payload. Default `/store/products` stays untouched.
 *
 * Keys are the union needed by:
 * - catalog filters / facets / display_group
 * - catalog-scope / kids navigation
 * - product-card / card-color-media execution selectors
 * - dimensions / collection labels on cards
 */

/** Product root fields kept for catalog listing. */
export const CATALOG_PRODUCT_ROOT_KEYS = [
  "id",
  "handle",
  "title",
  "status",
  "thumbnail",
  "metadata",
  "images",
  "variants",
  "product_classification",
] as const

/**
 * Metadata keys kept for catalog cards/filters.
 * Intentionally includes `finish_metadata_source` (Provence paint/wood gate).
 */
export const CATALOG_METADATA_ALLOW = new Set([
  "collection",
  "collection_label",
  "category_handle",
  "display_group",
  "subcollection_label",
  "canonical_name",
  "dimensions",
  "dimensions_normalized",
  "finish_metadata_source",
  "finish_color_executions",
  "paint_finish_executions",
  "fabric_upholstery_executions",
  "frame_material_executions",
  "headboard_model_executions",
  "bed_execution_matrix",
  "paint_finish_labels",
  "finish_color_labels",
  "fabric_upholstery_labels",
  "upholstery_color_labels",
  "frame_material_labels",
  "construction_tier_executions",
  "material_tier_executions",
  "construction_tier_labels",
  "material_tier_labels",
  "request_quote",
  "request_quote_price_label",
  "price_mode",
  "storefront_section",
  "cart_group",
])

export function projectCatalogMetadataAllowlist(
  metadata: unknown
): Record<string, unknown> | undefined {
  if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return metadata as Record<string, unknown> | undefined
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(metadata as Record<string, unknown>)) {
    if (!CATALOG_METADATA_ALLOW.has(k)) continue
    out[k] = v
  }
  return out
}

function projectCatalogImages(images: unknown): Array<{ url: string }> {
  if (!Array.isArray(images)) return []
  const out: Array<{ url: string }> = []
  for (const entry of images) {
    if (!entry || typeof entry !== "object") continue
    const url = (entry as { url?: unknown }).url
    if (typeof url === "string" && url.trim()) out.push({ url: url.trim() })
  }
  return out
}

function projectCatalogVariants(variants: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(variants)) return []
  return variants.map((variant) => {
    if (!variant || typeof variant !== "object") return {}
    const v = variant as Record<string, unknown>
    const pricesRaw = v.prices
    const prices = Array.isArray(pricesRaw)
      ? pricesRaw
          .map((p) => {
            if (!p || typeof p !== "object") return null
            const amount = (p as { amount?: unknown }).amount
            return typeof amount === "number" ? { amount } : null
          })
          .filter((p): p is { amount: number } => p != null)
      : []
    const slim: Record<string, unknown> = {
      id: v.id,
      prices,
    }
    if (typeof v.sku === "string") slim.sku = v.sku
    return slim
  })
}

/**
 * Slim catalog product DTO (G2).
 * Drops unknown metadata, price_set trees, and non-url image fields.
 */
export function projectCatalogBrowseProduct(
  product: Record<string, unknown>
): Record<string, unknown> {
  const classification = product.product_classification
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    status: product.status,
    thumbnail: product.thumbnail,
    metadata: projectCatalogMetadataAllowlist(product.metadata),
    images: projectCatalogImages(product.images),
    variants: projectCatalogVariants(product.variants),
    product_classification:
      classification && typeof classification === "object"
        ? {
            product_type: (classification as { product_type?: unknown })
              .product_type,
          }
        : classification,
  }
}
