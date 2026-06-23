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
