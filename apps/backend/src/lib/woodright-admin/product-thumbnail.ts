import fs from "node:fs"
import path from "node:path"
import { extractStaticProductPath } from "../oliver-static-url"

export type ProductThumbnailIssueCode =
  | "thumbnail_missing_but_gallery_present"
  | "thumbnail_localhost_absolute"
  | "thumbnail_file_missing"
  | "thumbnail_not_in_gallery"
  | "admin_list_thumbnail_broken"
  | "variant_thumbnail_missing"

export type ProductThumbnailIssue = {
  code: ProductThumbnailIssueCode
  severity: "warning" | "error"
  message: string
  suggested_thumbnail?: string
}

export type ProductThumbnailHealth = {
  /** Raw `product.thumbnail` from Medusa (what admin list uses). */
  stored_thumbnail?: string
  /** Canonical relative `/static/...` form when applicable. */
  canonical_stored_thumbnail?: string
  /** Storefront-style fallback: thumbnail or first gallery image. */
  effective_thumbnail?: string
  /** What admin list `<Thumbnail>` should use after URL resolution. */
  admin_list_thumbnail?: string
  gallery_urls: string[]
  /** Variants missing thumbnail while product has gallery (admin SKU table). */
  variants_missing_thumbnail: Array<{ id: string; sku?: string }>
  issues: ProductThumbnailIssue[]
}

function normalizeImageEntryUrl(entry: unknown): string | null {
  if (typeof entry === "string") {
    const s = entry.trim()
    return s.length > 0 ? s : null
  }
  if (entry && typeof entry === "object" && "url" in entry) {
    const u = (entry as { url?: unknown }).url
    if (typeof u === "string") {
      const s = u.trim()
      return s.length > 0 ? s : null
    }
  }
  return null
}

/**
 * Canonical storage form for Medusa product media: relative `/static/products/...`.
 * Strips localhost/127.0.0.1/docker `medusa` host prefixes.
 */
export function canonicalizeMedusaImageUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const u = new URL(trimmed)
      if (
        u.pathname.startsWith("/static/") ||
        u.pathname.startsWith("/uploads/")
      ) {
        return u.pathname
      }
    } catch {
      /* fall through */
    }
  }

  const staticPath = extractStaticProductPath(trimmed)
  if (staticPath.startsWith("/static/")) return staticPath
  return trimmed
}

export function medusaImageUrlsEquivalent(a: string, b: string): boolean {
  if (!a || !b) return false
  return canonicalizeMedusaImageUrl(a) === canonicalizeMedusaImageUrl(b)
}

/** Collect gallery URLs from `product.images` only (Medusa relation). */
export function collectMedusaGalleryUrls(product: Record<string, unknown>): string[] {
  const urls: string[] = []
  const seen = new Set<string>()
  const images = product.images
  if (!Array.isArray(images)) return urls

  for (const img of images) {
    const raw = normalizeImageEntryUrl(img)
    if (!raw) continue
    const canon = canonicalizeMedusaImageUrl(raw)
    if (seen.has(canon)) continue
    seen.add(canon)
    urls.push(canon)
  }
  return urls
}

/**
 * Storefront parity: thumbnail first, else first gallery image.
 * Returns canonical relative URL when possible.
 */
export function resolveEffectiveThumbnail(product: Record<string, unknown>): string | undefined {
  const thumb = product.thumbnail
  if (typeof thumb === "string" && thumb.trim()) {
    return canonicalizeMedusaImageUrl(thumb)
  }
  const gallery = collectMedusaGalleryUrls(product)
  return gallery[0]
}

/**
 * Resolve URL for Medusa Admin `<img src>` — same-origin relative paths preferred.
 */
export function resolveAdminListThumbnailSrc(
  url: string | undefined,
  backendPublicUrl = "http://localhost:9000"
): string | undefined {
  if (!url?.trim()) return undefined
  const canon = canonicalizeMedusaImageUrl(url)
  if (canon.startsWith("/static/") || canon.startsWith("/uploads/")) {
    return canon
  }
  if (canon.startsWith("http://") || canon.startsWith("https://")) {
    return canon
  }
  const base = backendPublicUrl.replace(/\/$/, "")
  return `${base}${canon.startsWith("/") ? "" : "/"}${canon}`
}

function isLocalhostAbsoluteUrl(url: string): boolean {
  if (!url.startsWith("http://") && !url.startsWith("https://")) return false
  try {
    const h = new URL(url).hostname.toLowerCase()
    return h === "localhost" || h === "127.0.0.1" || h === "host.docker.internal"
  } catch {
    return false
  }
}

function staticFileExists(url: string, backendRoot?: string): boolean | null {
  if (!backendRoot) return null
  const staticPath = extractStaticProductPath(canonicalizeMedusaImageUrl(url))
  if (!staticPath.startsWith("/static/products/")) return null
  const diskPath = path.join(backendRoot, staticPath.replace(/^\//, ""))
  return fs.existsSync(diskPath)
}

/**
 * Diagnose why Medusa Admin product list may show an empty/broken thumb while gallery works.
 */
export function analyzeProductThumbnailHealth(
  product: Record<string, unknown>,
  options?: { backendRoot?: string; backendPublicUrl?: string }
): ProductThumbnailHealth {
  const stored =
    typeof product.thumbnail === "string" && product.thumbnail.trim()
      ? product.thumbnail.trim()
      : undefined
  const canonicalStored = stored ? canonicalizeMedusaImageUrl(stored) : undefined
  const galleryUrls = collectMedusaGalleryUrls(product)
  const effective = resolveEffectiveThumbnail(product)
  const adminList = resolveAdminListThumbnailSrc(
    stored ?? effective,
    options?.backendPublicUrl
  )

  const variants = Array.isArray(product.variants) ? product.variants : []
  const variantsMissingThumbnail: Array<{ id: string; sku?: string }> = []
  if (galleryUrls.length > 0 || effective) {
    for (const variant of variants) {
      if (!variant || typeof variant !== "object") continue
      const vThumb = (variant as { thumbnail?: unknown }).thumbnail
      const hasThumb = typeof vThumb === "string" && vThumb.trim().length > 0
      if (!hasThumb) {
        variantsMissingThumbnail.push({
          id: String((variant as { id?: unknown }).id ?? ""),
          sku:
            typeof (variant as { sku?: unknown }).sku === "string"
              ? (variant as { sku: string }).sku
              : undefined,
        })
      }
    }
  }

  const issues: ProductThumbnailIssue[] = []

  if (!stored && galleryUrls.length > 0) {
    issues.push({
      code: "thumbnail_missing_but_gallery_present",
      severity: "warning",
      message:
        "В списке товаров Medusa Admin пустая миниатюра: поле thumbnail не задано, хотя галерея заполнена",
      suggested_thumbnail: galleryUrls[0],
    })
  }

  if (stored && isLocalhostAbsoluteUrl(stored)) {
    issues.push({
      code: "thumbnail_localhost_absolute",
      severity: "warning",
      message:
        "thumbnail хранится как абсолютный localhost URL — в списке админки может не отображаться вне локального dev",
      suggested_thumbnail: canonicalStored,
    })
  }

  if (stored && galleryUrls.length > 0) {
    const inGallery = galleryUrls.some((g) => medusaImageUrlsEquivalent(g, stored))
    if (!inGallery) {
      issues.push({
        code: "thumbnail_not_in_gallery",
        severity: "warning",
        message: "thumbnail не совпадает ни с одним URL в product.images (устаревший или другой формат)",
        suggested_thumbnail: galleryUrls[0],
      })
    }
  }

  if (options?.backendRoot && stored) {
    const exists = staticFileExists(stored, options.backendRoot)
    if (exists === false) {
      const fallback = galleryUrls.find((g) => staticFileExists(g, options.backendRoot) === true)
      issues.push({
        code: "thumbnail_file_missing",
        severity: "error",
        message: "Файл thumbnail отсутствует на диске",
        suggested_thumbnail: fallback ?? galleryUrls[0],
      })
    }
  }

  if (!stored && !effective) {
    /* no gallery at all — other warnings handle this */
  } else if (stored && options?.backendRoot) {
    const storedExists = staticFileExists(stored, options.backendRoot)
    const effectiveExists = effective ? staticFileExists(effective, options.backendRoot) : null
    if (storedExists === false && effectiveExists === true) {
      issues.push({
        code: "admin_list_thumbnail_broken",
        severity: "error",
        message:
          "Список админки показывает битую миниатюру, хотя в галерее есть рабочие файлы",
        suggested_thumbnail: effective,
      })
    }
  }

  if (variantsMissingThumbnail.length > 0 && (galleryUrls.length > 0 || effective)) {
    issues.push({
      code: "variant_thumbnail_missing",
      severity: "warning",
      message: `У ${variantsMissingThumbnail.length} вариант(ов) SKU нет thumbnail — в таблице вариантов админки пустая миниатюра`,
      suggested_thumbnail: effective,
    })
  }

  return {
    stored_thumbnail: stored,
    canonical_stored_thumbnail: canonicalStored,
    effective_thumbnail: effective,
    admin_list_thumbnail: adminList,
    gallery_urls: galleryUrls,
    variants_missing_thumbnail: variantsMissingThumbnail,
    issues,
  }
}

/**
 * Pick canonical thumbnail for DB writes: relative `/static/...`, synced from gallery when needed.
 */
export function resolveCanonicalProductThumbnailForWrite(
  product: Record<string, unknown>,
  options?: { backendRoot?: string }
): string | undefined {
  const health = analyzeProductThumbnailHealth(product, options)
  const gallery = health.gallery_urls

  if (health.stored_thumbnail) {
    const canon = canonicalizeMedusaImageUrl(health.stored_thumbnail)
    if (options?.backendRoot) {
      const exists = staticFileExists(canon, options.backendRoot)
      if (exists === false && gallery.length > 0) {
        const valid = gallery.find((g) => staticFileExists(g, options.backendRoot!) === true)
        return valid ?? gallery[0]
      }
    }
    if (isLocalhostAbsoluteUrl(health.stored_thumbnail)) {
      return canon
    }
    return canon
  }

  return gallery[0]
}
