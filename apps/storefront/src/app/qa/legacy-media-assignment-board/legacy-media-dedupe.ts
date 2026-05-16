/**
 * Dev/QA only: dedupe + sort legacy media candidates for board suggestions.
 * Uses inventory duplicate_group_key / content_quick_hash when present; no new deps.
 */

import type { CandidateEntry, InvItem } from "./legacy-media-board-types"
import { explicitProductTokenFromMedia, normSku } from "./suggestion-product-guard"
import { scorePrimaryCandidate } from "./legacy-variant-primary-heuristic"
import { applyRoleRepresentativeSelection } from "./legacy-media-variant-gallery-build"
import { compareIdsByVisualRole, pickPrimaryAndGalleryByVisualRole } from "./legacy-media-visual-role-ranking"

export type InvItemDedupeFields = InvItem & {
  duplicate_group_key?: string | null
  content_quick_hash?: string | null
  width?: number | null
  height?: number | null
  size_bytes?: number | null
}

export type DedupeHideReason =
  | "exact_duplicate"
  | "near_duplicate"
  | "possible_duplicate"
  | "preview_unavailable"

export type DedupeHiddenItem = {
  mediaId: string
  reason: DedupeHideReason
  canonicalMediaId: string
  matchKey: string
  filename?: string
  sourcePath?: string | null
}

export type DedupeGroupTrace = {
  matchKey: string
  reason: DedupeHideReason
  canonicalMediaId: string
  memberIds: string[]
}

export type VariantMediaDedupeResult = {
  visibleIds: string[]
  hiddenDuplicates: DedupeHiddenItem[]
  duplicateGroups: DedupeGroupTrace[]
  duplicateHiddenCount: number
  primaryCandidateId: string | null
  galleryCandidateIds: string[]
  rolesById?: Record<string, string>
  roleStrip?: string[]
  borrowedSameSku?: Array<{ mediaId: string; role: string; fromVariantKey: string; fromVariantLabel: string }>
  primaryNeedsReview?: boolean
}

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif)$/i

/** Normalize basename for near-duplicate matching (not a display label). */
export function normalizeBasenameForDedupe(filename: string): string {
  let b = String(filename || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .toLowerCase()
  b = b.replace(IMAGE_EXT_RE, "")
  b = b.replace(/(\s*\(\d+\)|[-_\s]+(copy|копия)(?=$|[-_.\s])|[-_](\d+)(?=\.))/gi, "")
  b = b.replace(/[-_]+/g, "-").replace(/^-+|-+$/g, "")
  return b
}

function normPath(p: string | null | undefined): string {
  if (!p) return ""
  return p.replace(/\\/g, "/").toLowerCase().split("?")[0]!.replace(/\/+/g, "/")
}

function haystackFor(inv: InvItemDedupeFields): string {
  return `${inv.filename} ${inv.source_path || ""} ${inv.repo_relative_path || ""}`.toLowerCase()
}

export function isWhiteBgSourceHint(inv: InvItemDedupeFields): boolean {
  const hay = `${inv.source_type} ${inv.source_path || ""} ${inv.repo_relative_path || ""}`.toLowerCase()
  return (
    /white[_\s-]?bg|disk[_\s-]?white|белом\s*фоне|фото\s*на\s*белом/i.test(hay) ||
    /yandex\.?disk|yandex disk/i.test(hay)
  )
}

type ViewClass = "front_closed" | "front" | "open" | "side" | "detail" | "gallery" | "lifestyle" | "unknown"

function classifyPhotoView(hay: string): ViewClass {
  if (/closed|закрыт/.test(hay) && /front|frontal|фасад|фронт/.test(hay)) return "front_closed"
  if (/front|frontal|фасад|фронт|hero|main/.test(hay)) return "front"
  if (/open|opened|открыт|interior|inside|внутр/.test(hay)) return "open"
  if (/side|back|angle|бок|зад/.test(hay)) return "side"
  if (/detail|closeup|крупн/.test(hay)) return "detail"
  if (/gallery|gal[_-]/.test(hay)) return "gallery"
  if (/room|lifestyle|scheme|schema|схем/.test(hay)) return "lifestyle"
  return "unknown"
}

function normalizePhotoIndex(raw: string): string {
  if (raw === "x") return "x"
  const t = raw.toLowerCase()
  if (t.startsWith("i")) {
    const n = parseInt(t.slice(1), 10)
    return Number.isFinite(n) ? String(n) : t
  }
  const n = parseInt(t, 10)
  return Number.isFinite(n) ? String(n) : t
}

function basenameForIndex(filename: string): string {
  return String(filename || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .toLowerCase()
    .replace(IMAGE_EXT_RE, "")
}

/** Image index from basename only — never from SKU segments like co-02-1. */
function extractPhotoIndex(filename: string): string {
  const base = basenameForIndex(filename)
  const iEnd = base.match(/[-_]i(\d+)$/i)
  if (iEnd) return normalizePhotoIndex(`i${iEnd[1]}`)
  const colorIdx = base.match(/color_[a-z]+_(\d{1,2})$/i)
  if (colorIdx) return normalizePhotoIndex(colorIdx[1]!)
  const gal = base.match(/gallery_(\d{1,2})$/i)
  if (gal) return normalizePhotoIndex(gal[1]!)
  const trailColor = base.match(/(?:blue|grey|gray|olive|cream|milk|white|beige)[-_](\d{1,2})$/i)
  if (trailColor) return normalizePhotoIndex(trailColor[1]!)
  return "x"
}

function isProductColorShotBasename(base: string): boolean {
  return (
    /[-_]i\d+$/i.test(base) ||
    /color_[a-z]+_\d/i.test(base) ||
    /gallery_\d/i.test(base) ||
    /[-_](blue|grey|gray|olive|cream|milk|white|beige)(?:[-_]|$)/i.test(base)
  )
}

function viewBucket(view: ViewClass, filename: string): string {
  const base = basenameForIndex(filename)
  if (view === "front_closed" || view === "front" || view === "unknown" || view === "gallery") {
    if (isProductColorShotBasename(base)) return "front"
  }
  if (view === "front_closed" || view === "front") return "front"
  if (view === "unknown" || view === "gallery") return "hero"
  return view
}

/** Same SKU + color + view + index → likely same visible shot (different legacy aliases). */
export function photoViewDedupeKey(
  inv: InvItemDedupeFields,
  opts?: { selectedSku?: string; colorToken?: string }
): string {
  const base = basenameForIndex(inv.filename)
  const sku = normSku(opts?.selectedSku || explicitProductTokenFromMedia(inv) || "")
  const color = (opts?.colorToken || "any").toLowerCase().replace(/^color_/, "")
  const view = viewBucket(classifyPhotoView(base), inv.filename)
  const idx = extractPhotoIndex(inv.filename)
  return `pv:${sku}|${color}|${view}|${idx}`
}

export function galleryQualityScore(inv: InvItemDedupeFields, orderIndex: number): number {
  const hay = haystackFor(inv)
  let s = scorePrimaryCandidate(inv, orderIndex, null)
  if (isWhiteBgSourceHint(inv)) s += 80
  if (inv.previewable) s += 120
  else s -= 200
  if (inv.exists_locally) s += 15
  if (/interior|inside|open|opened|detail|lifestyle|room|scheme|schema|схем/i.test(hay)) s -= 35
  if (/side|back|angle/i.test(hay)) s -= 20
  return s
}

function canonicalScore(inv: InvItemDedupeFields, ce: CandidateEntry | undefined): number {
  let s = galleryQualityScore(inv, 0)
  if (ce?.confidence === "confirmed") s += 40
  else if (ce?.confidence === "probable") s += 20
  if (ce?.top_candidate?.score) s += Math.min(ce.top_candidate.score, 30)
  return s
}

type Fingerprints = {
  exact: string
  near: string
  view: string
  dg: string | null
  hash: string | null
}

function fingerprintsFor(inv: InvItemDedupeFields, opts?: { selectedSku?: string; colorToken?: string }): Fingerprints {
  const rr = normPath(inv.repo_relative_path || inv.source_path)
  const bn = normalizeBasenameForDedupe(inv.filename)
  const exact = rr ? `path:${rr}` : inv.duplicate_group_key ? `dg:${inv.duplicate_group_key}` : `bn:${bn}|${inv.size_bytes ?? 0}|${inv.width ?? 0}x${inv.height ?? 0}`
  const near =
    inv.content_quick_hash && bn
      ? `hash:${inv.content_quick_hash}|${bn}`
      : inv.duplicate_group_key
        ? `dg:${inv.duplicate_group_key}`
        : `near:${bn}`
  return {
    exact,
    near,
    view: photoViewDedupeKey(inv, opts),
    dg: inv.duplicate_group_key ?? null,
    hash: inv.content_quick_hash ?? null,
  }
}

function hideReasonFor(a: Fingerprints, b: Fingerprints): DedupeHideReason {
  if (a.exact === b.exact || (a.dg && a.dg === b.dg)) return "exact_duplicate"
  if (a.hash && a.hash === b.hash) return "exact_duplicate"
  if (a.view === b.view) return "near_duplicate"
  if (a.near === b.near) return "near_duplicate"
  return "possible_duplicate"
}

/**
 * Collapse duplicate/near-duplicate media ids; pick canonical per group; sort gallery.
 */
export function dedupeAndSortVariantMedia(
  mediaIds: string[],
  invById: Map<string, InvItemDedupeFields>,
  candById: Map<string, CandidateEntry>,
  opts?: { seedOrder?: string[]; preserveGalleryOrder?: string[]; selectedSku?: string; colorToken?: string }
): VariantMediaDedupeResult {
  const unique = Array.from(new Set(mediaIds.filter(Boolean)))
  if (unique.length === 0) {
    return {
      visibleIds: [],
      hiddenDuplicates: [],
      duplicateGroups: [],
      duplicateHiddenCount: 0,
      primaryCandidateId: null,
      galleryCandidateIds: [],
    }
  }

  const fpOpts = { selectedSku: opts?.selectedSku, colorToken: opts?.colorToken }
  const fps = new Map<string, Fingerprints>()
  for (const id of unique) {
    const inv = invById.get(id)
    if (inv) fps.set(id, fingerprintsFor(inv, fpOpts))
  }

  const parent = new Map<string, string>()
  const find = (x: string): string => {
    const p = parent.get(x)
    if (!p || p === x) return x
    const r = find(p)
    parent.set(x, r)
    return r
  }
  const unite = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }

  for (let i = 0; i < unique.length; i++) {
    parent.set(unique[i]!, unique[i]!)
    for (let j = i + 1; j < unique.length; j++) {
      const fi = fps.get(unique[i]!)
      const fj = fps.get(unique[j]!)
      if (!fi || !fj) continue
      if (fi.exact === fj.exact || (fi.dg && fi.dg === fj.dg) || (fi.hash && fi.hash === fj.hash)) {
        unite(unique[i]!, unique[j]!)
        continue
      }
      if (fi.view === fj.view) {
        unite(unique[i]!, unique[j]!)
        continue
      }
      if (fi.near === fj.near) unite(unique[i]!, unique[j]!)
      else {
        const bnA = normalizeBasenameForDedupe(invById.get(unique[i]!)?.filename || "")
        const bnB = normalizeBasenameForDedupe(invById.get(unique[j]!)?.filename || "")
        if (bnA && bnA === bnB) unite(unique[i]!, unique[j]!)
      }
    }
  }

  const clusters = new Map<string, string[]>()
  for (const id of unique) {
    const root = find(id)
    const list = clusters.get(root) ?? []
    list.push(id)
    clusters.set(root, list)
  }

  const visibleIds: string[] = []
  const hiddenDuplicates: DedupeHiddenItem[] = []
  const duplicateGroups: DedupeGroupTrace[] = []

  for (const memberIds of Array.from(clusters.values())) {
    if (memberIds.length === 0) continue
    const ranked = [...memberIds].sort((a, b) => {
      const ia = invById.get(a)
      const ib = invById.get(b)
      const sa = ia ? canonicalScore(ia, candById.get(a)) : -1
      const sb = ib ? canonicalScore(ib, candById.get(b)) : -1
      return sb - sa
    })
    const canonicalId = ranked[0]!
    visibleIds.push(canonicalId)
    const fpCanon = fps.get(canonicalId)!
    const matchKey = fpCanon.view || fpCanon.dg || fpCanon.near || fpCanon.exact
    if (memberIds.length > 1) {
      duplicateGroups.push({
        matchKey,
        reason: hideReasonFor(fpCanon, fpCanon),
        canonicalMediaId: canonicalId,
        memberIds: [...memberIds],
      })
    }
    for (const hid of ranked.slice(1)) {
      const fpH = fps.get(hid)!
      const invH = invById.get(hid)
      hiddenDuplicates.push({
        mediaId: hid,
        reason: hideReasonFor(fpH, fpCanon),
        canonicalMediaId: canonicalId,
        matchKey,
        filename: invH?.filename,
        sourcePath: invH?.source_path ?? invH?.repo_relative_path ?? null,
      })
    }
  }

  const previewableVisible = visibleIds.filter((id) => invById.get(id)?.previewable)
  for (const id of visibleIds) {
    if (!invById.get(id)?.previewable) {
      const fallbackCanon = previewableVisible[0] ?? id
      hiddenDuplicates.push({
        mediaId: id,
        reason: "preview_unavailable",
        canonicalMediaId: fallbackCanon,
        matchKey: "preview_unavailable",
        filename: invById.get(id)?.filename,
        sourcePath: invById.get(id)?.source_path ?? null,
      })
    }
  }

  const visiblePreviewable = previewableVisible.length > 0 ? previewableVisible : visibleIds

  const preserve = opts?.preserveGalleryOrder?.filter(Boolean) ?? []
  const clusterHiddenCount = hiddenDuplicates.length

  if (preserve.length > 0) {
    const orderIndex = new Map(preserve.map((id, i) => [id, i]))
    visiblePreviewable.sort((a, b) => {
      const ia = orderIndex.get(a)
      const ib = orderIndex.get(b)
      if (ia == null && ib == null) return compareIdsByVisualRole(a, b, invById as Map<string, InvItem>)
      if (ia == null) return 1
      if (ib == null) return -1
      return ia - ib
    })
    const pick = pickPrimaryAndGalleryByVisualRole(visiblePreviewable, invById as Map<string, InvItem>, {
      seedOrder: preserve,
    })
    const gallerySorted = visiblePreviewable.filter((id) => id !== pick.primaryId)
    const allHidden = hiddenDuplicates.filter((h, i, arr) => arr.findIndex((x) => x.mediaId === h.mediaId) === i)
    return {
      visibleIds: visiblePreviewable,
      hiddenDuplicates: allHidden,
      duplicateGroups,
      duplicateHiddenCount: allHidden.length,
      primaryCandidateId: pick.primaryId && visiblePreviewable.includes(pick.primaryId) ? pick.primaryId : visiblePreviewable[0] ?? null,
      galleryCandidateIds: gallerySorted,
      borrowedSameSku: [],
      primaryNeedsReview: pick.needsReview,
    }
  }

  const roleBuild = applyRoleRepresentativeSelection(visiblePreviewable, invById, candById, {
    clusterHidden: hiddenDuplicates,
  })

  const allHidden = roleBuild.hiddenDuplicates.filter(
    (h, i, arr) => arr.findIndex((x) => x.mediaId === h.mediaId) === i
  )

  return {
    visibleIds: visiblePreviewable,
    hiddenDuplicates: allHidden,
    duplicateGroups,
    duplicateHiddenCount: Math.max(allHidden.length, clusterHiddenCount),
    primaryCandidateId: roleBuild.primaryId,
    galleryCandidateIds: roleBuild.galleryIds,
    rolesById: Object.fromEntries(roleBuild.rolesById),
    roleStrip: roleBuild.roleStrip,
    borrowedSameSku: [],
    primaryNeedsReview: roleBuild.primaryNeedsReview,
  }
}
