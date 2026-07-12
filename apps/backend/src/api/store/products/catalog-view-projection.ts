/**
 * Opt-in listing projection for `GET /store/catalog-products` (PERF-02 / G1).
 * Drops operational / import metadata unused by catalog cards, filters, kids nav,
 * or BESPOKE fail-closed. Default `/store/products` contract stays untouched.
 *
 * Note: not `?view=` on `/store/products` — Medusa core StoreGetProductsParams
 * rejects unrecognized query fields with 400.
 */

export const CATALOG_VIEW = "catalog"

/** Metadata keys removed only for `/store/catalog-products` listing projection. */
export const CATALOG_METADATA_DROP = new Set([
  "workbook_row_key",
  "dimension_metadata_version",
  "product_code_normalized",
  "readiness_status",
  "asset_quality_status",
  "legacy_assign_prefill_applied_at",
  "mapping_notes",
  "finish_metadata_source",
  "shared_scene_media",
])

export function projectCatalogMetadata(
  metadata: unknown
): Record<string, unknown> | undefined {
  if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return metadata as Record<string, unknown> | undefined
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(metadata as Record<string, unknown>)) {
    if (CATALOG_METADATA_DROP.has(k)) continue
    out[k] = v
  }
  return out
}

export function projectCatalogProduct(
  product: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...product,
    metadata: projectCatalogMetadata(product.metadata),
  }
}
