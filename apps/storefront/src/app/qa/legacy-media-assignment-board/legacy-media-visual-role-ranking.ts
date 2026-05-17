/**
 * QA-only: classify legacy inventory media by visual role and sort gallery.
 * Read-only metadata (filename, paths, URLs) — no ML / OCR.
 */

import type { InvItem } from "./legacy-media-board-types"
import { explicitProductTokenFromMedia, normSku } from "./suggestion-product-guard"
import { isWhiteBgSourceHint, type InvItemDedupeFields } from "./legacy-media-dedupe"

export type VisualRole =
  | "closed_front"
  | "hero_front"
  | "front_anfas"
  | "front_3_4"
  | "interior"
  | "detail"
  | "lifestyle"
  | "scheme"
  | "unknown"

export const VISUAL_ROLE_RANK: Record<VisualRole, number> = {
  closed_front: 8,
  hero_front: 10,
  front_3_4: 22,
  front_anfas: 25,
  interior: 30,
  detail: 40,
  lifestyle: 50,
  scheme: 60,
  unknown: 70,
}

export const VISUAL_ROLE_BADGE_RU: Record<VisualRole, string> = {
  closed_front: "закрытый фронт",
  hero_front: "фронт",
  front_anfas: "анфас",
  front_3_4: "3/4",
  interior: "внутри",
  detail: "деталь",
  lifestyle: "интерьер",
  scheme: "схема",
  unknown: "?",
}

export const VISUAL_ROLE_RANKING_TOOLTIP_RU =
  "Порядок: закрытый фронт → hero → 3/4 / анфас → внутрянка → детали → интерьер → схема"

/** Roles that represent the same closed frontal product shot family (collapse to one primary). */
export const FRONT_FAMILY_ROLES = new Set<VisualRole>(["closed_front", "hero_front", "front_anfas"])

export const PRIMARY_ELIGIBLE_ROLES = new Set<VisualRole>(["closed_front", "hero_front", "front_anfas"])

const SCHEME_RE =
  /схем|черт[её]ж|blueprint|schematic|dimension|technical[_\s-]?draw|line[\s-]?art|plan[_\s-]?view|spec[_\s-]?sheet|(?:^|[_\-.])draw(?:ing)?(?:[_\-.]|$)|pdf[_\s-]?crop|vector|wireframe/i
const INTERIOR_RE =
  /interior|inside|внутр|открыт|open(?:ed)?[\s_-]?(?:door|wardrobe)|doors?[\s_-]?open|shelf|shelves|полк|drawer[\s_-]?open|interior[_\s-]?view|visible[\s_-]?shelf|pole|стойк/i
const INTERIOR_INDEX_RE = /[-_]i(?:3|[4-9])(?:\.|[-_]|$)|[-_]gallery[_\-.]?0?3(?:\.|[-_]|$)/i
const DETAIL_RE =
  /detail|close[\s_-]?up|крупн|(?:^|[^a-z])handle(?:[^a-z]|$)|(?:^|[^a-z])knob(?:[^a-z]|$)|(?:^|[^a-z])leg(?:[^a-z]|$)|texture|фурнит|hardware|material[\s_-]?sample|drawer[\s_-]?detail|hinge|фурнитур|(?:^|[^a-z])joint(?:[^a-z]|$)|enlarged|crop/i
const PRODUCT_HERO_SHOT_RE =
  /color_[a-z]+_01|[-_]i0?1(?:\.|[-_]|$)|[-_]iso[-_]?1(?:\.|[-_]|$)|[-_]gallery[_\-.]?01/i
const PRODUCT_ALT_EXTERNAL_RE =
  /color_[a-z]+_02|[-_]i0?2(?:\.|[-_]|$)|[-_]iso[-_]?2(?:\.|[-_]|$)|[-_]gallery[_\-.]?02/i
const LIFESTYLE_RE =
  /lifestyle|staged|in[\s_-]?room|room[\s_-]?shot|комнат|ambiente|setting|bedroom|living[\s_-]?room|kids[\s_-]?room/i
const FRONT_RE = /front|frontal|фасад|фронт|fasad|анфас|anfas/i
const HERO_RE = /(?:^|[_\-.])(main|hero|primary|cover)(?:[_\-.]|$)/i
const CLOSED_RE = /closed|закрыт|doors?[\s_-]?closed/i
const OPEN_RE = /\bopen(?:ed)?\b|открыт/i
const ANGLE_3_4_RE =
  /(?:^|[-_.])iso(?:[-_.]|$)|[-_]iso[-_]?\d|3-4|3\/4|three[\s_-]?quarter|angle|angled|боков|side[\s_-]?view|perspective/i
const SECOND_FRONT_RE = /second[\s_-]?front|alt[\s_-]?front|front[\s_-]?2|[_\-.]i0?2(?:[_\-.]|$)|gallery[_\-.]?02|[_\-.]02(?:[_\-.]|$)|color_[a-z]+_02/i
const FIRST_EXTERNAL_RE =
  /[_\-.]i0?1(?:[_\-.]|$)|[_\-.]01(?:[_\-.]|$)|gallery[_\-.]?01|[_\-.]color_[a-z]+[_\-.]1(?:[_\-.]|$)|color_[a-z]+_01|[-_]iso[-_]?1(?:\.|[-_]|$)/i
const GALLERY_FIRST_RE = /gallery[_\-.]?01/i

const NON_PRIMARY_ROLES = new Set<VisualRole>(["interior", "detail", "lifestyle", "scheme", "front_3_4"])

export function mediaHaystack(inv: InvItem, extraBasename?: string | null): string {
  return [
    inv.filename,
    inv.source_path,
    inv.repo_relative_path,
    inv.url,
    inv.page_url,
    inv.source_type,
    inv.collection_hint,
    extraBasename,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

export function isInteriorSourceHint(hay: string): boolean {
  return INTERIOR_RE.test(hay) || INTERIOR_INDEX_RE.test(hay) || (OPEN_RE.test(hay) && !CLOSED_RE.test(hay) && !FRONT_RE.test(hay))
}

export function isClosedExternalSourceHint(hay: string): boolean {
  if (isInteriorSourceHint(hay) || DETAIL_RE.test(hay) || SCHEME_RE.test(hay)) return false
  const hasClosed = CLOSED_RE.test(hay)
  const hasOpen = OPEN_RE.test(hay)
  const hasFront = FRONT_RE.test(hay)
  if (hasClosed && !hasOpen) return true
  if (hasFront && !hasOpen) return true
  if (FIRST_EXTERNAL_RE.test(hay) && !INTERIOR_INDEX_RE.test(hay)) return true
  if (ANGLE_3_4_RE.test(hay) && /[-_]iso[-_]?1/i.test(hay)) return true
  return false
}

export function isThreeQuarterSourceHint(hay: string): boolean {
  return ANGLE_3_4_RE.test(hay) || /[-_]iso[-_]?\d/i.test(hay)
}

export function canBePrimaryRole(role: VisualRole): boolean {
  return PRIMARY_ELIGIBLE_ROLES.has(role)
}

/**
 * Collapse legacy alias indices (i1/i2, color_*_01/02) into one frontal family per SKU+color.
 * Excludes true 3/4 / iso / interior shots.
 */
export function frontFamilyDedupeKey(
  inv: InvItem,
  opts?: { selectedSku?: string; colorToken?: string }
): string | null {
  const hay = mediaHaystack(inv)
  if (SCHEME_RE.test(hay) || DETAIL_RE.test(hay) || isInteriorSourceHint(hay)) return null
  if (isThreeQuarterSourceHint(hay)) return null
  if (OPEN_RE.test(hay) && !CLOSED_RE.test(hay)) return null

  const whiteBg = isWhiteBgSourceHint(inv as InvItemDedupeFields)
  const productShot =
    PRODUCT_HERO_SHOT_RE.test(hay) ||
    PRODUCT_ALT_EXTERNAL_RE.test(hay) ||
    /[-_]i[12](?:\.|[-_]|$)/i.test(hay) ||
    /color_[a-z]+_0[12]/i.test(hay)

  if (!whiteBg && !productShot && !isClosedExternalSourceHint(hay)) return null

  const sku = normSku(opts?.selectedSku || explicitProductTokenFromMedia(inv) || "")
  const color = (opts?.colorToken || "any").toLowerCase().replace(/^color_/, "")
  return `ff:${sku}|${color}`
}

export function classifyVisualRole(
  inv: InvItem,
  opts?: { seedBasename?: string | null; orderIndex?: number }
): VisualRole {
  const hay = mediaHaystack(inv, opts?.seedBasename)
  const whiteBg = isWhiteBgSourceHint(inv as InvItemDedupeFields)
  const isPdfLike = /\.pdf/i.test(hay) || inv.source_type?.toLowerCase().includes("pdf")

  if (SCHEME_RE.test(hay) || isPdfLike) return "scheme"
  if (isInteriorSourceHint(hay)) return "interior"
  if (DETAIL_RE.test(hay)) return "detail"
  if (LIFESTYLE_RE.test(hay) && !whiteBg) return "lifestyle"

  const hasFront = FRONT_RE.test(hay)
  const hasClosed = CLOSED_RE.test(hay)
  const hasOpen = OPEN_RE.test(hay)
  const hasHero = HERO_RE.test(hay)
  const isSecond = SECOND_FRONT_RE.test(hay)
  const isFirstExternal = FIRST_EXTERNAL_RE.test(hay) && !INTERIOR_INDEX_RE.test(hay)
  const isGalleryFirst = GALLERY_FIRST_RE.test(hay)
  const is34 = isThreeQuarterSourceHint(hay)

  if (is34) {
    if (/[-_]iso[-_]?1/i.test(hay) || (isFirstExternal && !isSecond)) return "hero_front"
    if (/[-_]iso[-_]?2/i.test(hay)) return "front_3_4"
    if (/color_[a-z]+_02/i.test(hay) && is34) return "front_3_4"
    return "front_3_4"
  }

  if (PRODUCT_HERO_SHOT_RE.test(hay) && !isInteriorSourceHint(hay)) {
    return hasClosed && !hasOpen ? "closed_front" : "hero_front"
  }
  if (PRODUCT_ALT_EXTERNAL_RE.test(hay) && !isInteriorSourceHint(hay)) {
    return isThreeQuarterSourceHint(hay) ? "front_3_4" : "front_anfas"
  }

  if (hasFront) {
    if (hasClosed && !hasOpen) return "closed_front"
    if (hasOpen && !hasClosed) return "interior"
    if (hasHero || (whiteBg && isFirstExternal && !isSecond)) return "hero_front"
    if (isSecond) return "front_anfas"
    return "front_anfas"
  }

  if (isSecond && !isThreeQuarterSourceHint(hay)) return "front_anfas"

  if (isFirstExternal && !isGalleryFirst) {
    if (hasClosed && !hasOpen) return "closed_front"
    return whiteBg ? "hero_front" : "front_anfas"
  }

  if (isGalleryFirst) {
    if (hasClosed && !hasOpen) return "closed_front"
    return "unknown"
  }

  if (whiteBg && !hasOpen && !isInteriorSourceHint(hay) && !DETAIL_RE.test(hay)) {
    if (isSecond) return "front_anfas"
    if (INTERIOR_INDEX_RE.test(hay)) return "interior"
    if (isClosedExternalSourceHint(hay)) return "closed_front"
    return "unknown"
  }

  return "unknown"
}

/** Second front in gallery only when angle/role differs from primary (not another alias index). */
export function isDistinctAlternateFront(
  primaryId: string,
  candidateId: string,
  invById: Map<string, InvItem>,
  rolesById: Map<string, VisualRole>
): boolean {
  if (primaryId === candidateId) return false
  const primaryInv = invById.get(primaryId)
  const candInv = invById.get(candidateId)
  if (!primaryInv || !candInv) return false

  const candHay = mediaHaystack(candInv)
  const candRole = rolesById.get(candidateId) ?? classifyVisualRole(candInv)
  if (candRole === "front_3_4" && isThreeQuarterSourceHint(candHay)) return true

  if (candRole !== "front_anfas" && candRole !== "hero_front" && candRole !== "closed_front") return false

  const primHay = mediaHaystack(primaryInv)
  const primRole = rolesById.get(primaryId) ?? classifyVisualRole(primaryInv)

  if (FRONT_FAMILY_ROLES.has(candRole) && FRONT_FAMILY_ROLES.has(primRole)) {
    if (isClosedExternalSourceHint(candHay) && isClosedExternalSourceHint(primHay)) return false
    if (SECOND_FRONT_RE.test(candHay) && !isThreeQuarterSourceHint(candHay)) return false
    return false
  }

  return candRole === "front_anfas" && !isClosedExternalSourceHint(candHay)
}

export function roleRank(role: VisualRole): number {
  return VISUAL_ROLE_RANK[role]
}

export function compareIdsByVisualRole(
  a: string,
  b: string,
  invById: Map<string, InvItem>,
  opts?: { rolesById?: Map<string, VisualRole>; seedBasenames?: Map<string, string> }
): number {
  const ia = invById.get(a)
  const ib = invById.get(b)
  const ra = opts?.rolesById?.get(a) ?? (ia ? classifyVisualRole(ia, { seedBasename: opts?.seedBasenames?.get(a) }) : "unknown")
  const rb = opts?.rolesById?.get(b) ?? (ib ? classifyVisualRole(ib, { seedBasename: opts?.seedBasenames?.get(b) }) : "unknown")
  const diff = roleRank(ra) - roleRank(rb)
  if (diff !== 0) return diff
  return a.localeCompare(b)
}

export function sortIdsByVisualRole(
  ids: string[],
  invById: Map<string, InvItem>,
  opts?: { seedBasenames?: Map<string, string> }
): { sorted: string[]; rolesById: Map<string, VisualRole> } {
  const rolesById = new Map<string, VisualRole>()
  const unique = Array.from(new Set(ids.filter(Boolean)))
  for (let i = 0; i < unique.length; i++) {
    const id = unique[i]!
    const inv = invById.get(id)
    if (inv) rolesById.set(id, classifyVisualRole(inv, { seedBasename: opts?.seedBasenames?.get(id), orderIndex: i }))
  }
  const sorted = [...unique].sort((a, b) => compareIdsByVisualRole(a, b, invById, { rolesById, seedBasenames: opts?.seedBasenames }))
  return { sorted, rolesById }
}

/** Gallery order after primary — one representative per role bucket. */
export const GALLERY_ROLE_ORDER: VisualRole[] = [
  "front_3_4",
  "front_anfas",
  "interior",
  "detail",
  "lifestyle",
  "scheme",
  "unknown",
]

function primaryScore(id: string, role: VisualRole, inv: InvItem | undefined, seedIndex: Map<string, number>): number {
  let s = 0
  if (role === "closed_front") s += 1100
  else if (role === "hero_front") s += 1000
  else if (role === "front_anfas") s += 800
  else if (role === "unknown" && inv && isWhiteBgSourceHint(inv as InvItemDedupeFields)) {
    const hay = mediaHaystack(inv)
    if (isClosedExternalSourceHint(hay)) s += 400
    else s += 50
  } else return -9999
  if (NON_PRIMARY_ROLES.has(role)) return -9999
  if (inv?.previewable !== false) s += 80
  const hay = inv ? mediaHaystack(inv) : ""
  if (FIRST_EXTERNAL_RE.test(hay) && !INTERIOR_INDEX_RE.test(hay)) s += 40
  if (isClosedExternalSourceHint(hay)) s += 30
  const si = seedIndex.get(id)
  if (si != null) s -= si
  return s
}

export type VisualRolePickResult = {
  primaryId: string | null
  galleryIds: string[]
  autoPicked: boolean
  needsReview: boolean
  primaryRole: VisualRole | null
  rolesById: Map<string, VisualRole>
}

export function pickPrimaryAndGalleryByVisualRole(
  candidateIds: string[],
  invById: Map<string, InvItem>,
  opts?: { seedOrder?: string[]; seedBasenames?: Map<string, string> }
): VisualRolePickResult {
  const unique = Array.from(new Set(candidateIds.filter(Boolean)))
  if (unique.length === 0) {
    return {
      primaryId: null,
      galleryIds: [],
      autoPicked: true,
      needsReview: true,
      primaryRole: null,
      rolesById: new Map(),
    }
  }

  const { rolesById } = sortIdsByVisualRole(unique, invById, { seedBasenames: opts?.seedBasenames })
  const seedIndex = new Map<string, number>()
  for (let i = 0; i < (opts?.seedOrder?.length ?? 0); i++) {
    const id = opts!.seedOrder![i]
    if (id) seedIndex.set(id, i)
  }

  const hasClosedExternal = unique.some((id) => {
    const inv = invById.get(id)
    if (!inv) return false
    const role = rolesById.get(id)!
    if (canBePrimaryRole(role)) return true
    return role === "unknown" && isClosedExternalSourceHint(mediaHaystack(inv))
  })

  let primaryId: string | null = null
  let bestScore = -1
  for (const id of unique) {
    const role = rolesById.get(id)!
    const inv = invById.get(id)
    if (hasClosedExternal && (NON_PRIMARY_ROLES.has(role) || (role === "unknown" && inv && !isClosedExternalSourceHint(mediaHaystack(inv))))) {
      continue
    }
    const sc = primaryScore(id, role, inv, seedIndex)
    if (sc > bestScore) {
      bestScore = sc
      primaryId = id
    }
  }

  if (!primaryId) {
    for (const role of ["closed_front", "hero_front", "front_anfas"] as const) {
      for (const id of unique) {
        if (rolesById.get(id) === role) {
          primaryId = id
          break
        }
      }
      if (primaryId) break
    }
  }

  if (!primaryId) {
    const onlyScheme = unique.every((id) => rolesById.get(id) === "scheme")
    primaryId = unique.find((id) => rolesById.get(id) !== "scheme") ?? unique[0] ?? null
    const needsReview = onlyScheme || !primaryId || rolesById.get(primaryId) === "scheme"
    const galleryIds = buildGalleryOrder(unique, primaryId, rolesById, invById)
    return {
      primaryId,
      galleryIds,
      autoPicked: true,
      needsReview,
      primaryRole: primaryId ? rolesById.get(primaryId) ?? null : null,
      rolesById,
    }
  }

  const primaryRole = rolesById.get(primaryId) ?? null
  const galleryIds = buildGalleryOrder(unique, primaryId, rolesById, invById)
  const needsReview =
    primaryRole === "scheme" ||
    primaryRole === "unknown" ||
    (primaryRole != null && !canBePrimaryRole(primaryRole) && !isWhiteBgSourceHint(invById.get(primaryId)! as InvItemDedupeFields))

  return {
    primaryId,
    galleryIds,
    autoPicked: true,
    needsReview,
    primaryRole,
    rolesById,
  }
}

function buildGalleryOrder(
  unique: string[],
  primaryId: string | null,
  rolesById: Map<string, VisualRole>,
  invById: Map<string, InvItem>
): string[] {
  const byRole = new Map<VisualRole, string[]>()
  for (const id of unique) {
    if (id === primaryId) continue
    const role = rolesById.get(id) ?? "unknown"
    const list = byRole.get(role) ?? []
    list.push(id)
    byRole.set(role, list)
  }

  const galleryIds: string[] = []
  let alternateFrontUsed = false

  for (const role of GALLERY_ROLE_ORDER) {
    const bucket = (byRole.get(role) ?? []).sort((a, b) => a.localeCompare(b))
    if (bucket.length === 0) continue

    if (role === "front_3_4" || role === "front_anfas") {
      const pick = bucket.find(
        (id) => primaryId && isDistinctAlternateFront(primaryId, id, invById, rolesById)
      )
      if (!pick) {
        for (const hid of bucket) {
          if (primaryId) byRole.set(role, [])
        }
        continue
      }
      if (!alternateFrontUsed) {
        galleryIds.push(pick)
        alternateFrontUsed = true
      }
      continue
    }

    galleryIds.push(bucket[0]!)
  }

  return galleryIds
}

export function primaryCandidateBadgeRu(primaryRole: VisualRole | null, needsReview: boolean): string | null {
  if (needsReview) return "Проверь главное фото"
  if (primaryRole === "closed_front" || primaryRole === "hero_front") return "Primary candidate · frontal"
  if (primaryRole === "front_anfas") return "Primary candidate · anfas"
  return null
}

export function primaryRoleStripLabel(role: VisualRole | null): VisualRole {
  if (role === "closed_front" || role === "hero_front" || role === "front_anfas") {
    return role === "front_anfas" ? "front_anfas" : role === "closed_front" ? "closed_front" : "hero_front"
  }
  return "hero_front"
}
