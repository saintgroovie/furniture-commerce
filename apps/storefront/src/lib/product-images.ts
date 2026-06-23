/**
 * Storefront helpers for listing/API-shaped product media URLs.
 *
 * **Client-safe:** no imports from `apps/backend` (no fs/crypto). Oliver MD5 repair lives in
 * `pdp-buyer-gallery.server.ts` (server components / scripts only).
 *
 * Catalog cards: hero uses `product.thumbnail` only; extras use
 * {@link collectExtraProductImageUrls}, {@link collectDisplayGroupExtraImageUrls}, and
 * {@link mergeUniqueExtraUrls} (listing attaches `display_group_color_variants` in `display-group.ts`).
 */

function medusaBackendBaseForImages(): string {
  const raw =
    (typeof process !== "undefined" &&
      (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
        process.env.MEDUSA_BACKEND_URL)) ||
    "http://localhost:9000"
  return String(raw).replace(/\/$/, "")
}

/**
 * Browser-safe product image URL: `/static/...` and `/uploads/...` are served by Medusa, not Next.
 * Rewrites docker `medusa` hostnames to `localhost` for local QA.
 */
export function resolveMedusaBackendImageUrl(url: string): string {
  const t = typeof url === "string" ? url.trim() : ""
  if (!t) return t
  if (t.startsWith("data:")) return t
  if (t.startsWith("http://") || t.startsWith("https://")) {
    try {
      const u = new URL(t)
      if (u.hostname === "medusa" || u.hostname.endsWith(".medusa")) {
        u.hostname = "localhost"
        return u.toString()
      }
    } catch {
      /* ignore */
    }
    return t
  }
  if (t.startsWith("/static/") || t.startsWith("/uploads/")) {
    return `${medusaBackendBaseForImages()}${t}`
  }
  return t
}

function isMedusaBackendHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === "medusa" || h.endsWith(".medusa")) return true
  if (h === "localhost" || h === "127.0.0.1" || h === "host.docker.internal") return true
  const configured = medusaBackendBaseForImages()
  try {
    const backendHost = new URL(configured).hostname.toLowerCase()
    return h === backendHost
  } catch {
    return false
  }
}

/**
 * Same-origin PDP URL via Next rewrite `/product-static/…` → Medusa `/static/…`.
 * Cross-origin `:9000` URLs fail client thumb verification on `:3002`.
 */
export function resolvePdpMediaSrc(url: string): string {
  const s = typeof url === "string" ? url.trim() : ""
  if (!s) return s
  if (s.startsWith("/product-static/")) return s
  if (s.startsWith("/static/")) {
    return `/product-static${s.slice("/static".length)}`
  }
  if (s.startsWith("/uploads/")) {
    return `${medusaBackendBaseForImages()}${s}`
  }
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      const u = new URL(s)
      if (isMedusaBackendHost(u.hostname)) {
        if (u.pathname.startsWith("/static/")) {
          return `/product-static${u.pathname.slice("/static".length)}`
        }
        if (u.pathname.startsWith("/uploads/")) {
          return `${medusaBackendBaseForImages()}${u.pathname}`
        }
      }
    } catch {
      /* ignore */
    }
    return s
  }
  return resolveMedusaBackendImageUrl(s)
}

/** Storefront `<img src>` for Medusa product media (catalog, PDP, swatches). */
export const resolveStorefrontProductImageSrc = resolvePdpMediaSrc

export function resolvePdpMediaBundle(mainSrc: string, extraSrcs: string[]): {
  mainSrc: string
  extraSrcs: string[]
} {
  const main = resolvePdpMediaSrc(mainSrc)
  const extras: string[] = []
  for (const raw of extraSrcs) {
    const resolved = resolvePdpMediaSrc(raw)
    if (resolved) extras.push(resolved)
  }
  return { mainSrc: main, extraSrcs: extras }
}

/**
 * Drops obvious non-image garbage before UI / collect paths.
 * Does **not** strip `/uploads/` or `/static/` — those may work behind proxy; broken ones are pruned client-side after load.
 */
export function filterObviousGarbageImageUrl(s: string): string | null {
  const t = typeof s === "string" ? s.trim() : ""
  if (t.length < 2) return null
  const lower = t.toLowerCase()
  if (lower === "undefined" || lower === "null" || lower === "[object object]") return null
  if (/^\s*(javascript|vbscript|data:text\/html):/i.test(t)) return null
  const ok =
    t.startsWith("http://") ||
    t.startsWith("https://") ||
    t.startsWith("/") ||
    t.startsWith("data:image/")
  if (!ok) return null
  return t
}

export function normalizeImageEntryUrl(entry: unknown): string | null {
  if (entry == null) return null
  if (typeof entry === "string") {
    const s = entry.trim()
    return s.length > 0 ? s : null
  }
  if (typeof entry !== "object") return null
  const o = entry as Record<string, unknown>
  const direct = o.url ?? o.URL ?? o.src
  if (typeof direct === "string" && direct.trim()) return direct.trim()
  const file = o.file
  if (file && typeof file === "object") {
    const fu = (file as Record<string, unknown>).url
    if (typeof fu === "string" && fu.trim()) return fu.trim()
  }
  return null
}

/** Case-insensitive basename key for carousel dedupe (OL-26-1 vs ol-26-1 paths). */
export function galleryImageBasenameKey(url: string): string {
  const base = url.split("/").pop() ?? url
  return base.toLowerCase()
}

function mainSrcMatchesUrl(mainNorm: string, url: string): boolean {
  if (!mainNorm) return false
  if (url === mainNorm) return true
  return galleryImageBasenameKey(url) === galleryImageBasenameKey(mainNorm)
}

function pushUniqueGalleryUrl(out: string[], url: string, mainNorm: string): void {
  const v = filterObviousGarbageImageUrl(url)
  if (!v) return
  if (mainSrcMatchesUrl(mainNorm, v)) return
  if (out.some((u) => u === v || galleryImageBasenameKey(u) === galleryImageBasenameKey(v))) return
  out.push(v)
}

/**
 * URLs from `product.images` only, for catalog card extras (not hero).
 * Omits empty/invalid entries, trims, dedupes, excludes `mainSrc` (canonical thumbnail).
 */
export function collectExtraProductImageUrls(
  product: Record<string, unknown>,
  mainSrc: string
): string[] {
  const mainNorm = typeof mainSrc === "string" ? mainSrc.trim() : ""
  const out: string[] = []
  const raw = product.images
  const list: unknown[] = Array.isArray(raw) ? raw : []
  for (const entry of list) {
    const u = normalizeImageEntryUrl(entry)
    if (u) pushUniqueGalleryUrl(out, u, mainNorm)
  }
  return out
}

/**
 * UI-only extras from a display group: every member's `images[]`, plus each
 * `thumbnail` that differs from `mainSrc` (typically the representative / PDP hero thumbnail).
 * Does not rewrite URLs; omits empty, dedupes, never returns `mainSrc`.
 */
export function collectDisplayGroupExtraImageUrls(
  members: Record<string, unknown>[],
  mainSrc: string
): string[] {
  const mainNorm = typeof mainSrc === "string" ? mainSrc.trim() : ""
  const out: string[] = []
  for (const m of members) {
    const raw = m.images
    const list: unknown[] = Array.isArray(raw) ? raw : []
    for (const entry of list) {
      const u = normalizeImageEntryUrl(entry)
      if (u) pushUniqueGalleryUrl(out, u, mainNorm)
    }
    const thumb = m.thumbnail
    if (typeof thumb === "string") pushUniqueGalleryUrl(out, thumb.trim(), mainNorm)
  }
  return out
}

/** Merge ordered URL lists for card/PDP extras; trims, dedupes, excludes `mainSrc`. */
export function mergeUniqueExtraUrls(mainSrc: string, segments: string[][]): string[] {
  const mainNorm = typeof mainSrc === "string" ? mainSrc.trim() : ""
  const out: string[] = []
  for (const seg of segments) {
    for (const u of seg) {
      if (typeof u !== "string") continue
      const s = filterObviousGarbageImageUrl(u)
      if (!s) continue
      if (mainNorm.length > 0 && s === mainNorm) continue
      if (!out.includes(s)) out.push(s)
    }
  }
  return out
}

/**
 * PDP thumb row: extras only — hero already shows `mainSrc` (no duplicate main thumb).
 */
export function buildPdpThumbStripUrls(mainSrc: string, extraSrcs: string[]): string[] {
  const mainNorm = typeof mainSrc === "string" ? mainSrc.trim() : ""
  const out: string[] = []
  for (const u of extraSrcs) {
    if (typeof u !== "string") continue
    pushUniqueGalleryUrl(out, u.trim(), mainNorm)
  }
  return out
}

/**
 * Gallery thumb strip: `mainSrc` first, then extras; trims and dedupes.
 * Catalog cards: hero is always a selectable thumb. PDP Oliver uses {@link buildPdpThumbStripUrls}.
 */
export function buildGalleryStripUrls(mainSrc: string, extraSrcs: string[]): string[] {
  const mainNorm = typeof mainSrc === "string" ? mainSrc.trim() : ""
  const out: string[] = []
  if (mainNorm) out.push(mainNorm)
  for (const u of extraSrcs) {
    if (typeof u !== "string") continue
    pushUniqueGalleryUrl(out, u.trim(), mainNorm)
  }
  return out
}

import { collectProductImageUrls } from "./oliver-buyer-gallery"

/** Thumbnail first, then `images[].url`, deduped (raw API strings). */
export { collectProductImageUrls } from "./oliver-buyer-gallery"

/** Alias for diagnostics (same as {@link collectProductImageUrls} after rollback). */
export function gatherRawProductImageUrls(product: Record<string, unknown>): string[] {
  return collectProductImageUrls(product)
}

export function mergeProductImageUrlsFromMembers(
  members: Record<string, unknown>[]
): string[] {
  const out: string[] = []
  for (const m of members) {
    for (const u of collectProductImageUrls(m)) {
      if (u && !out.includes(u)) out.push(u)
    }
  }
  return out
}
