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

import {
  mediaNearDupCollapseForHandle,
  mediaNearDupDropBasenameSet,
} from "./media-near-dup-collapse"

function medusaBackendBaseForImages(): string {
  // Host classification only — never used as img src prefix after same-origin rewrite.
  // Empty when unset so client chunks do not embed localhost:9000.
  const raw =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || ""
      : ""
  return String(raw).replace(/\/$/, "")
}

/**
 * Browser-safe product image URL: `/static/...` and `/uploads/...` are served by Medusa, not Next.
 * Prefer same-origin storefront paths — never emit public `:9000` as img src.
 */
export function resolveMedusaBackendImageUrl(url: string): string {
  const t = typeof url === "string" ? url.trim() : ""
  if (!t) return t
  if (t.startsWith("data:")) return t
  if (t.startsWith("http://") || t.startsWith("https://")) {
    try {
      const u = new URL(t)
      if (u.pathname.startsWith("/static/")) {
        return `/product-static${u.pathname.slice("/static".length)}${u.search}${u.hash}`
      }
      if (u.pathname.startsWith("/uploads/")) {
        return `${u.pathname}${u.search}${u.hash}`
      }
      if (u.hostname === "medusa" || u.hostname.endsWith(".medusa")) {
        u.hostname = "localhost"
        return u.toString()
      }
    } catch {
      /* ignore */
    }
    return t
  }
  if (t.startsWith("/static/")) {
    return `/product-static${t.slice("/static".length)}`
  }
  if (t.startsWith("/uploads/")) {
    return t
  }
  return t
}

function isMedusaBackendHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === "medusa" || h.endsWith(".medusa")) return true
  if (h === "localhost" || h === "127.0.0.1" || h === "host.docker.internal") {
    return true
  }
  const configured = medusaBackendBaseForImages()
  if (!configured) return false
  try {
    const backendHost = new URL(configured).hostname.toLowerCase()
    if (!backendHost || backendHost === "0.0.0.0") return false
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
    // Same-origin via Next rewrite `/uploads` → Medusa `/uploads` (no public :9000).
    return s
  }
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      const u = new URL(s)
      if (u.pathname.startsWith("/static/")) {
        return `/product-static${u.pathname.slice("/static".length)}${u.search}${u.hash}`
      }
      if (u.pathname.startsWith("/uploads/")) {
        return `${u.pathname}${u.search}${u.hash}`
      }
      if (isMedusaBackendHost(u.hostname)) {
        return `${u.pathname}${u.search}${u.hash}`
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

/**
 * OG / JSON-LD primary product image: thumbnail (or any media URL) → same-origin `/product-static`.
 * Never leave environment-specific hosts (`localhost`, demo IP, public `:9000`) in metadata output.
 */
export function resolveProductPrimaryImageForMeta(
  thumbnail: string | null | undefined
): string | undefined {
  const s = typeof thumbnail === "string" ? thumbnail.trim() : ""
  if (!s) return undefined
  return resolveStorefrontProductImageSrc(s)
}


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
  const base = (t.split("/").pop() ?? t).toLowerCase()
  if (
    base === "pv-14-1_legacy_main.png" ||
    base === "pv-14-1_main.jpg" ||
    /^screenshot_101_.*\.png$/i.test(base)
  ) {
    return null
  }
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

/** Pathname without query; absolute URLs → pathname only. */
function galleryUrlPathname(url: string): string {
  const trimmed = typeof url === "string" ? url.trim() : ""
  if (!trimmed) return ""
  let path = trimmed.split("?")[0] ?? trimmed
  try {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      path = new URL(path).pathname
    }
  } catch {
    /* keep path */
  }
  return path
}

/**
 * Stem after stripping `/derivatives/card/` (helper for derivative↔original only).
 * Do not use alone for gallery dedupe — prefer `isCatalogDerivativeOriginalPair`.
 */
export function galleryAssetStemKey(url: string): string {
  let path = galleryUrlPathname(url)
  if (!path) return ""
  path = path.replace(/\/derivatives\/card\//i, "/")
  const base = path.split("/").pop() ?? path
  return base.replace(/\.(webp|jpe?g|png|gif|avif)$/i, "").toLowerCase()
}

/**
 * True only for catalog card derivative ↔ sibling original:
 * `…/derivatives/card/foo.webp` ↔ `…/foo.jpg` (same parent dir after strip).
 * Does NOT collapse arbitrary same-stem different extensions (foo.jpg vs foo.png).
 */
export function isCatalogDerivativeOriginalPair(a: string, b: string): boolean {
  const pathA = galleryUrlPathname(a)
  const pathB = galleryUrlPathname(b)
  if (!pathA || !pathB) return false
  const derA = /\/derivatives\/card\//i.test(pathA)
  const derB = /\/derivatives\/card\//i.test(pathB)
  if (derA === derB) return false
  const derPath = derA ? pathA : pathB
  const origPath = derA ? pathB : pathA
  const derBase = derPath.split("/").pop() ?? ""
  const origBase = origPath.split("/").pop() ?? ""
  // Catalog card derivatives are webp; originals are raster siblings.
  if (!/\.webp$/i.test(derBase)) return false
  if (!/\.(jpe?g|png)$/i.test(origBase)) return false
  const stemA = galleryAssetStemKey(a)
  const stemB = galleryAssetStemKey(b)
  if (!stemA || !stemB || stemA !== stemB) return false
  const normA = pathA.replace(/\/derivatives\/card\//i, "/")
  const normB = pathB.replace(/\/derivatives\/card\//i, "/")
  const slashA = normA.lastIndexOf("/")
  const slashB = normB.lastIndexOf("/")
  const dirA = (slashA >= 0 ? normA.slice(0, slashA) : "").toLowerCase()
  const dirB = (slashB >= 0 ? normB.slice(0, slashB) : "").toLowerCase()
  return dirA === dirB
}

function mainSrcMatchesUrl(mainNorm: string, url: string): boolean {
  if (!mainNorm) return false
  if (url === mainNorm) return true
  if (galleryImageBasenameKey(url) === galleryImageBasenameKey(mainNorm)) {
    return true
  }
  return isCatalogDerivativeOriginalPair(mainNorm, url)
}

function pushUniqueGalleryUrl(out: string[], url: string, mainNorm: string): void {
  const v = filterObviousGarbageImageUrl(url)
  if (!v) return
  if (mainSrcMatchesUrl(mainNorm, v)) return
  if (out.some((u) => u === v || galleryImageBasenameKey(u) === galleryImageBasenameKey(v))) return
  out.push(v)
}

/** Angle / gallery-slot basename (iso, iN, gallery_NN) - not finish color frames. */
export function isAngleLikeGalleryBasename(url: string): boolean {
  const b = galleryImageBasenameKey(url)
  return /(?:^|[-_])(?:iso[-_]?\d*|i\d+|gallery[-_]?\d+)(?:[-_.]|$)/i.test(b)
}

/** Finish/color execution frame (`*_color_torno_01.jpg`), not a camera-angle sibling. */
export function isColorFinishFrameBasename(url: string): boolean {
  return /_color_/i.test(galleryImageBasenameKey(url))
}

function isBareIsoBasename(b: string): boolean {
  return /[-_]iso(?![-_]?\d)(?:[._-]|$)/i.test(b)
}

/**
 * Exact basename match only. Filename “twins” (iso ↔ iso-1, iN ↔ gallery_0N)
 * must not collapse without perceptual evidence — see media-near-dup-collapse.
 */
export function areNearDuplicateProductImages(a: string, b: string): boolean {
  const ba = galleryImageBasenameKey(a)
  const bb = galleryImageBasenameKey(b)
  if (!ba || !bb) return false
  return ba === bb
}

/**
 * Heuristic quality score (client-safe, no fs). Prefer numbered iso / gallery /
 * explicit WxH in the filename over bare iso / legacy i-frames.
 */
export function productImageQualityScore(url: string): number {
  const b = galleryImageBasenameKey(url)
  let score = 0
  const dim = b.match(/(\d{3,4})x(\d{3,4})/)
  if (dim) score += Number(dim[1]) * Number(dim[2])
  if (/iso[-_]?1(?:[._-]|$)/i.test(b)) score += 12_000
  else if (/iso[-_]?\d+(?:[._-]|$)/i.test(b)) score += 10_000
  else if (isBareIsoBasename(b)) score += 4_000
  if (/gallery[_\-.]?\d+/i.test(b)) score += 11_000
  if (/[-_]i0?\d(?:\.|[-_]|$)/i.test(b)) score += 3_500
  if (/__1_/.test(b)) score -= 500
  score += Math.min(b.length, 100)
  return score
}

/**
 * Catalog / PDP: drop evidence-backed near-dups; exact-basename dedupe only otherwise.
 * Never blind-collapses iso ↔ iso-1 (false twins like av-05-1).
 */
export function resolveCardHeroAndNearDuplicateExtras(
  mainSrc: string,
  extras: string[],
  handle?: string | null
): { mainSrc: string; extraSrcs: string[] } {
  const rawMain = typeof mainSrc === "string" ? mainSrc.trim() : ""
  let main = filterObviousGarbageImageUrl(rawMain) || rawMain
  if (!main) {
    return { mainSrc: "", extraSrcs: [] }
  }

  const dropSet = mediaNearDupDropBasenameSet(handle)
  const collapse = mediaNearDupCollapseForHandle(handle)
  const keepKey = collapse?.keep_basename
    ? galleryImageBasenameKey(collapse.keep_basename)
    : ""

  const pool: string[] = [main]
  for (const raw of extras) {
    if (typeof raw !== "string") continue
    const extra = filterObviousGarbageImageUrl(raw.trim())
    if (!extra) continue
    if (mainSrcMatchesUrl(main, extra)) continue
    if (pool.some((u) => mainSrcMatchesUrl(u, extra))) continue
    pool.push(extra)
  }

  const kept = pool.filter((u) => !dropSet.has(galleryImageBasenameKey(u)))
  if (kept.length === 0) {
    return { mainSrc: main, extraSrcs: [] }
  }

  const keepUrl =
    keepKey.length > 0
      ? kept.find((u) => galleryImageBasenameKey(u) === keepKey)
      : undefined

  if (dropSet.has(galleryImageBasenameKey(main))) {
    main = keepUrl ?? kept[0]!
  }

  const survivors: string[] = []
  for (const u of kept) {
    if (mainSrcMatchesUrl(main, u)) continue
    if (survivors.some((s) => mainSrcMatchesUrl(s, u))) continue
    survivors.push(u)
  }

  return { mainSrc: main, extraSrcs: survivors }
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
 * @deprecated Prefer {@link buildGalleryStripUrls}. Kept for callers that need
 * extras-only probe lists; buyer rails must include the hero.
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
 * Catalog cards and PDP buyer rails share this main-first contract.
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

import { collectProductImageUrls } from "./collect-product-image-urls"

/** Thumbnail first, then `images[].url`, deduped (raw API strings). */
export { collectProductImageUrls } from "./collect-product-image-urls"

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
