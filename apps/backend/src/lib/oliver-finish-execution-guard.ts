/**
 * Oliver false finish-color split guard.
 *
 * Pattern (ol-57-1): `gallery_01` = fabric detail close-up, `color_{fabric}_01` = hero on white.
 * Prefill/heuristic metadata wrongly buckets them as two finish colors (cream + lilian).
 */
import type { ColorExecution } from "./gallery-buyer-sort"

function basenameKey(url: string): string {
  return (url.split("/").pop() ?? url).toLowerCase()
}

function normalizeUrlKey(url: string): string {
  const s = url.trim()
  const m = s.match(/(\/static\/products\/[^\s?#]+)/i)
  return (m?.[1] ?? s).toLowerCase()
}

export function extractOliverColorTokenFromUrl(url: string): string | null {
  const hay = basenameKey(url)
  const explicit = hay.match(/(?:color|colour)[_-]([a-z0-9-]+)/i)
  if (explicit?.[1]) {
    const t = explicit[1].toLowerCase()
    return t === "lillian" ? "lilian" : t
  }
  return null
}

export type OliverGalleryColorHeroPair = {
  gallery01: string
  colorHero: string
  colorToken: string
}

/** Exactly gallery_01 + color_{name}_01 — one fabric, not two finish variants. */
export function detectOliverGalleryColorHeroPair(
  urls: string[]
): OliverGalleryColorHeroPair | null {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))]
  if (unique.length !== 2) return null

  const gallery01 = unique.find((u) => /gallery[_\-.]?01(?:\.|[-_]|$)/i.test(basenameKey(u)))
  const colorHero = unique.find((u) =>
    /color[_-][a-z0-9-]+[_-]0?1(?:\.|[-_]|$)/i.test(basenameKey(u))
  )
  if (!gallery01 || !colorHero) return null

  const colorToken = extractOliverColorTokenFromUrl(colorHero)
  if (!colorToken) return null
  if (extractOliverColorTokenFromUrl(gallery01)) return null

  return { gallery01, colorHero, colorToken }
}

export function isOliverFalseFinishColorSplit(
  urls: string[],
  executions: ColorExecution[] | null | undefined,
  handle?: string
): boolean {
  if (!handle?.toLowerCase().startsWith("ol-")) return false
  if (!executions || executions.length < 2) return false
  return detectOliverGalleryColorHeroPair(urls) != null
}

/** Merge spurious dual finish metadata → single fabric execution; hero first, detail second. */
export function repairOliverFalseFinishColorExecutions(
  executions: ColorExecution[] | null | undefined,
  urls: string[],
  handle?: string
): { executions: ColorExecution[] | null; changed: boolean; pair: OliverGalleryColorHeroPair | null } {
  const pair = detectOliverGalleryColorHeroPair(urls)
  if (!pair || !handle?.toLowerCase().startsWith("ol-")) {
    return { executions: executions ?? null, changed: false, pair: null }
  }
  if (!executions || executions.length < 2) {
    return { executions: executions ?? null, changed: false, pair }
  }

  const label =
    executions.find((e) => e.key === pair.colorToken)?.label?.trim() ||
    executions.find((e) =>
      e.urls?.some((u) => normalizeUrlKey(u) === normalizeUrlKey(pair.colorHero))
    )?.label?.trim() ||
    pair.colorToken

  const merged: ColorExecution = {
    key: pair.colorToken,
    label,
    urls: [pair.colorHero, pair.gallery01],
  }

  return { executions: [merged], changed: true, pair }
}

/** After false-split merge: drop stale cream/spurious keys from prefill labels. */
export function labelsForMergedFalseFinishExecution(
  merged: ColorExecution
): Record<string, string> {
  const label = merged.label?.trim() || merged.key
  return { [merged.key]: label }
}

/** Repair executions + prune stale labels when pair already merged in DB. */
export function reconcileOliverFalseFinishMetadata(
  meta: Record<string, unknown>,
  urls: string[],
  handle?: string
): boolean {
  if (!handle?.toLowerCase().startsWith("ol-")) return false
  const pair = detectOliverGalleryColorHeroPair(urls)
  if (!pair) return false

  let changed = false
  const finishRaw = Array.isArray(meta.finish_color_executions)
    ? (meta.finish_color_executions as ColorExecution[])
    : null

  if (finishRaw && finishRaw.length >= 2) {
    const repaired = repairOliverFalseFinishColorExecutions(finishRaw, urls, handle)
    if (repaired.changed && repaired.executions) {
      meta.finish_color_executions = repaired.executions
      if (repaired.executions.length === 1) {
        meta.finish_color_labels = labelsForMergedFalseFinishExecution(repaired.executions[0]!)
        delete meta.paint_finish_executions
      }
      changed = true
    }
  } else if (finishRaw?.length === 1) {
    const labels = meta.finish_color_labels
    if (labels && typeof labels === "object" && !Array.isArray(labels) && Object.keys(labels).length > 1) {
      meta.finish_color_labels = labelsForMergedFalseFinishExecution(finishRaw[0]!)
      delete meta.paint_finish_executions
      changed = true
    }
  }

  return changed
}

/**
 * Oliver 3-frame workbook: g01 = closed front, g02 = open doors (interior), g03 = scheme drawing.
 * Filename `gallery_02` is NOT 3/4 — lesson #21 i2→g02 restore must not apply.
 */
export const OLIVER_GALLERY_02_AS_INTERIOR_HANDLES = new Set(["ol-42-1"])

/**
 * Oliver 2-frame workbook: g01 = closed front, g02 = unfolded / functional interior (sofa-bed).
 * Differs from minimal detail workbook (g02 = macro detail) and 3-frame interior (g03 scheme).
 */
export const OLIVER_GALLERY_02_AS_INTERIOR_TWO_FRAME_HANDLES = new Set(["ol-57-3"])

export function isOliverTwoFrameGalleryWorkbook(
  urls: string[],
  handle?: string
): boolean {
  const h = handle?.toLowerCase()
  if (!h?.startsWith("ol-")) return false
  const keys = urls.map((u) => basenameKey(u))
  const hasG01 = keys.some((k) => /gallery[_\-.]?01(?:\.|[-_]|$)/i.test(k))
  const hasG02 = keys.some((k) => /gallery[_\-.]?02(?:\.|[-_]|$)/i.test(k))
  const hasG03Plus = keys.some((k) => /gallery[_\-.]?0[3-9](?:\.|[-_]|$)/i.test(k))
  const hasI1 = keys.some((k) => /[-_]i0?1(?:\.|[-_]|$)/i.test(k))
  const hasI2 = keys.some((k) => /[-_]i0?2(?:\.|[-_]|$)/i.test(k))
  const onlyG01G02 = keys.every((k) => /gallery[_\-.]?0[12](?:\.|[-_]|$)/i.test(k))
  return (
    hasG01 &&
    hasG02 &&
    !hasG03Plus &&
    !hasI1 &&
    !hasI2 &&
    onlyG01G02 &&
    keys.length === 2
  )
}

export function isOliverGallery02TwoFrameInteriorWorkbook(
  urls: string[],
  handle?: string
): boolean {
  const h = handle?.toLowerCase()
  if (!h?.startsWith("ol-") || !OLIVER_GALLERY_02_AS_INTERIOR_TWO_FRAME_HANDLES.has(h)) {
    return false
  }
  return isOliverTwoFrameGalleryWorkbook(urls, handle)
}

export function isOliverGallery02InteriorWorkbook(
  urls: string[],
  handle?: string
): boolean {
  const h = handle?.toLowerCase()
  if (!h?.startsWith("ol-") || !OLIVER_GALLERY_02_AS_INTERIOR_HANDLES.has(h)) return false
  const keys = urls.map((u) => basenameKey(u))
  const hasG01 = keys.some((k) => /gallery[_\-.]?01(?:\.|[-_]|$)/i.test(k))
  const hasG02 = keys.some((k) => /gallery[_\-.]?02(?:\.|[-_]|$)/i.test(k))
  const hasG03 = keys.some((k) => /gallery[_\-.]?03(?:\.|[-_]|$)/i.test(k))
  return hasG01 && hasG02 && hasG03
}

/**
 * Oliver 3-frame detail workbook (lesson #28): g01=front, g02=detail, g03=interior.
 * Regex `gallery_02` alone is NOT 3/4 for these handles (cf. ol-64-1 where g02 = 3/4).
 */
export const OLIVER_THREE_FRAME_DETAIL_HANDLES = new Set(["ol-65-2"])

/**
 * Oliver 3-frame detail workbook: only gallery_01 + gallery_02 + gallery_03 (no i*, no g04+).
 * g01 = front на белом, g02 = detail (macro), g03 = interior. Regex `gallery_02` ≠ 3/4.
 */
export function isOliverThreeFrameDetailWorkbook(
  urls: string[],
  handle?: string
): boolean {
  const h = handle?.toLowerCase()
  if (!h?.startsWith("ol-") || !OLIVER_THREE_FRAME_DETAIL_HANDLES.has(h)) return false
  if (OLIVER_GALLERY_02_AS_INTERIOR_HANDLES.has(h)) return false
  if (OLIVER_GALLERY_02_AS_INTERIOR_TWO_FRAME_HANDLES.has(h)) return false

  const keys = urls.map((u) => basenameKey(u))
  const hasG01 = keys.some((k) => /gallery[_\-.]?01(?:\.|[-_]|$)/i.test(k))
  const hasG02 = keys.some((k) => /gallery[_\-.]?02(?:\.|[-_]|$)/i.test(k))
  const hasG03 = keys.some((k) => /gallery[_\-.]?03(?:\.|[-_]|$)/i.test(k))
  const hasG04Plus = keys.some((k) => /gallery[_\-.]?0[4-9](?:\.|[-_]|$)/i.test(k))
  const hasLegacyI = keys.some((k) => /[-_]i0?\d(?:\.|[-_]|$)/i.test(k))
  if (!hasG01 || !hasG02 || !hasG03 || hasG04Plus || hasLegacyI) return false

  const galleryOnly = keys.filter((k) => /gallery[_\-.]?0[123](?:\.|[-_]|$)/i.test(k))
  if (galleryOnly.length !== 3) return false

  const withoutMain = urls.filter((u) => !/_main\.jpg$/i.test(basenameKey(u)))
  if (isOliverTwoFrameGalleryWorkbook(withoutMain, handle)) return false

  return true
}

export function oliverThreeFrameDetailWorkbookRoleOverrides(
  urls: string[],
  handle?: string
): Map<string, string> {
  const roleByUrl = new Map<string, string>()
  if (!isOliverThreeFrameDetailWorkbook(urls, handle)) return roleByUrl
  for (const url of urls) {
    const hay = basenameKey(url)
    if (/_main\.jpg$/i.test(hay)) roleByUrl.set(url, "front")
    else if (/gallery[_\-.]?01(?:\.|[-_]|$)/i.test(hay)) roleByUrl.set(url, "front")
    else if (/gallery[_\-.]?02(?:\.|[-_]|$)/i.test(hay)) roleByUrl.set(url, "detail")
    else if (/gallery[_\-.]?03(?:\.|[-_]|$)/i.test(hay)) roleByUrl.set(url, "interior")
  }
  return roleByUrl
}

/** Skip lesson #21 g02 injection when workbook is g01+g03 interior class (g02 may be absent). */
export function shouldSkipOliverGallery02Restore(
  urls: string[],
  handle?: string
): boolean {
  const h = handle?.toLowerCase()
  if (!h?.startsWith("ol-") || !OLIVER_GALLERY_02_AS_INTERIOR_HANDLES.has(h)) return false
  const keys = urls.map((u) => basenameKey(u))
  const hasG01 = keys.some((k) => /gallery[_\-.]?01(?:\.|[-_]|$)/i.test(k))
  const hasG03 = keys.some((k) => /gallery[_\-.]?03(?:\.|[-_]|$)/i.test(k))
  return hasG01 && hasG03
}

export function oliverGallery02InteriorWorkbookRoleOverrides(
  urls: string[],
  handle?: string
): Map<string, string> {
  const roleByUrl = new Map<string, string>()
  if (isOliverGallery02InteriorWorkbook(urls, handle)) {
    for (const url of urls) {
      const hay = basenameKey(url)
      if (/gallery[_\-.]?01(?:\.|[-_]|$)/i.test(hay)) roleByUrl.set(url, "front")
      else if (/gallery[_\-.]?02(?:\.|[-_]|$)/i.test(hay)) roleByUrl.set(url, "interior")
      else if (/gallery[_\-.]?03(?:\.|[-_]|$)/i.test(hay)) roleByUrl.set(url, "scheme")
    }
    return roleByUrl
  }
  if (!isOliverGallery02TwoFrameInteriorWorkbook(urls, handle)) return roleByUrl
  for (const url of urls) {
    const hay = basenameKey(url)
    if (/gallery[_\-.]?01(?:\.|[-_]|$)/i.test(hay)) roleByUrl.set(url, "front")
    else if (/gallery[_\-.]?02(?:\.|[-_]|$)/i.test(hay)) roleByUrl.set(url, "interior")
  }
  return roleByUrl
}

/** Role overrides: color hero = front, gallery_01 = detail (same SKU). */
export function oliverGalleryColorHeroRoleOverrides(
  urls: string[],
  handle?: string
): Map<string, string> {
  const pair = detectOliverGalleryColorHeroPair(urls)
  const roleByUrl = new Map<string, string>()
  if (!pair || !handle?.toLowerCase().startsWith("ol-")) return roleByUrl

  for (const url of urls) {
    const key = normalizeUrlKey(url)
    if (key === normalizeUrlKey(pair.colorHero)) roleByUrl.set(url, "front")
    if (key === normalizeUrlKey(pair.gallery01)) roleByUrl.set(url, "detail")
  }
  return roleByUrl
}

/** Legacy workbook import: `ol-23-1-lillian-080-hd-i1.jpg` — not a buyer finish dimension. */
export function isLegacyHdImportUrl(url: string): boolean {
  return /[-_]hd[-_]i\d/i.test(basenameKey(url))
}

function fabricExecutionsRaw(meta: Record<string, unknown>): ColorExecution[] | null {
  const raw = meta.fabric_upholstery_executions ?? meta.upholstery_color_executions
  return Array.isArray(raw) && raw.length > 0 ? (raw as ColorExecution[]) : null
}

function finishExecutionsRaw(meta: Record<string, unknown>): ColorExecution[] | null {
  const raw = meta.finish_color_executions ?? meta.paint_finish_executions
  return Array.isArray(raw) && raw.length > 0 ? (raw as ColorExecution[]) : null
}

/**
 * Oliver multi-fabric SKU: `fabric_upholstery_executions` is canonical;
 * legacy prefill also wrote duplicate keys (+ spurious `cream`) to `finish_color_executions`.
 */
export function shouldSuppressOliverFinishWhenFabricCanonical(
  handle: string | undefined,
  meta: Record<string, unknown> | undefined
): boolean {
  if (!handle?.toLowerCase().startsWith("ol-") || !meta) return false
  const fabric = fabricExecutionsRaw(meta)
  const finish = finishExecutionsRaw(meta)
  return Boolean(fabric && fabric.length >= 2 && finish && finish.length >= 2)
}

/** Drop duplicate finish metadata when fabric upholstery is canonical (ol-23-1 class). */
export function reconcileOliverFabricFinishMetadata(
  meta: Record<string, unknown>,
  handle?: string
): boolean {
  if (!shouldSuppressOliverFinishWhenFabricCanonical(handle, meta)) return false

  // Medusa merges metadata — `delete` is ignored; null clears the key.
  meta.finish_color_executions = null
  meta.paint_finish_executions = null

  const fabric = fabricExecutionsRaw(meta)!
  const labels: Record<string, string> = {}
  for (const entry of fabric) {
    if (entry?.key && entry.label?.trim()) {
      labels[entry.key] = entry.label.trim()
    }
  }
  if (Object.keys(labels).length > 0) {
    meta.finish_color_labels = labels
  } else {
    delete meta.finish_color_labels
  }

  return true
}
