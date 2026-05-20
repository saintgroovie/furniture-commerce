/**
 * Shared helpers: rewrite product media URLs from /uploads/products/{collection}/ to /static/products/{collection}/.
 * Used by refresh-media-urls-to-static and refresh-co05-country-london-paris-media.
 */

import * as fs from "fs"
import * as path from "path"

export const MEDIA_COLLECTION_SLUGS = ["country-london-paris", "provence"] as const
export type MediaCollectionSlug = (typeof MEDIA_COLLECTION_SLUGS)[number]

export const CO05_ALREADY_CLEAN_HANDLE = "co-05-1"

export function fromSegment(slug: MediaCollectionSlug): string {
  return `/uploads/products/${slug}/`
}

export function toSegment(slug: MediaCollectionSlug): string {
  return `/static/products/${slug}/`
}

export function isMediaCollectionSlug(value: string): value is MediaCollectionSlug {
  return (MEDIA_COLLECTION_SLUGS as readonly string[]).includes(value)
}

/** Medusa app root (contains `static/products/...` on disk). */
export function backendAppRoot(): string {
  const cwd = process.cwd()
  if (fs.existsSync(path.join(cwd, "static", "products"))) {
    return cwd
  }
  if (path.basename(cwd) === "backend" && path.basename(path.dirname(cwd)) === "apps") {
    return cwd
  }
  const nested = path.join(cwd, "apps", "backend")
  if (fs.existsSync(path.join(nested, "static", "products"))) {
    return nested
  }
  return cwd
}

export function collectionFromUploadsUrl(url: string): MediaCollectionSlug | null {
  for (const slug of MEDIA_COLLECTION_SLUGS) {
    if (url.includes(fromSegment(slug))) return slug
  }
  return null
}

export function productPrimaryCollection(product: {
  thumbnail?: string | null
  images?: Array<{ url?: string } | null | undefined>
}): MediaCollectionSlug | null {
  const thumb = product.thumbnail
  if (thumb && typeof thumb === "string") {
    const c = collectionFromUploadsUrl(thumb)
    if (c) return c
  }
  for (const image of product.images ?? []) {
    const url = image?.url
    if (url && typeof url === "string") {
      const c = collectionFromUploadsUrl(url)
      if (c) return c
    }
  }
  return null
}

export function productHasUploadsInScope(
  product: {
    thumbnail?: string | null
    images?: Array<{ url?: string } | null | undefined>
  },
  scopeCollections: MediaCollectionSlug[] | null
): boolean {
  const urls: string[] = []
  if (product.thumbnail && typeof product.thumbnail === "string") urls.push(product.thumbnail)
  for (const image of product.images ?? []) {
    if (image?.url && typeof image.url === "string") urls.push(image.url)
  }
  for (const url of urls) {
    const c = collectionFromUploadsUrl(url)
    if (!c) continue
    if (!scopeCollections || scopeCollections.includes(c)) return true
  }
  return false
}

export function toStaticPath(url: string, slug: MediaCollectionSlug): string | null {
  const to = toSegment(slug)
  const idx = url.indexOf(to)
  if (idx >= 0) return url.slice(idx)
  const from = fromSegment(slug)
  const fromIdx = url.indexOf(from)
  if (fromIdx >= 0) return to + url.slice(fromIdx + from.length)
  return null
}

export function normalizeMediaUrlForCollection(
  url: string | null | undefined,
  slug: MediaCollectionSlug
): string | null | undefined {
  if (!url || typeof url !== "string") return url
  const from = fromSegment(slug)
  if (!url.includes(from)) return url
  return url.replaceAll(from, toSegment(slug))
}

export function staticFileExistsForUrl(appRoot: string, staticPath: string): boolean {
  const rel = staticPath.replace(/^\//, "")
  return fs.existsSync(path.join(appRoot, rel))
}

export type UrlRewrite = {
  field: "thumbnail" | `image[${number}]`
  collection: MediaCollectionSlug
  before: string
  after: string
  staticPath: string
  staticFileExists: boolean
}

export type ProductImage = { url?: string } | null | undefined
export type ProductRow = {
  id: string
  handle: string
  thumbnail?: string | null
  images?: ProductImage[]
}

export type ProductMatrixRow = {
  id: string
  handle: string
  collection: MediaCollectionSlug | "(none)" | "mixed"
  thumbRewrites: number
  imageRewrites: number
  missingStatic: number
  skippedReasons: string[]
}

export function collectRewrites(
  product: ProductRow,
  appRoot: string,
  scopeCollections: MediaCollectionSlug[] | null
): UrlRewrite[] {
  const rewrites: UrlRewrite[] = []

  const thumb = product.thumbnail
  if (thumb && typeof thumb === "string") {
    const slug = collectionFromUploadsUrl(thumb)
    if (slug && (!scopeCollections || scopeCollections.includes(slug))) {
      const after = normalizeMediaUrlForCollection(thumb, slug) as string
      const staticPath = toStaticPath(after, slug)
      rewrites.push({
        field: "thumbnail",
        collection: slug,
        before: thumb,
        after,
        staticPath: staticPath ?? "",
        staticFileExists: staticPath ? staticFileExistsForUrl(appRoot, staticPath) : false,
      })
    }
  }

  for (let i = 0; i < (product.images ?? []).length; i++) {
    const url = product.images?.[i]?.url
    if (!url || typeof url !== "string") continue
    const slug = collectionFromUploadsUrl(url)
    if (!slug || (scopeCollections && !scopeCollections.includes(slug))) continue
    const after = normalizeMediaUrlForCollection(url, slug) as string
    const staticPath = toStaticPath(after, slug)
    rewrites.push({
      field: `image[${i}]`,
      collection: slug,
      before: url,
      after,
      staticPath: staticPath ?? "",
      staticFileExists: staticPath ? staticFileExistsForUrl(appRoot, staticPath) : false,
    })
  }

  return rewrites
}

export function matrixCollectionLabel(
  product: ProductRow,
  rewrites: UrlRewrite[]
): MediaCollectionSlug | "(none)" | "mixed" {
  const fromProduct = productPrimaryCollection(product)
  if (fromProduct) return fromProduct
  const slugSet = new Set(rewrites.map((r) => r.collection))
  if (slugSet.size === 0) return "(none)"
  if (slugSet.size === 1) return [...slugSet][0]
  return "mixed"
}

export function buildProductMatrixRow(product: ProductRow, rewrites: UrlRewrite[]): ProductMatrixRow {
  const skippedReasons: string[] = []
  if (product.handle === CO05_ALREADY_CLEAN_HANDLE && rewrites.length === 0) {
    skippedReasons.push("idempotent: co-05-1 already normalized")
  } else if (rewrites.length === 0) {
    skippedReasons.push("no /uploads/ URLs in scope")
  }

  return {
    id: product.id,
    handle: product.handle,
    collection: matrixCollectionLabel(product, rewrites),
    thumbRewrites: rewrites.filter((r) => r.field === "thumbnail").length,
    imageRewrites: rewrites.filter((r) => r.field.startsWith("image[")).length,
    missingStatic: rewrites.filter((r) => !r.staticFileExists).length,
    skippedReasons,
  }
}

/** Preserve image order; rewrite only /uploads/ rows for known collections. */
export function buildNextImages(images: ProductImage[] | undefined): { url: string }[] {
  const result: { url: string }[] = []
  for (const image of images ?? []) {
    const raw = image?.url
    if (!raw || typeof raw !== "string") continue
    const slug = collectionFromUploadsUrl(raw)
    const url = slug ? (normalizeMediaUrlForCollection(raw, slug) as string) : raw
    if (url) result.push({ url })
  }
  return result
}

export function buildNextThumbnail(
  thumbnail: string | null | undefined,
  rewrites: UrlRewrite[]
): string | null | undefined {
  const thumbRewrite = rewrites.find((r) => r.field === "thumbnail")
  if (thumbRewrite) return thumbRewrite.after
  return thumbnail
}
