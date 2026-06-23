import { createHash } from "crypto"
import { oliverGalleryColorHeroRoleOverrides } from "./oliver-finish-execution-guard"
import { existsSync, readdirSync, readFileSync } from "fs"
import path from "path"

function basenameKey(url: string): string {
  return (url.split("/").pop() ?? url).toLowerCase()
}

function oliverStaticRoots(): string[] {
  const cwd = process.cwd()
  const candidates = [
    path.join(cwd, "static/products/oliver"),
    path.join(cwd, "apps/backend/static/products/oliver"),
    path.join(cwd, "../backend/static/products/oliver"),
    path.join(__dirname, "../../static/products/oliver"),
  ]
  return Array.from(new Set(candidates)).filter((p) => existsSync(p))
}

function resolveOliverStaticPath(url: string): string | null {
  const base = url.split("/").pop()
  if (!base) return null
  for (const root of oliverStaticRoots()) {
    const direct = path.join(root, base)
    if (existsSync(direct)) return direct
    try {
      const hit = readdirSync(root).find((f) => f.toLowerCase() === base.toLowerCase())
      if (hit) return path.join(root, hit)
    } catch {
      /* ignore */
    }
  }
  return null
}

/** MD5 of local Oliver static asset; null when file is not on disk. */
export function contentHashForGalleryUrl(url: string): string | null {
  const filePath = resolveOliverStaticPath(url)
  if (!filePath) return null
  try {
    return createHash("md5").update(readFileSync(filePath)).digest("hex")
  } catch {
    return null
  }
}

/** Drop byte-identical Oliver workbook imports; keep first URL in buyer order. */
export function dedupeUrlsByContentHash(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const url of urls) {
    const hash = contentHashForGalleryUrl(url) ?? `basename:${basenameKey(url)}`
    if (seen.has(hash)) continue
    seen.add(hash)
    out.push(url)
  }
  return out
}

function findGallerySlot(urls: string[], slot: "03" | "04" | "05"): string | undefined {
  const re = new RegExp(`gallery[_\\-.]?${slot}(?:\\.|[-_]|$)`, "i")
  return urls.find((u) => re.test(basenameKey(u)))
}

function inferSiblingGallerySlotUrl(url: string, slot: "02" | "05" | "06"): string | null {
  const base = url.split("/").pop()
  if (!base) return null
  const sibling =
    slot === "02"
      ? base.replace(/gallery[_\-.]?01/i, "gallery_02")
      : base.replace(/gallery[_\-.]?03/i, `gallery_${slot}`)
  if (sibling === base) return null
  const prefix = url.slice(0, url.length - base.length)
  return `${prefix}${sibling}`
}

function oliverStaticPrefixFromUrls(urls: string[]): string {
  const hit = urls.find((u) => /\/products\/oliver\//i.test(u))
  if (hit) {
    const idx = hit.toLowerCase().indexOf("/products/oliver/")
    return hit.slice(0, idx + "/products/oliver/".length)
  }
  return "/static/products/oliver/"
}

/** `ol-64-1` → `OL-64-1` for canonical workbook filenames on disk. */
export function oliverWorkbookCodeFromHandle(handle: string): string | null {
  const m = handle.trim().toLowerCase().match(/^ol-(\d+-\d+(?:-[a-z0-9]+)?)$/i)
  if (!m) return null
  const tail = m[1]!
  return `OL-${tail.replace(/-([a-z])/g, (_, c: string) => `-${c.toUpperCase()}`)}`
}

function hasLegacyWorkbookHdImport(urls: string[]): boolean {
  return urls.some((u) => /^ol-\d+-\d+-i[12]\./i.test(basenameKey(u)))
}

function hasCanonicalGallerySlot(urls: string[], slot: "01" | "02" | "03" | "04" | "05"): boolean {
  const re = new RegExp(`gallery[_\\-.]?${slot}(?:\\.|[-_]|$)`, "i")
  return urls.some((u) => re.test(basenameKey(u)))
}

/**
 * Legacy assign injected `ol-*-i2` without `gallery_02` while canonical workbook file exists on disk.
 * Re-attach gallery_02 so apply can drop legacy hd and restore buyer order (3/4 → front → interior).
 */
export function restoreOliverCanonicalWorkbookUrls(
  urls: string[],
  handle?: string
): string[] {
  if (!handle?.toLowerCase().startsWith("ol-")) return urls
  if (!hasLegacyWorkbookHdImport(urls)) return urls
  if (!hasCanonicalGallerySlot(urls, "01") && !hasCanonicalGallerySlot(urls, "03")) return urls
  if (hasCanonicalGallerySlot(urls, "02")) return urls
  // Compact Pattern C (ol-01-2): legacy i2 is the real 3/4; do not inject gallery_02.
  if (buildOliverWorkbookTailRepair(urls).pattern === "C") return urls

  const g01 = urls.find((u) => /gallery[_\-.]?01/i.test(basenameKey(u)))
  const inferred = g01 ? inferSiblingGallerySlotUrl(g01, "02") : null
  const code = oliverWorkbookCodeFromHandle(handle)
  const prefix = oliverStaticPrefixFromUrls(urls)
  const candidates = [
    inferred,
    code ? `${prefix}${code}_gallery_02.jpg` : null,
    code ? `${prefix}${code.toLowerCase()}_gallery_02.jpg` : null,
  ].filter((u): u is string => Boolean(u))

  for (const url of candidates) {
    if (!resolveOliverStaticPath(url)) continue
    if (urls.some((u) => basenameKey(u) === basenameKey(url))) return urls
    return [...urls, url]
  }
  return urls
}

/** When canonical `gallery_01/02` are present, drop lowercase legacy `ol-*-i1/i2` hd imports. */
export function dropLegacyWorkbookImportWhenCanonicalGallery(urls: string[]): string[] {
  const hasG02 = hasCanonicalGallerySlot(urls, "02")
  const hasG01 = hasCanonicalGallerySlot(urls, "01")
  let out = urls
  if (hasG02) {
    out = out.filter((u) => !/[-_]i0?2(?:\.|[-_]|$)/i.test(basenameKey(u)))
  }
  if (hasG01) {
    out = out.filter((u) => !/[-_]i0?1(?:\.|[-_]|$)/i.test(basenameKey(u)))
  }
  return out
}

/** Read JPEG dimensions from a local Oliver static asset URL. */
export function readLocalImageDimensions(url: string): { width: number; height: number } | null {
  const filePath = resolveOliverStaticPath(url)
  if (!filePath) return null
  try {
    return jpegDimensionsFromBuffer(readFileSync(filePath))
  } catch {
    return null
  }
}

function jpegDimensionsFromBuffer(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++
      continue
    }
    const marker = buf[i + 1]!
    const len = buf.readUInt16BE(i + 2)
    if (marker === 0xc0 || marker === 0xc2) {
      return {
        height: buf.readUInt16BE(i + 5),
        width: buf.readUInt16BE(i + 7),
      }
    }
    i += 2 + len
  }
  return null
}

/** ~600×600 line-art scheme thumbnails in compact Oliver workbooks (ol-01-2, ol-25-1, …). */
function isCompactSchemeThumbnailSize(width: number, height: number): boolean {
  const mn = Math.min(width, height)
  const mx = Math.max(width, height)
  return mn >= 575 && mn <= 625 && mx >= 575 && mx <= 625
}

/** ~1000×1000 product shots paired with compact scheme thumbs. */
function isCompactProductPhotoSize(width: number, height: number): boolean {
  const mn = Math.min(width, height)
  const mx = Math.max(width, height)
  return mx >= 980 && mx <= 1020 && mn >= 980
}

function gallery05OnDisk(g03: string, g05InList?: string): boolean {
  const g05 = g05InList ?? inferSiblingGallerySlotUrl(g03, "05")
  return Boolean(g05 && resolveOliverStaticPath(g05))
}

function applyCompactSchemeTailRoles(
  g03: string,
  g04: string,
  roleByUrl: Map<string, string>
): boolean {
  const d3 = readLocalImageDimensions(g03)
  const d4 = readLocalImageDimensions(g04)
  if (!d3 || !d4) return false

  if (isCompactSchemeThumbnailSize(d3.width, d3.height) && isCompactProductPhotoSize(d4.width, d4.height)) {
    roleByUrl.set(g03, "scheme")
    roleByUrl.set(g04, "interior")
    return true
  }
  if (isCompactSchemeThumbnailSize(d4.width, d4.height) && isCompactProductPhotoSize(d3.width, d3.height)) {
    roleByUrl.set(g04, "scheme")
    roleByUrl.set(g03, "interior")
    return true
  }
  return false
}

export type OliverWorkbookTailPattern = "A" | "B" | "C" | null

/**
 * Workbook tail repair for poisoned Oliver ingests.
 *
 * Pattern A (ol-26-1): gallery_05 byte-dup of gallery_03 → scheme in gallery_04, drop gallery_05.
 * Pattern B (ol-03-1): gallery_06 byte-dup of gallery_03 on disk (orphan) → scheme in gallery_04,
 *   gallery_05 is a **second distinct interior** (different MD5) — reorder roles, **do not drop**.
 * Pattern C (ol-01-2): compact workbook g01–g04 only (no gallery_05 on disk) — ~600×600 line-art
 *   scheme in gallery_03 or gallery_04; paired ~1000×1000 frame = interior/product.
 */
export function buildOliverWorkbookTailRepair(urls: string[]): {
  roleByUrl: Map<string, string>
  dropUrls: Set<string>
  pattern: OliverWorkbookTailPattern
} {
  const roleByUrl = new Map<string, string>()
  const dropUrls = new Set<string>()
  const g03 = findGallerySlot(urls, "03")
  const g04 = findGallerySlot(urls, "04")
  const g05InList = findGallerySlot(urls, "05")
  if (!g03 || !g04) return { roleByUrl, dropUrls, pattern: null }

  const h03 = contentHashForGalleryUrl(g03)
  if (!h03) return { roleByUrl, dropUrls, pattern: null }

  const g05 = g05InList ?? inferSiblingGallerySlotUrl(g03, "05")
  if (g05) {
    const h05 = contentHashForGalleryUrl(g05)
    if (h05 && h03 === h05) {
      roleByUrl.set(g04, "scheme")
      if (g05InList) dropUrls.add(g05InList)
      return { roleByUrl, dropUrls, pattern: "A" }
    }
  }

  const g06Url = inferSiblingGallerySlotUrl(g03, "06")
  if (g06Url && g04) {
    const h06 = contentHashForGalleryUrl(g06Url)
    if (h06 && h03 === h06) {
      roleByUrl.set(g04, "scheme")
      if (g05InList) {
        const h05 = contentHashForGalleryUrl(g05InList)
        if (h05 && h05 !== h03) {
          roleByUrl.set(g05InList, "interior")
        }
      }
      return { roleByUrl, dropUrls, pattern: "B" }
    }
  }

  if (!gallery05OnDisk(g03, g05InList) && applyCompactSchemeTailRoles(g03, g04, roleByUrl)) {
    return { roleByUrl, dropUrls, pattern: "C" }
  }

  return { roleByUrl, dropUrls, pattern: null }
}

/**
 * Re-attach workbook slots dropped by a bad apply when the static file still exists.
 * Pattern B only: gallery_05 missing from Medusa but on disk with MD5 ≠ gallery_03.
 */
export function restoreOliverWorkbookTailUrls(urls: string[]): string[] {
  const g03 = findGallerySlot(urls, "03")
  if (!g03) return urls
  const g05InList = findGallerySlot(urls, "05")
  if (g05InList) return urls

  const g05Url = inferSiblingGallerySlotUrl(g03, "05")
  const g06Url = inferSiblingGallerySlotUrl(g03, "06")
  if (!g05Url || !g06Url) return urls

  const h03 = contentHashForGalleryUrl(g03)
  const h06 = contentHashForGalleryUrl(g06Url)
  const h05 = contentHashForGalleryUrl(g05Url)
  if (!h03 || !h06 || h03 !== h06 || !h05 || h05 === h03) return urls
  if (!resolveOliverStaticPath(g05Url)) return urls

  const prefix = g03.slice(0, g03.length - (g03.split("/").pop()?.length ?? 0))
  const base = g05Url.split("/").pop()!
  const canonical = `${prefix}${base}`
  if (urls.some((u) => basenameKey(u) === basenameKey(canonical))) return urls
  return [...urls, canonical]
}

/** @deprecated use buildOliverWorkbookTailRepair */
export function buildOliverPoisonedSchemeRoleOverrides(urls: string[]): Map<string, string> {
  return buildOliverWorkbookTailRepair(urls).roleByUrl
}

function applyWorkbookTailRepair(urls: string[], urlsOriginal: string[]): {
  urls: string[]
  roleByUrl: Map<string, string>
  pattern: OliverWorkbookTailPattern
} {
  const { roleByUrl, dropUrls, pattern } = buildOliverWorkbookTailRepair(urlsOriginal)
  const filtered = urls.filter((u) => !dropUrls.has(u))
  return { urls: filtered, roleByUrl, pattern }
}

/** Drop legacy i1/i2 when gallery_01/02 exist; keeps color_* variant frames. */
export function dropLegacyWorkbookSemanticPairDuplicates(urls: string[]): string[] {
  let out = urls
  const base = (url: string) => basenameKey(url)

  const dropPair = (legacyRe: RegExp, galleryRe: RegExp, dropLegacy: boolean) => {
    const legacy = out.find((u) => legacyRe.test(base(u)))
    const gallery = out.find((u) => galleryRe.test(base(u)))
    if (!legacy || !gallery || legacy === gallery) return
    const victim = dropLegacy ? legacy : gallery
    out = out.filter((u) => u !== victim)
  }

  dropPair(/[-_]i0?2(?:\.|[-_]|$)/i, /gallery[_\-.]?02/i, false)
  dropPair(/[-_]i0?1(?:\.|[-_]|$)/i, /gallery[_\-.]?01/i, true)
  return out
}

export function prepareOliverBuyerGallery(
  urls: string[],
  handle: string,
  collapse: (
    list: string[],
    opts?: { handle?: string; roleByUrl?: Map<string, string> }
  ) => string[]
): string[] {
  const expanded = restoreOliverWorkbookTailUrls(
    restoreOliverCanonicalWorkbookUrls(urls, handle)
  )
  const deduped = dedupeUrlsByContentHash(expanded)
  const withoutLegacyHd = dropLegacyWorkbookImportWhenCanonicalGallery(deduped)
  const pairs = dropLegacyWorkbookSemanticPairDuplicates(withoutLegacyHd)
  const { urls: repaired, roleByUrl } = applyWorkbookTailRepair(pairs, expanded)
  for (const [url, role] of oliverGalleryColorHeroRoleOverrides(repaired, handle)) {
    roleByUrl.set(url, role)
  }
  return collapse(repaired, { handle, roleByUrl })
}

/** Multi-color Oliver: hash-dedupe + legacy pair drop + sort — keep per-color fronts. */
export function prepareOliverBuyerGalleryHashOnly(
  urls: string[],
  handle: string,
  sort: (
    list: string[],
    opts?: { handle?: string; roleByUrl?: Map<string, string> }
  ) => string[]
): string[] {
  const expanded = restoreOliverWorkbookTailUrls(
    restoreOliverCanonicalWorkbookUrls(urls, handle)
  )
  const deduped = dedupeUrlsByContentHash(expanded)
  const withoutLegacyHd = dropLegacyWorkbookImportWhenCanonicalGallery(deduped)
  const pairs = dropLegacyWorkbookSemanticPairDuplicates(withoutLegacyHd)
  const { urls: repaired, roleByUrl } = applyWorkbookTailRepair(pairs, expanded)
  for (const [url, role] of oliverGalleryColorHeroRoleOverrides(repaired, handle)) {
    roleByUrl.set(url, role)
  }
  return sort(repaired, { handle, roleByUrl })
}
