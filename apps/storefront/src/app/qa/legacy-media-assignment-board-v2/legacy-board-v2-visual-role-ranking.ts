/**
 * v2-local visual role ranking — self-contained; no v1 board route imports.
 * Read-only metadata (filename, paths, URLs) — no ML / OCR.
 */

import type { InvItem } from "./legacy-board-v2-types"

const PRODUCT_TOKEN_RE = /^[a-z]{2,}(?:-[a-z0-9]+){1,4}$/i

export function normHandle(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "").replace(/_/g, "-")
}

export function normSku(s: string): string {
  return normHandle(s)
}

function looksLikeProductToken(token: string): boolean {
  return PRODUCT_TOKEN_RE.test(token) && token.length >= 5 && /\d/.test(token)
}

function extractProductTokens(hay: string): string[] {
  const lo = hay.toLowerCase()
  const out = new Set<string>()
  const re = /\b([a-z][a-z0-9]*(?:-[a-z0-9]+){1,4})\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(lo))) {
    const t = normHandle(m[1])
    if (t.length >= 5 && /\d/.test(t) && PRODUCT_TOKEN_RE.test(t)) out.add(t)
  }
  return Array.from(out)
}

export function explicitProductTokenFromMedia(inv: InvItem): string | null {
  const sku = inv.sku_hint ? normSku(inv.sku_hint) : ""
  const handle = inv.handle_hint ? normHandle(inv.handle_hint) : ""
  if (sku && looksLikeProductToken(sku)) return sku
  if (handle && looksLikeProductToken(handle)) return handle
  const filenameTokens = extractProductTokens(inv.filename)
  if (filenameTokens.length === 0) return null
  return filenameTokens.sort((a, b) => b.length - a.length)[0] ?? null
}

export function isWhiteBgSourceHint(inv: InvItem): boolean {
  const hay = `${inv.source_type} ${inv.source_path || ""} ${inv.repo_relative_path || ""}`.toLowerCase()
  return (
    /white[_\s-]?bg|disk[_\s-]?white|белом\s*фоне|фото\s*на\s*белом/i.test(hay) ||
    /yandex\.?disk|yandex disk/i.test(hay)
  )
}

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

/** Operator-facing role label on cards and thumbs (no debug override markers). */
export const OPERATOR_ROLE_LABEL_RU: Record<VisualRole, string> = {
  closed_front: "фронт",
  hero_front: "фронт",
  front_anfas: "анфас",
  front_3_4: "3/4",
  interior: "внутри",
  detail: "деталь",
  lifestyle: "интерьер",
  scheme: "схема",
  unknown: "?",
}

export function operatorRoleLabelRu(role: VisualRole): string {
  return OPERATOR_ROLE_LABEL_RU[role] ?? VISUAL_ROLE_BADGE_RU[role] ?? "?"
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
const INTERIOR_INDEX_RE = /[-_]i(?:3|[4-9])(?:\.|[-_]|$)/i
const GALLERY_THIRD_RE = /[-_]gallery[_\-.]?0?3(?:\.|[-_]|$)/i
const DETAIL_RE =
  /detail|close[\s_-]?up|крупн|(?:^|[^a-z])handle(?:[^a-z]|$)|(?:^|[^a-z])knob(?:[^a-z]|$)|(?:^|[^a-z])leg(?:[^a-z]|$)|texture|фурнит|hardware|material[\s_-]?sample|drawer[\s_-]?detail|hinge|фурнитур|(?:^|[^a-z])joint(?:[^a-z]|$)|enlarged|crop/i
const PRODUCT_HERO_SHOT_RE =
  /color_[a-z]+_01|[-_]i0?1(?:\.|[-_]|$)|[-_]gallery[_\-.]?01/i
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

export const BORROWABLE_VISUAL_ROLES = new Set<VisualRole>(["interior", "detail", "lifestyle"])

export const NON_BORROWABLE_EXTERNAL_ROLES = new Set<VisualRole>([
  "closed_front",
  "hero_front",
  "front_anfas",
  "front_3_4",
])

const COLOR_TOKEN_IN_MEDIA_RE =
  /(?:color|colour)[_-]([a-z0-9-]+)|[-_](blue|grey|gray|cream|milk|olive|green|white|beige|black|brown|graphite|ivory)(?:[-_.]|$)/i

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

/** Open/inside text markers only — not bare `i3` index (wardrobe i3 handled separately). */
export function isInteriorSourceHint(hay: string): boolean {
  return INTERIOR_RE.test(hay) || (OPEN_RE.test(hay) && !CLOSED_RE.test(hay) && !FRONT_RE.test(hay))
}

const KNOWN_WARDROBE_INTERIOR_RE = /(?:^|[-_])co-02-1-i3(?:\.|[-_]|$)/i

/** True open wardrobe interior (co-02-1-i3 or explicit inside/open markers on i3+). */
export function isWardrobeOpenInteriorShot(inv: InvItem): boolean {
  const hay = mediaHaystack(inv)
  if (KNOWN_WARDROBE_INTERIOR_RE.test(hay)) return true
  if (INTERIOR_INDEX_RE.test(hay) && INTERIOR_RE.test(hay)) return true
  return false
}

function isExternalProductShotIndex(hay: string): boolean {
  return (
    GALLERY_THIRD_RE.test(hay) ||
    /[-_]gallery[_\-.]?0?[12](?:\.|[-_]|$)/i.test(hay) ||
    /[-_]iso[-_]?\d/i.test(hay) ||
    /[-_]i0?1(?:\.|[-_]|$)/i.test(hay) ||
    /[-_]i0?2(?:\.|[-_]|$)/i.test(hay) ||
    /color_[a-z]+_0[12]/i.test(hay)
  )
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

export function canBePrimaryForMedia(
  _inv: InvItem,
  role: VisualRole,
  _opts?: { productHandle?: string; productSku?: string }
): boolean {
  return canBePrimaryRole(role)
}

export type VisualRoleClassification = {
  role: VisualRole
  reasons: string[]
  fromOverride: boolean
}

export function classifyVisualRoleDetailed(
  inv: InvItem,
  opts?: { seedBasename?: string | null; orderIndex?: number; productHandle?: string; productSku?: string }
): VisualRoleClassification {
  const role = classifyVisualRoleInner(inv, opts)
  return { role, reasons: [`heuristic:${role}`], fromOverride: false }
}

/** @deprecated internal — use classifyVisualRoleDetailed for audit */
function classifyVisualRoleHeuristic(
  inv: InvItem,
  opts?: { seedBasename?: string | null; orderIndex?: number }
): VisualRole {
  return classifyVisualRoleInner(inv, opts)
}

export function canBorrowVisualRole(role: VisualRole): boolean {
  return BORROWABLE_VISUAL_ROLES.has(role)
}

/** @alias canBorrowVisualRole */
export function isBorrowableRole(role: VisualRole): boolean {
  return canBorrowVisualRole(role)
}

export function isExternalVisualRole(role: VisualRole): boolean {
  return NON_BORROWABLE_EXTERNAL_ROLES.has(role) || FRONT_FAMILY_ROLES.has(role)
}

/** Borrowable interior/detail/lifestyle — rejects gallery/iso/i1/i2 externals mis-tagged. */
export function isClearlyBorrowableInteriorOrDetailOrLifestyle(
  inv: InvItem,
  role: VisualRole,
  opts?: { productHandle?: string; productSku?: string }
): boolean {
  const hay = mediaHaystack(inv)
  if (role === "interior") {
    if (isExternalProductShotIndex(hay) && !isWardrobeOpenInteriorShot(inv)) return false
    return isWardrobeOpenInteriorShot(inv) || INTERIOR_RE.test(hay)
  }
  if (role === "detail") {
    return DETAIL_RE.test(hay) && !isExternalProductShotIndex(hay)
  }
  if (role === "lifestyle") {
    return LIFESTYLE_RE.test(hay) && !isWhiteBgSourceHint(inv)
  }
  return false
}

/** @deprecated use isClearlyBorrowableInteriorOrDetailOrLifestyle */
export function isClearlyBorrowableInterior(inv: InvItem): boolean {
  return isClearlyBorrowableInteriorOrDetailOrLifestyle(inv, "interior")
}

/**
 * Filename/path external product shot — independent of mis-labeled role.
 * Blocks cross-color gallery even when role is interior/unknown.
 */
export function isExternalColorSpecificMedia(
  inv: InvItem,
  opts?: { role?: VisualRole; productHandle?: string; productSku?: string }
): boolean {
  const role = opts?.role ?? classifyVisualRole(inv, opts)
  if (role === "scheme") return false
  if (isClearlyBorrowableInteriorOrDetailOrLifestyle(inv, role)) return false
  if (isExternalVisualRole(role)) return true
  const hay = mediaHaystack(inv)
  if (isExternalProductShotIndex(hay)) {
    if (isWardrobeOpenInteriorShot(inv)) return false
    return true
  }
  if (
    role === "unknown" &&
    (isWhiteBgSourceHint(inv) ||
      isClosedExternalSourceHint(hay) ||
      isThreeQuarterSourceHint(hay))
  ) {
    return true
  }
  return false
}

/** Neutral shared shots (gallery_*, iso-*) default to cream bucket on co-02-1 style products. */
export function neutralExternalOwnerColor(inv: InvItem): string | null {
  const explicit = extractColorTokenFromMedia(inv)
  if (explicit) return explicit
  const hay = mediaHaystack(inv)
  if (GALLERY_THIRD_RE.test(hay) || /[-_]gallery[_\-.]?\d|[-_]iso[-_]?\d|[-_]i[12](?:\.|[-_]|$)/i.test(hay)) {
    return "cream"
  }
  return null
}

export function externalMediaAllowedForColorVariant(
  inv: InvItem,
  role: VisualRole,
  colorToken: string,
  productHandle?: string,
  productSku?: string
): boolean {
  if (!isExternalColorSpecificMedia(inv, { role, productHandle, productSku })) return true
  const want = colorToken.toLowerCase().replace(/^color_/, "")
  if (mediaMatchesColorToken(inv, want, productHandle, productSku)) return true
  const owner = neutralExternalOwnerColor(inv)
  if (owner && owner !== want) return false
  if (!owner && role === "unknown") return false
  if (!owner) return false
  return owner === want
}

/** Filename/path color token for same-SKU variant matching (not display label). */
export function extractColorTokenFromMedia(
  inv: InvItem,
  productHandle?: string,
  productSku?: string
): string | null {
  const hay = mediaHaystack(inv)
  const m = hay.match(/(?:color|colour)[_-]([a-z0-9-]+)/)
  if (m?.[1]) return m[1]!.toLowerCase()
  const h = normHandle(productHandle || "")
  const sku = normSku(productSku || "")
  const explicit = explicitProductTokenFromMedia(inv)
  if (explicit && h && explicit !== h && explicit !== sku) return null
  const m2 = hay.match(
    /(?:^|[-_])(blue|grey|gray|cream|milk|olive|green|white|beige|black|brown|graphite|ivory)(?:[-_.]|$)/i
  )
  return m2?.[1]?.toLowerCase() ?? null
}

export function mediaMatchesColorToken(
  inv: InvItem,
  colorToken: string,
  productHandle?: string,
  productSku?: string
): boolean {
  const want = colorToken.toLowerCase().replace(/^color_/, "")
  if (!want || want === "needs_review") return false
  const got = extractColorTokenFromMedia(inv, productHandle, productSku)
  return got === want
}

export function isNeutralSharedProductShot(hay: string): boolean {
  return /[-_]gallery[_\-.]?\d|[-_]iso[-_]?\d|[-_]i3(?:\.|[-_]|$)/i.test(hay) && !COLOR_TOKEN_IN_MEDIA_RE.test(hay)
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

  const whiteBg = isWhiteBgSourceHint(inv)
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
  opts?: { seedBasename?: string | null; orderIndex?: number; productHandle?: string; productSku?: string }
): VisualRole {
  return classifyVisualRoleInner(inv, opts)
}

function classifyVisualRoleInner(
  inv: InvItem,
  opts?: { seedBasename?: string | null; orderIndex?: number }
): VisualRole {
  const hay = mediaHaystack(inv, opts?.seedBasename)
  const whiteBg = isWhiteBgSourceHint(inv)
  const isPdfLike = /\.pdf/i.test(hay) || inv.source_type?.toLowerCase().includes("pdf")

  if (SCHEME_RE.test(hay) || isPdfLike) return "scheme"
  if (GALLERY_THIRD_RE.test(hay) && !isWardrobeOpenInteriorShot(inv)) return "front_3_4"
  if (/[-_]iso[-_]?\d/i.test(hay) && !isWardrobeOpenInteriorShot(inv)) return "front_3_4"
  if (isWardrobeOpenInteriorShot(inv)) return "interior"
  if (isInteriorSourceHint(hay) && !isThreeQuarterSourceHint(hay)) return "interior"
  if (DETAIL_RE.test(hay)) return "detail"
  if (LIFESTYLE_RE.test(hay) && !whiteBg) return "lifestyle"

  const hasFront = FRONT_RE.test(hay)
  const hasClosed = CLOSED_RE.test(hay)
  const hasOpen = OPEN_RE.test(hay)

  if (/[-_]i0?2(?:\.|[-_]|$)/i.test(hay) && !isWardrobeOpenInteriorShot(inv)) return "front_3_4"
  if (/[-_]i0?1(?:\.|[-_]|$)/i.test(hay) && !isWardrobeOpenInteriorShot(inv) && !isThreeQuarterSourceHint(hay)) {
    return hasClosed && !hasOpen ? "closed_front" : "front_anfas"
  }
  if (/color_[a-z]+_01/i.test(hay) && !isWardrobeOpenInteriorShot(inv)) {
    return hasClosed && !hasOpen ? "closed_front" : "front_anfas"
  }
  if (/color_[a-z]+_02/i.test(hay) && !isWardrobeOpenInteriorShot(inv)) return "front_3_4"
  const hasHero = HERO_RE.test(hay)
  const isSecond = SECOND_FRONT_RE.test(hay)
  const isFirstExternal = FIRST_EXTERNAL_RE.test(hay) && !INTERIOR_INDEX_RE.test(hay)
  const isGalleryFirst = GALLERY_FIRST_RE.test(hay)
  const is34 = isThreeQuarterSourceHint(hay)

  if (is34) {
    if (/анфас|anfas|straight|front[\s_-]?facing|ровн/i.test(hay) && !/angle|angled|iso|3-4|3\/4/i.test(hay)) {
      return "front_anfas"
    }
    return "front_3_4"
  }

  if (PRODUCT_HERO_SHOT_RE.test(hay) && !isWardrobeOpenInteriorShot(inv)) {
    if (GALLERY_FIRST_RE.test(hay)) return "closed_front"
    if (/color_[a-z]+_01/i.test(hay)) return hasClosed && !hasOpen ? "closed_front" : "front_anfas"
    return hasClosed && !hasOpen ? "closed_front" : "hero_front"
  }
  if (PRODUCT_ALT_EXTERNAL_RE.test(hay) && !isWardrobeOpenInteriorShot(inv)) {
    if (SECOND_FRONT_RE.test(hay) || isThreeQuarterSourceHint(hay)) return "front_3_4"
    return "front_anfas"
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
    return hasOpen && !hasClosed ? "interior" : "closed_front"
  }
  if (SECOND_FRONT_RE.test(hay) && !isInteriorSourceHint(hay)) {
    return isThreeQuarterSourceHint(hay) ? "front_3_4" : "front_3_4"
  }

  if (whiteBg && !hasOpen && !isInteriorSourceHint(hay) && !DETAIL_RE.test(hay)) {
    if (isSecond) return "front_anfas"
    if (isWardrobeOpenInteriorShot(inv)) return "interior"
    if (isClosedExternalSourceHint(hay)) return "closed_front"
    return "unknown"
  }

  return "unknown"
}
