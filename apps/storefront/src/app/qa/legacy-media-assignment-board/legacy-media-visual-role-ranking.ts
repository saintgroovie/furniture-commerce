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
  "Порядок: главное фронтальное → анфас → внутрянка → детали → интерьер → схема"

const SCHEME_RE =
  /схем|черт[её]ж|blueprint|schematic|dimension|technical[_\s-]?draw|line[\s-]?art|plan[_\s-]?view|spec[_\s-]?sheet|(?:^|[_\-.])draw(?:ing)?(?:[_\-.]|$)|pdf[_\s-]?crop|vector|wireframe/i
const INTERIOR_RE =
  /interior|inside|внутр|открыт|open(?:ed)?[\s_-]?(?:door|wardrobe)|doors?[\s_-]?open|shelf|полк|drawer[\s_-]?open|interior[_\s-]?view/i
const DETAIL_RE =
  /detail|close[\s_-]?up|крупн|handle|knob|leg|texture|фурнит|hardware|material[\s_-]?sample|drawer[\s_-]?detail|hinge|фурнитур/i
const LIFESTYLE_RE =
  /lifestyle|staged|in[\s_-]?room|room[\s_-]?shot|комнат|ambiente|setting|bedroom|living[\s_-]?room|kids[\s_-]?room/i
const FRONT_RE = /front|frontal|фасад|фронт|fasad|анфас|anfas/i
const HERO_RE = /(?:^|[_\-.])(main|hero|primary|cover)(?:[_\-.]|$)/i
const CLOSED_RE = /closed|закрыт|doors?[\s_-]?closed/i
const OPEN_RE = /\bopen(?:ed)?\b|открыт/i
const SECOND_FRONT_RE = /second[\s_-]?front|alt[\s_-]?front|front[\s_-]?2|[_\-.]i0?2(?:[_\-.]|$)|gallery[_\-.]?02|[_\-.]02(?:[_\-.]|$)/i
const FIRST_INDEX_RE = /[_\-.]i0?1(?:[_\-.]|$)|[_\-.]01(?:[_\-.]|$)|gallery[_\-.]?01|[_\-.]color_[a-z]+[_\-.]1(?:[_\-.]|$)/i

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

export function classifyVisualRole(
  inv: InvItem,
  opts?: { seedBasename?: string | null; orderIndex?: number }
): VisualRole {
  const hay = mediaHaystack(inv, opts?.seedBasename)
  const whiteBg = isWhiteBgSourceHint(inv as InvItemDedupeFields)
  const isPdfLike = /\.pdf/i.test(hay) || inv.source_type?.toLowerCase().includes("pdf")

  if (SCHEME_RE.test(hay) || isPdfLike) return "scheme"
  if (INTERIOR_RE.test(hay) || (OPEN_RE.test(hay) && !CLOSED_RE.test(hay) && !FRONT_RE.test(hay))) return "interior"
  if (DETAIL_RE.test(hay)) return "detail"
  if (LIFESTYLE_RE.test(hay) && !whiteBg) return "lifestyle"

  const hasFront = FRONT_RE.test(hay)
  const hasClosed = CLOSED_RE.test(hay)
  const hasOpen = OPEN_RE.test(hay)
  const hasHero = HERO_RE.test(hay)
  const isSecond = SECOND_FRONT_RE.test(hay)
  const isFirstIndex = FIRST_INDEX_RE.test(hay) || (opts?.orderIndex ?? 99) === 0

  if (hasFront) {
    if (hasClosed && !hasOpen) return "hero_front"
    if (hasHero || (whiteBg && !isSecond) || (isFirstIndex && !isSecond)) return "hero_front"
    if (hasOpen && hasClosed) return "hero_front"
    return "front_anfas"
  }

  if (whiteBg && !hasOpen && !INTERIOR_RE.test(hay) && !DETAIL_RE.test(hay)) {
    if (isSecond) return "front_anfas"
    return "hero_front"
  }

  if (isSecond) return "front_anfas"
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

const NON_PRIMARY_ROLES = new Set<VisualRole>(["interior", "detail", "lifestyle", "scheme"])

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

  const { sorted, rolesById } = sortIdsByVisualRole(unique, invById, { seedBasenames: opts?.seedBasenames })
  const seedIndex = new Map<string, number>()
  for (let i = 0; i < (opts?.seedOrder?.length ?? 0); i++) {
    const id = opts!.seedOrder![i]
    if (id) seedIndex.set(id, i)
  }

  const pickFromRole = (role: VisualRole): string | null => {
    for (const id of sorted) {
      if (rolesById.get(id) === role && invById.get(id)?.previewable !== false) return id
    }
    for (const id of sorted) {
      if (rolesById.get(id) === role) return id
    }
    return null
  }

  let primaryId =
    pickFromRole("hero_front") ??
    pickFromRole("front_anfas") ??
    null

  if (!primaryId) {
    for (const id of sorted) {
      const inv = invById.get(id)
      if (!inv) continue
      const role = rolesById.get(id)!
      if (NON_PRIMARY_ROLES.has(role)) continue
      if (isWhiteBgSourceHint(inv as InvItemDedupeFields) || role === "unknown") {
        primaryId = id
        break
      }
    }
  }

  if (!primaryId) {
    const onlyScheme = sorted.every((id) => rolesById.get(id) === "scheme")
    primaryId = sorted.find((id) => rolesById.get(id) !== "scheme") ?? sorted[0] ?? null
    const needsReview = onlyScheme || !primaryId || rolesById.get(primaryId) === "scheme" || rolesById.get(primaryId) === "unknown"
    const galleryIds = sorted.filter((id) => id !== primaryId)
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
  const galleryIds = sorted.filter((id) => id !== primaryId)
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

export function primaryCandidateBadgeRu(primaryRole: VisualRole | null, needsReview: boolean): string | null {
  if (needsReview) return "Проверь главное фото"
  if (primaryRole === "hero_front") return "Primary candidate · frontal"
  if (primaryRole === "front_anfas") return "Primary candidate · anfas"
  return null
}
