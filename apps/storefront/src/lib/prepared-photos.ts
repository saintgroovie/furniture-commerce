import { isCatalogDerivativeOriginalPair } from "./product-images"
import data from "./prepared-photo-map.json"
import { isBuyerPublicProductStatus } from "./buyer-publication"
import { openingVariant } from "./opening-variant"

type Obj = Record<string, any>
export type PreparedPhotoScope = { productId: string; variantId: string; sku: string; replacements: { source: string; target: string }[] }
const PROTECTED_PARENT = "prod_01KNTBXADW0MYZ9SEBBAYPS5V4"
const MEDIA_FIELDS = ["gallery_urls", "finish_color_executions", "paint_finish_executions", "fabric_upholstery_executions", "frame_material_executions", "headboard_model_executions", "construction_tier_executions", "material_tier_executions", "bed_execution_matrix", "greenwich_paint_execution_matrix", "shared_scene_media"]

/** Exact public source paths only; no credentials/query/fragment/origin fallback. */
export function preparedPhotoSourceKey(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null
  try {
    const decoded = decodeURIComponent(raw)
    if (decoded.includes("\\") || /(?:^|\/)\.\.?\//.test(decoded)) return null
    const url = new URL(raw, "https://woodright.ru")
    if (url.origin !== "https://woodright.ru" || url.username || url.password || url.search || url.hash) return null
    let path = url.pathname
    if (path.startsWith("/static/")) path = "/product-static/" + path.slice(8)
    if (!path.startsWith("/product-static/") && !path.startsWith("/images/")) return null
    return path
  } catch { return null }
}
function mediaKeys(value: any, output: Set<string>, seen = new Set<object>()): void {
  if (typeof value === "string") { const key = preparedPhotoSourceKey(value); if (key) output.add(key); return }
  if (!value || typeof value !== "object" || seen.has(value)) return
  seen.add(value)
  for (const child of Object.values(value)) mediaKeys(child, output, seen)
}
function scopedSources(product: Obj, variant: Obj) {
  const keys = new Set<string>()
  mediaKeys(product.thumbnail, keys)
  for (const image of Array.isArray(product.images) ? product.images : []) mediaKeys(image?.url, keys)
  for (const key of MEDIA_FIELDS) mediaKeys(product.metadata?.[key], keys)
  mediaKeys(variant.metadata?.gallery_urls, keys)
  return keys
}
function buildScope(product: Obj, variantId: string | null, publicAtProjection: boolean): PreparedPhotoScope | null {
  if (!publicAtProjection || product.id === PROTECTED_PARENT || !variantId) return null
  const variant = Array.isArray(product.variants) ? product.variants.find((v: Obj) => v?.id === variantId) : null
  if (!variant || typeof variant.sku !== "string") return null
  const record = data.records.find(row => row.productId === product.id && row.variantId === variant.id && row.sku === variant.sku)
  if (!record) return null
  const current = scopedSources(product, variant)
  const images: Obj[] = Array.isArray(product.images) ? product.images : []
  const ownGallery = new Set<string>(); mediaKeys(variant.metadata?.gallery_urls, ownGallery)
  const replacements = record.slots.filter(slot => {
    const source = preparedPhotoSourceKey(slot.source)
    if (!source) return false
    // Static gallery frames have no native image ID and may be selected by
    // existing compiled execution tables. Their exact preimage is checked at
    // image I/O; this scope never adds a frame or changes a selection.
    if (!slot.imageId) return true
    if (!current.has(source)) return false
    if (slot.imageId) {
      const matching = images.filter(image => preparedPhotoSourceKey(image?.url) === source)
      // Lean browse DTO intentionally omits image IDs. If an ID is present it
      // must still match; explicit selected-variant gallery is a separate proof.
      if (matching.length) return matching.some(image => !Object.hasOwn(image, "id") || image.id === slot.imageId)
      return ownGallery.has(source)
    }
    return true
  }).map(slot => ({ source: slot.source, target: slot.target }))
  return replacements.length ? { productId: product.id, variantId: variant.id, sku: variant.sku, replacements } : null
}
export function selectedPreparedPhotoScope(product: Obj, variantId: string | null): PreparedPhotoScope | null {
  return buildScope(product, variantId, isBuyerPublicProductStatus(product.status))
}
export function preparedCardPhotoScope(product: Obj): PreparedPhotoScope | null {
  const variant = openingVariant(product)
  if (!variant || typeof variant.id !== "string") return null
  const projected = product.prepared_photo_scope as PreparedPhotoScope | null | undefined
  const markerMatches = projected && projected.productId === product.id && projected.variantId === variant.id && projected.sku === variant.sku && Array.isArray(projected.replacements)
  // A slim DTO may retain status for qualified families, but it still loses
  // native image IDs. Revalidation must never restore a rejected native slot.
  const current = product.status !== undefined
    ? selectedPreparedPhotoScope(product, variant.id)
    : markerMatches ? buildScope(product, variant.id, true) : null
  if (!current) return null
  // Only raw native products may bypass projection evidence. Own null/undefined
  // markers are negative evidence, including published qualified-family DTOs.
  if (!Object.hasOwn(product, "prepared_photo_scope")) return current
  if (!markerMatches) return null
  // Intersect the original validated subset with current URI/table checks.
  // Targets always come from the immutable map, never from the DTO marker.
  const replacements = current.replacements.filter(row => projected.replacements.some(saved => saved?.source === row.source && saved?.target === row.target))
  return replacements.length ? { ...current, replacements } : null
}
export function resolvePreparedPhotoURL(scope: PreparedPhotoScope | null, original: string, knownOriginal?: string): string {
  if (!scope || scope.productId === PROTECTED_PARENT) return original
  const key = preparedPhotoSourceKey(original)
  if (!key) return original
  let replacement = scope.replacements.find(row => preparedPhotoSourceKey(row.source) === key)
  // Only a concrete existing derivative→original fallback pair may reach its
  // already-authorized original slot. Never infer another frame by basename.
  if (!replacement && knownOriginal && preparedPhotoSourceKey(knownOriginal) && isCatalogDerivativeOriginalPair(original, knownOriginal)) {
    const exactOriginal = preparedPhotoSourceKey(knownOriginal)
    replacement = scope.replacements.find(row => preparedPhotoSourceKey(row.source) === exactOriginal)
  }
  return replacement && typeof replacement.target === "string" && /^\/prepared-gallery\/[a-f0-9]{64}\//.test(replacement.target) ? replacement.target : original
}

export function preparedPhotoFallbackSource(original: string, target: string, failedTarget: string | null): string {
  return failedTarget === target ? original : target
}
export function canFallbackPreparedPhoto(original: string, target: string, failedTarget: string | null): boolean {
  return target !== original && failedTarget !== target
}
export function preparedPdpScopeForRoute(scope: PreparedPhotoScope | null, expectedRoute: string,
  expectedVariant: string | null, actualRoute: string, actualVariant: string | null): PreparedPhotoScope | null {
  return expectedRoute === actualRoute && expectedVariant === actualVariant ? scope : null
}
