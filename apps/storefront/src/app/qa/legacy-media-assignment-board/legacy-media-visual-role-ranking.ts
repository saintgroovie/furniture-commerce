/**
 * QA-only: classify legacy inventory media by visual role and sort gallery.
 * Read-only metadata (filename, paths, URLs) — no ML / OCR.
 */

import type { InvItem } from "./legacy-media-board-types"
import { isWhiteBgSourceHint, type InvItemDedupeFields } from "./legacy-media-dedupe"

export type VisualRole =
  | "hero_front"
  | "front_anfas"
  | "interior"
  | "detail"
  | "lifestyle"
  | "scheme"
  | "unknown"

export const VISUAL_ROLE_RANK: Record<VisualRole, number> = {
  hero_front: 10,
  front_anfas: 20,
  interior: 30,
  detail: 40,
  lifestyle: 50,
  scheme: 60,
  unknown: 70,
}

export const VISUAL_ROLE_BADGE_RU: Record<VisualRole, string> = {
  hero_front: "фронт",
  front_anfas: "анфас",
  interior: "внутри",
  detail: "деталь",
  lifestyle: "интерьер",
  scheme: "схема",
  unknown: "?",
}

export const VISUAL_ROLE_RANKING_TOOLTIP_RU =
  "Порядок: главное закрытое фронтальное → анфас/3-4 → внутрянка → детали → интерьер → схема"

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

const NON_PRIMARY_ROLES = new Set<VisualRole>(["interior", "detail", "lifestyle", "scheme"])

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

function isClosedExternalSourceHintImpl(hay: string): boolean {
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

export function canBePrimaryRole(role: VisualRole): boolean {
  return role === "hero_front" || role === "front_anfas"
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

  if (PRODUCT_HERO_SHOT_RE.test(hay) && !isInteriorSourceHint(hay)) return "hero_front"
  if (PRODUCT_ALT_EXTERNAL_RE.test(hay) && !isInteriorSourceHint(hay)) return "front_anfas"

  if (ANGLE_3_4_RE.test(hay)) {
    if (/[-_]iso[-_]?1/i.test(hay) || (isFirstExternal && !isSecond)) return "hero_front"
    return "front_anfas"
  }

  if (hasFront) {
    if (hasClosed && !hasOpen) return "hero_front"
    if (hasOpen && !hasClosed) return "interior"
    if (hasHero || (whiteBg && isFirstExternal && !isSecond)) return "hero_front"
    if (isSecond || (hasOpen && hasClosed)) return "front_anfas"
    return "front_anfas"
  }

  if (isSecond) return "front_anfas"

  if (isFirstExternal && !isGalleryFirst) {
    return whiteBg ? "hero_front" : "front_anfas"
  }

  if (isGalleryFirst) {
    if (hasClosed && !hasOpen) return "hero_front"
    return "unknown"
  }

  if (whiteBg && !hasOpen && !isInteriorSourceHint(hay) && !DETAIL_RE.test(hay)) {
    if (isSecond) return "front_anfas"
    if (INTERIOR_INDEX_RE.test(hay)) return "interior"
    return "unknown"
  }

  return "unknown"
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

const GALLERY_AFTER_PRIMARY: VisualRole[] = ["front_anfas", "interior", "detail", "lifestyle", "scheme", "unknown"]

function primaryScore(id: string, role: VisualRole, inv: InvItem | undefined, seedIndex: Map<string, number>): number {
  let s = 0
  if (role === "hero_front") s += 1000
  else if (role === "front_anfas") s += 800
  else if (role === "unknown" && inv && isWhiteBgSourceHint(inv as InvItemDedupeFields)) {
    const hay = mediaHaystack(inv)
    if (isClosedExternalSourceHintImpl(hay)) s += 400
    else s += 50
  } else return -9999
  if (NON_PRIMARY_ROLES.has(role)) return -9999
  if (inv?.previewable !== false) s += 80
  const hay = inv ? mediaHaystack(inv) : ""
  if (FIRST_EXTERNAL_RE.test(hay) && !INTERIOR_INDEX_RE.test(hay)) s += 40
  if (isClosedExternalSourceHintImpl(hay)) s += 30
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
    return role === "unknown" && isClosedExternalSourceHintImpl(mediaHaystack(inv))
  })

  let primaryId: string | null = null
  let bestScore = -1
  for (const id of unique) {
    const role = rolesById.get(id)!
    const inv = invById.get(id)
    if (hasClosedExternal && (NON_PRIMARY_ROLES.has(role) || (role === "unknown" && inv && !isClosedExternalSourceHintImpl(mediaHaystack(inv))))) {
      continue
    }
    const sc = primaryScore(id, role, inv, seedIndex)
    if (sc > bestScore) {
      bestScore = sc
      primaryId = id
    }
  }

  if (!primaryId) {
    for (const role of ["hero_front", "front_anfas"] as const) {
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
    const galleryIds = buildGalleryOrder(unique, primaryId, rolesById)
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
  const galleryIds = buildGalleryOrder(unique, primaryId, rolesById)
  const needsReview =
    primaryRole === "scheme" ||
    primaryRole === "unknown" ||
    (primaryRole !== "hero_front" && primaryRole !== "front_anfas" && !isWhiteBgSourceHint(invById.get(primaryId)! as InvItemDedupeFields))

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
  rolesById: Map<string, VisualRole>
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
  for (const role of GALLERY_AFTER_PRIMARY) {
    const bucket = byRole.get(role) ?? []
    galleryIds.push(...bucket.sort((a, b) => a.localeCompare(b)))
    byRole.delete(role)
  }
  for (const role of ["hero_front"] as VisualRole[]) {
    const bucket = byRole.get(role) ?? []
    galleryIds.push(...bucket.sort((a, b) => a.localeCompare(b)))
    byRole.delete(role)
  }
  for (const rest of Array.from(byRole.values())) {
    galleryIds.push(...rest.sort((a, b) => a.localeCompare(b)))
  }
  return galleryIds
}

export function primaryCandidateBadgeRu(primaryRole: VisualRole | null, needsReview: boolean): string | null {
  if (needsReview) return "Проверь главное фото"
  if (primaryRole === "hero_front") return "Primary candidate · frontal"
  if (primaryRole === "front_anfas") return "Primary candidate · anfas"
  return null
}
