/**
 * Buyer-facing gallery sort — canonical order for catalog/PDP carousels.
 *
 * Policy:
 * 1. White-bg product shots first
 * 2. front_3_4 → front → open doors (interior) → detail → scheme
 * 3. Lifestyle / room interior last — shared across color variants
 */

import { detectOliverGalleryColorHeroPair } from "./oliver-finish-execution-guard"

export type BuyerVisualRole =
  | "front_3_4"
  | "closed_front"
  | "hero_front"
  | "front_anfas"
  | "interior"
  | "detail"
  | "scheme"
  | "lifestyle"
  | "unknown"

/** Lower rank = earlier in gallery. Aligns with operator buyer policy. */
export const BUYER_ROLE_RANK: Record<BuyerVisualRole, number> = {
  front_3_4: 10,
  closed_front: 20,
  hero_front: 21,
  front_anfas: 22,
  interior: 30,
  detail: 40,
  scheme: 50,
  lifestyle: 90,
  unknown: 80,
}

export type OperatorRoleHint =
  | "front"
  | "front_3_4"
  | "side"
  | "detail"
  | "interior"
  | "scheme"
  | "unknown"

const SCHEME_RE =
  /схем|черт[её]ж|blueprint|schematic|dimension|technical[_\s-]?draw|line[\s-]?art|plan[_\s-]?view|spec[_\s-]?sheet|(?:^|[_\-.])draw(?:ing)?(?:[_\-.]|$)/i
const INTERIOR_OPEN_RE =
  /interior|inside|внутр|открыт|open(?:ed)?[\s_-]?(?:door|wardrobe)|doors?[\s_-]?open|shelf|shelves|полк|drawer[\s_-]?open|interior[_\s-]?view/i
const LIFESTYLE_RE =
  /lifestyle|staged|in[\s_-]?room|room[\s_-]?shot|комнат|ambiente|bedroom|living[\s_-]?room|kids[\s_-]?room|_int_/i
const DETAIL_RE =
  /detail|close[\s_-]?up|крупн|texture|фурнит|hardware|hinge|enlarged|crop/i
const ANGLE_3_4_RE =
  /(?:^|[-_.])iso(?:[-_.]|$)|[-_]iso[-_]?\d|3-4|3\/4|three[\s_-]?quarter|angle|angled|perspective|gallery[_\-.]?02|color_[a-z]+_02|[-_]i0?2(?:\.|[-_]|$)/i
const FRONT_RE = /front|frontal|фасад|фронт|анфас|anfas|main|hero|gallery[_\-.]?01|color_[a-z]+_01|[-_]i0?1(?:\.|[-_]|$)/i
const CLOSED_RE = /closed|закрыт|doors?[\s_-]?closed/i

function haystack(url: string): string {
  return (url.split("/").pop() ?? url).toLowerCase()
}

function basenameKey(url: string): string {
  return haystack(url)
}

/**
 * Oliver short workbook: only gallery_01 + gallery_02 in Medusa (no i1/i2, no gallery_03+).
 * Slot convention for confirmed handles: g01 = white-bg front, g02 = detail — not 3/4.
 *
 * ol-08-1-mirror also has 2 frames but different semantics (g02 = front, not detail) — excluded.
 */
export const OLIVER_GALLERY_02_AS_DETAIL_HANDLES = new Set(["ol-69-4"])

export function isOliverMinimalTwoFrameWorkbook(
  urls: string[],
  handle?: string
): boolean {
  const h = handle?.toLowerCase()
  if (!h?.startsWith("ol-")) return false
  if (!OLIVER_GALLERY_02_AS_DETAIL_HANDLES.has(h)) return false
  const keys = urls.map(basenameKey)
  const hasG01 = keys.some((k) => /gallery[_\-.]?01(?:\.|[-_]|$)/i.test(k))
  const hasG02 = keys.some((k) => /gallery[_\-.]?02(?:\.|[-_]|$)/i.test(k))
  const hasG03Plus = keys.some((k) => /gallery[_\-.]?0[3-9](?:\.|[-_]|$)/i.test(k))
  const hasI1 = keys.some((k) => /[-_]i0?1(?:\.|[-_]|$)/i.test(k))
  const hasI2 = keys.some((k) => /[-_]i0?2(?:\.|[-_]|$)/i.test(k))
  const galleryWorkbookCount = keys.filter((k) =>
    /gallery[_\-.]?0[12](?:\.|[-_]|$)/i.test(k)
  ).length
  return (
    hasG01 &&
    hasG02 &&
    !hasG03Plus &&
    !hasI1 &&
    !hasI2 &&
    galleryWorkbookCount === 2 &&
    keys.length === 2
  )
}

function minimalWorkbookRoleForUrl(
  url: string,
  allUrls: string[],
  handle?: string
): BuyerVisualRole | null {
  if (!isOliverMinimalTwoFrameWorkbook(allUrls, handle)) return null
  const hay = haystack(url)
  if (/gallery[_\-.]?02(?:\.|[-_]|$)/i.test(hay)) return "detail"
  if (/gallery[_\-.]?01(?:\.|[-_]|$)/i.test(hay)) return "front_anfas"
  return null
}

function normalizeUrlKeyForRole(url: string): string {
  const s = url.trim()
  const m = s.match(/(\/static\/products\/[^\s?#]+)/i)
  return (m?.[1] ?? s).toLowerCase()
}

/** gallery_01 = detail, color_*_01 = front — never compete for the same front slot. */
function oliverColorHeroPairRoleForUrl(
  url: string,
  allUrls: string[],
  handle?: string
): BuyerVisualRole | null {
  if (!handle?.toLowerCase().startsWith("ol-")) return null
  const pair = detectOliverGalleryColorHeroPair(allUrls)
  if (!pair) return null
  const key = normalizeUrlKeyForRole(url)
  if (key === normalizeUrlKeyForRole(pair.colorHero)) return "front_anfas"
  if (key === normalizeUrlKeyForRole(pair.gallery01)) return "detail"
  return null
}

function operatorHintToRole(hint: string | undefined): BuyerVisualRole | null {
  switch (hint) {
    case "front_3_4":
      return "front_3_4"
    case "front":
      return "front_anfas"
    case "interior":
      return "interior"
    case "detail":
      return "detail"
    case "scheme":
      return "scheme"
    case "side":
      return "front_3_4"
    default:
      return null
  }
}

export function classifyBuyerRole(
  url: string,
  opts?: { handle?: string; operatorRole?: string | null; allUrls?: string[] }
): BuyerVisualRole {
  const allUrls = opts?.allUrls
  if (allUrls?.length) {
    const minimal = minimalWorkbookRoleForUrl(url, allUrls, opts?.handle)
    if (minimal) return minimal
    const colorHero = oliverColorHeroPairRoleForUrl(url, allUrls, opts?.handle)
    if (colorHero) return colorHero
  }

  const fromOp = operatorHintToRole(opts?.operatorRole ?? undefined)
  if (fromOp) return fromOp

  const hay = haystack(url)
  if (SCHEME_RE.test(hay)) return "scheme"
  // Oliver workbook slots: 03 interior, 04 detail, 05 scheme (buyer tail).
  if (/gallery[_\-.]?05(?:\.|[-_]|$)/i.test(hay)) return "scheme"
  if (/gallery[_\-.]?04(?:\.|[-_]|$)/i.test(hay)) return "detail"
  if (/gallery[_\-.]?03(?:\.|[-_]|$)/i.test(hay)) return "interior"
  if (LIFESTYLE_RE.test(hay) && !/white|iso|gallery_0[12]/i.test(hay)) return "lifestyle"
  if (INTERIOR_OPEN_RE.test(hay) && !ANGLE_3_4_RE.test(hay)) return "interior"
  if (DETAIL_RE.test(hay)) return "detail"
  if (ANGLE_3_4_RE.test(hay)) return "front_3_4"
  if (FRONT_RE.test(hay)) {
    if (CLOSED_RE.test(hay)) return "closed_front"
    if (/main|hero/i.test(hay)) return "hero_front"
    return "front_anfas"
  }
  if (/greenwich[_-](?:grey|white|cacao|cream|olive|green|graphite|powder|capuchino|terracote|darkblue|grey-blue)\d{2}/i.test(hay)) {
    const n = hay.match(/(\d{2})(?:[_\-.]|$)/)
    if (n) {
      const num = Number(n[1])
      if (num <= 9) return "front_3_4"
      if (num <= 15) return "detail"
      if (num >= 20) return "scheme"
    }
  }
  return "unknown"
}

export function isSharedTailRole(role: BuyerVisualRole): boolean {
  return role === "lifestyle"
}

export function buyerRank(role: BuyerVisualRole): number {
  return BUYER_ROLE_RANK[role] ?? 99
}

export function sortUrlsByBuyerPolicy(
  urls: string[],
  opts?: { handle?: string; roleByUrl?: Map<string, string> }
): string[] {
  const handle = opts?.handle
  const roleByUrl = opts?.roleByUrl
  const indexed = urls.map((url, index) => {
    const role = classifyBuyerRole(url, {
      handle,
      operatorRole: roleByUrl?.get(url) ?? null,
      allUrls: urls,
    })
    return { url, index, role, rank: buyerRank(role) }
  })
  indexed.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    return a.index - b.index
  })
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of indexed) {
    if (seen.has(row.url)) continue
    seen.add(row.url)
    out.push(row.url)
  }
  return out
}

type BuyerRoleSlot =
  | "front_3_4"
  | "front"
  | "interior"
  | "detail"
  | "scheme"
  | "lifestyle"
  | "unknown"

function buyerRoleSlot(role: BuyerVisualRole): BuyerRoleSlot {
  if (role === "front_3_4") return "front_3_4"
  if (role === "closed_front" || role === "hero_front" || role === "front_anfas") return "front"
  if (role === "interior") return "interior"
  if (role === "detail") return "detail"
  if (role === "scheme") return "scheme"
  if (role === "lifestyle") return "lifestyle"
  return "unknown"
}

/** Prefer legacy `-i2` for 3/4; `gallery_01` over `-i1` for front workbook imports. */
function buyerUrlPreference(url: string, role: BuyerVisualRole): number {
  const hay = haystack(url)
  if (role === "front_3_4") {
    if (/[-_]i0?2(?:\.|[-_]|$)/i.test(hay)) return 100
    if (/gallery[_\-.]?02/i.test(hay)) return 40
    return 10
  }
  if (role === "closed_front" || role === "hero_front" || role === "front_anfas") {
    if (/gallery[_\-.]?01/i.test(hay)) return 100
    if (/[-_]i0?1(?:\.|[-_]|$)/i.test(hay)) return 40
    return 10
  }
  return 0
}

/**
 * Buyer carousel: one URL per 3/4 + front + interior + scheme slot;
 * keep all detail/lifestyle frames; sort by policy; scheme stays last.
 */
export function collapseBuyerGalleryUrls(
  urls: string[],
  opts?: { handle?: string; roleByUrl?: Map<string, string> }
): string[] {
  const handle = opts?.handle
  const sorted = sortUrlsByBuyerPolicy(urls, opts)
  const singles = new Map<BuyerRoleSlot, { url: string; pref: number }>()
  const interiors: string[] = []
  const details: string[] = []
  const lifestyles: string[] = []
  const unknowns: string[] = []
  const seenBase = new Set<string>()

  for (const url of sorted) {
    const base = haystack(url)
    if (seenBase.has(base)) continue

    const role = classifyBuyerRole(url, {
      handle,
      operatorRole: opts?.roleByUrl?.get(url) ?? null,
      allUrls: urls,
    })
    const slot = buyerRoleSlot(role)
    const pref = buyerUrlPreference(url, role)

    if (slot === "interior") {
      if (!seenBase.has(base)) {
        seenBase.add(base)
        interiors.push(url)
      }
      continue
    }
    if (slot === "detail") {
      seenBase.add(base)
      details.push(url)
      continue
    }
    if (slot === "lifestyle") {
      seenBase.add(base)
      lifestyles.push(url)
      continue
    }
    if (slot === "unknown") {
      seenBase.add(base)
      unknowns.push(url)
      continue
    }

    const prev = singles.get(slot)
    if (!prev || pref > prev.pref) {
      if (prev) seenBase.delete(haystack(prev.url))
      seenBase.add(base)
      singles.set(slot, { url, pref })
    }
  }

  const out: string[] = []
  for (const slot of ["front_3_4", "front"] as BuyerRoleSlot[]) {
    const hit = singles.get(slot)
    if (hit) out.push(hit.url)
  }
  out.push(...interiors)
  out.push(...details)
  const scheme = singles.get("scheme")
  if (scheme) out.push(scheme.url)
  for (const u of unknowns) {
    if (!out.includes(u)) out.push(u)
  }
  out.push(...lifestyles.filter((u) => !out.includes(u)))
  return out
}

export type ColorExecution = { key: string; label: string; urls: string[] }

export function sortFinishExecutions(
  executions: ColorExecution[],
  handle: string
): { executions: ColorExecution[]; sharedTailUrls: string[] } {
  const sharedByBase = new Map<string, string>()

  const sortedExecs = executions.map((ex) => {
    const colorUrls: string[] = []
    for (const url of ex.urls ?? []) {
      const role = classifyBuyerRole(url, { handle, allUrls: ex.urls ?? [] })
      if (isSharedTailRole(role)) {
        const base = url.split("/").pop() ?? url
        if (!sharedByBase.has(base)) sharedByBase.set(base, url)
      } else {
        colorUrls.push(url)
      }
    }
    return {
      ...ex,
      urls: sortUrlsByBuyerPolicy(colorUrls, { handle }),
    }
  })

  const sharedTailUrls = sortUrlsByBuyerPolicy(Array.from(sharedByBase.values()), {
    handle,
  })
  return { executions: sortedExecs, sharedTailUrls }
}

export function buildBuyerGallery(
  colorSpecificUrls: string[],
  sharedTailUrls: string[],
  opts?: { handle?: string; roleByUrl?: Map<string, string> }
): string[] {
  const main = sortUrlsByBuyerPolicy(colorSpecificUrls, opts)
  const tail = sortUrlsByBuyerPolicy(sharedTailUrls, opts)
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of [...main, ...tail]) {
    if (seen.has(u)) continue
    seen.add(u)
    out.push(u)
  }
  return out
}

export function pickBuyerThumbnail(urls: string[], handle?: string): string {
  if (urls.length === 0) return ""
  const ranked = urls.map((url, index) => {
    const role = classifyBuyerRole(url, { handle, allUrls: urls })
    return { url, index, role, rank: buyerRank(role) }
  })
  if (!isOliverMinimalTwoFrameWorkbook(urls, handle)) {
    const prefer34 = ranked.find((r) => r.role === "front_3_4")
    if (prefer34) return prefer34.url
  }
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index)
  return ranked[0]!.url
}

export type MedusaImageInput = {
  url: string
  metadata?: Record<string, unknown>
}

export function toMedusaImages(
  urls: string[],
  handle?: string,
  roleByUrl?: Map<string, string>
): MedusaImageInput[] {
  return urls.map((url, buyer_order_rank) => {
    const role = classifyBuyerRole(url, {
      handle,
      operatorRole: roleByUrl?.get(url) ?? null,
      allUrls: urls,
    })
    return {
      url,
      metadata: {
        operator_role: role === "front_anfas" || role === "closed_front" || role === "hero_front"
          ? "front"
          : role === "front_3_4"
            ? "front_3_4"
            : role === "lifestyle"
              ? "interior"
              : role,
        buyer_order_rank,
        is_shared: isSharedTailRole(role),
      },
    }
  })
}

export function sortExecutionList<T extends { urls: string[] }>(
  list: T[],
  handle: string
): T[] {
  return list.map((entry) => ({
    ...entry,
    urls: sortUrlsByBuyerPolicy(entry.urls ?? [], { handle }),
  }))
}
