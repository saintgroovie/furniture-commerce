/**
 * W3e: compact browse view-model for RSC → CatalogBrowseClient props.
 *
 * `/store/catalog-products` already allowlists fields (G2/W3c). This pass
 * mirrors the browse caps so client serialization stays lean even when the
 * running Medusa process is older than the storefront build, and drops
 * fields the browse client never reads (`status`).
 */

import { sanitizeGreenwichPaintMatrix } from "./greenwich-paint-media"

const CATALOG_BROWSE_MAX_IMAGES = 1
const CATALOG_BROWSE_MAX_EXECUTION_URLS = 1

const META_ALLOW = new Set([
  "collection",
  "collection_label",
  "category_handle",
  "display_group",
  "display_group_sort",
  "display_group_title",
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
  "greenwich_paint_execution_matrix",
  "execution_dimension_contract",
  "paint_finish_labels",
  "finish_color_labels",
  "fabric_upholstery_labels",
  "upholstery_color_labels",
  "frame_material_labels",
  "construction_tier_executions",
  "material_tier_executions",
  "construction_tier_labels",
  "material_tier_labels",
  "launch_mode",
  "request_quote",
  "request_quote_price_label",
  "price_mode",
  "storefront_section",
  "cart_group",
])

const EXECUTION_URL_KEYS = new Set([
  "finish_color_executions",
  "paint_finish_executions",
  "fabric_upholstery_executions",
  "frame_material_executions",
  "headboard_model_executions",
  "construction_tier_executions",
  "material_tier_executions",
  "bed_execution_matrix",
  "greenwich_paint_execution_matrix",
])

function slimUrlList(urls: unknown): string[] | undefined {
  if (!Array.isArray(urls)) return undefined
  const out: string[] = []
  for (const u of urls) {
    if (typeof u !== "string") continue
    const t = u.trim()
    if (!t) continue
    out.push(t)
    if (out.length >= CATALOG_BROWSE_MAX_EXECUTION_URLS) break
  }
  return out
}

function slimExecutionEntries(value: unknown): unknown {
  if (!Array.isArray(value)) return value
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry
    const o = entry as Record<string, unknown>
    if (!("urls" in o)) return entry
    const urls = slimUrlList(o.urls)
    if (urls === undefined) {
      const { urls: _drop, ...rest } = o
      return rest
    }
    return { ...o, urls }
  })
}

function projectMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return metadata as Record<string, unknown> | undefined
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(metadata as Record<string, unknown>)) {
    if (!META_ALLOW.has(k)) continue
    // Split mixed natural/dark paint-matrix cells before URL slim so each wood
    // tone keeps a hero after CATALOG_BROWSE_MAX_EXECUTION_URLS=1.
    const normalized =
      k === "greenwich_paint_execution_matrix"
        ? sanitizeGreenwichPaintMatrix(v)
        : v
    out[k] = EXECUTION_URL_KEYS.has(k)
      ? slimExecutionEntries(normalized)
      : normalized
  }
  return out
}

function projectImages(images: unknown): Array<{ url: string }> {
  if (!Array.isArray(images)) return []
  const out: Array<{ url: string }> = []
  for (const entry of images) {
    if (!entry || typeof entry !== "object") continue
    const url = (entry as { url?: unknown }).url
    if (typeof url === "string" && url.trim()) {
      out.push({ url: url.trim() })
      if (out.length >= CATALOG_BROWSE_MAX_IMAGES) break
    }
  }
  return out
}

function projectVariants(variants: unknown): Array<Record<string, unknown>> {
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
    const slim: Record<string, unknown> = { id: v.id, prices }
    if (typeof v.sku === "string") slim.sku = v.sku
    return slim
  })
}

/** Compact product for CatalogBrowseClient serialization. */
export function toCatalogBrowseClientProduct(
  product: Record<string, unknown>
): Record<string, unknown> {
  const classification = product.product_classification
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    thumbnail: product.thumbnail,
    metadata: projectMetadata(product.metadata),
    images: projectImages(product.images),
    variants: projectVariants(product.variants),
    product_classification:
      classification && typeof classification === "object"
        ? {
            product_type: (classification as { product_type?: unknown })
              .product_type,
          }
        : classification,
  }
}

export function toCatalogBrowseClientProducts(
  products: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  return products.map(toCatalogBrowseClientProduct)
}
