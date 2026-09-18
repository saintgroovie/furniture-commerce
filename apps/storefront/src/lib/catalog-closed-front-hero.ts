/**
 * Catalog / PDP hero: wardrobe `_main` files are often open-door interiors.
 * Closed facade lives in `gallery_01`. Cards must not use the open shot as the
 * listing hero; PDP still keeps `_main` in the extra strip.
 *
 * Display-only — does not rewrite Medusa `product.thumbnail`.
 */

import { collectProductImageUrls } from "./collect-product-image-urls"

function basenameKey(url: string): string {
  return (url.split("/").pop() ?? url).toLowerCase()
}

function isMainBasename(url: string): boolean {
  return /_main\.(jpe?g|png|webp)$/i.test(basenameKey(url))
}

function isGallery01Url(url: string): boolean {
  return /gallery[_\-.]?01(?:\.|[-_]|$)/i.test(basenameKey(url))
}

function metaOf(product: Record<string, unknown>): Record<string, unknown> {
  const m = product.metadata
  if (!m || typeof m !== "object" || Array.isArray(m)) return {}
  return m as Record<string, unknown>
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : ""
}

/**
 * Clothing wardrobes only. Nightstands / chests keep `_main` even when a
 * `gallery_01` sibling exists.
 *
 * `buyer_item_type` is authoritative when present: only `shkafy` matches.
 * Title matching is the fallback when classification is absent.
 */
export function isWardrobeClosedFrontCandidate(
  product: Record<string, unknown>
): boolean {
  const meta = metaOf(product)
  const type = asString(meta.buyer_item_type).trim().toLowerCase()
  if (type === "shkafy") return true
  if (type) return false
  const hay = [
    asString(product.title),
    asString(meta.canonical_name),
    asString(meta.public_title),
    asString(meta.family_canonical_title),
  ].join(" ")
  return /шкаф|гардероб|wardrobe/i.test(hay)
}

function findGallery01(urls: string[]): string | null {
  return urls.find((u) => isGallery01Url(u)) ?? null
}

/** Prefer `gallery_01` over `_main` for wardrobe listing/PDP heroes. */
export function preferClosedFrontCatalogHero(
  product: Record<string, unknown>,
  storedHero: string
): string {
  const stored = typeof storedHero === "string" ? storedHero.trim() : ""
  if (!stored) return stored
  if (!isWardrobeClosedFrontCandidate(product)) return stored
  if (!isMainBasename(stored)) return stored
  const g01 = findGallery01(collectProductImageUrls(product))
  return g01 ?? stored
}

/** Move closed-front `gallery_01` to index 0 when the current first URL is `_main`. */
export function promoteClosedFrontHero(
  product: Record<string, unknown>,
  urls: string[]
): string[] {
  if (urls.length < 2) return urls
  if (!isWardrobeClosedFrontCandidate(product)) return urls
  const first = urls[0]?.trim() ?? ""
  if (!first || !isMainBasename(first)) return urls
  const g01 = findGallery01(urls)
  if (!g01) return urls
  const rest = urls.filter((u) => basenameKey(u) !== basenameKey(g01))
  return [g01, ...rest]
}
