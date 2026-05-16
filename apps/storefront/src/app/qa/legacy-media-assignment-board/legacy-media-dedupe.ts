/**
 * Dev/QA only: dedupe + sort legacy media candidates for board suggestions.
 * Uses inventory duplicate_group_key / content_quick_hash when present; no new deps.
 */

import type { CandidateEntry, InvItem } from "./legacy-media-board-types"
import { pickAutoPrimaryForCandidates, scorePrimaryCandidate } from "./legacy-variant-primary-heuristic"

export type InvItemDedupeFields = InvItem & {
  duplicate_group_key?: string | null
  content_quick_hash?: string | null
  width?: number | null
  height?: number | null
  size_bytes?: number | null
}

export type DedupeHideReason = "exact_duplicate" | "near_duplicate" | "possible_duplicate"

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

export function isWhiteBgSourceHint(inv: InvItemDedupeFields): boolean {
  const hay = `${inv.source_type} ${inv.source_path || ""} ${inv.repo_relative_path || ""}`.toLowerCase()
  return (
    /white[_\s-]?bg|disk[_\s-]?white|белом\s*фоне|фото\s*на\s*белом/i.test(hay) ||
    /yandex\.?disk|yandex disk/i.test(hay)
  )
}

function galleryQualityScore(inv: InvItemDedupeFields, orderIndex: number): number {
  const hay = `${inv.filename} ${inv.source_path || ""} ${inv.repo_relative_path || ""}`.toLowerCase()
  let s = scorePrimaryCandidate(inv, orderIndex, null)
  if (isWhiteBgSourceHint(inv)) s += 80
  if (inv.previewable) s += 25
  if (/interior|inside|open|opened|detail|lifestyle|room|scheme|schema|схем/i.test(hay)) s -= 35
  if (/side|back|angle/i.test(hay)) s -= 20
  return s
}

function canonicalScore(inv: InvItemDedupeFields, ce: CandidateEntry | undefined): number {
  let s = galleryQualityScore(inv, 0)
  if (ce?.confidence === "confirmed") s += 40
  else if (ce?.confidence === "probable") s += 20
  if (ce?.top_candidate?.score) s += Math.min(ce.top_candidate.score, 30)
  if (inv.exists_locally) s += 10
  return s
}

type Fingerprints = {
  exact: string
  near: string
  dg: string | null
  hash: string | null
}

function fingerprintsFor(inv: InvItemDedupeFields): Fingerprints {
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
    dg: inv.duplicate_group_key ?? null,
    hash: inv.content_quick_hash ?? null,
  }
}

function hideReasonFor(a: Fingerprints, b: Fingerprints): DedupeHideReason {
  if (a.exact === b.exact || (a.dg && a.dg === b.dg)) return "exact_duplicate"
  if (a.hash && a.hash === b.hash) return "exact_duplicate"
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
  opts?: { seedOrder?: string[] }
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

  const fps = new Map<string, Fingerprints>()
  for (const id of unique) {
    const inv = invById.get(id)
    if (inv) fps.set(id, fingerprintsFor(inv))
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
      if (fi.near === fj.near) unite(unique[i]!, unique[j]!)
      else if (normalizeBasenameForDedupe(invById.get(unique[i]!)?.filename || "") === normalizeBasenameForDedupe(invById.get(unique[j]!)?.filename || "")) {
        if (fi.hash && fj.hash && fi.hash === fj.hash) unite(unique[i]!, unique[j]!)
        else if (!fi.hash && !fj.hash) unite(unique[i]!, unique[j]!)
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
    const matchKey = fpCanon.dg || fpCanon.near || fpCanon.exact
    if (memberIds.length > 1) {
      duplicateGroups.push({
        matchKey,
        reason: "exact_duplicate",
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

  visibleIds.sort((a, b) => {
    const ia = invById.get(a)
    const ib = invById.get(b)
    const sa = ia ? galleryQualityScore(ia, unique.indexOf(a)) : 0
    const sb = ib ? galleryQualityScore(ib, unique.indexOf(b)) : 0
    return sb - sa
  })

  const pick = pickAutoPrimaryForCandidates(visibleIds, invById as Map<string, InvItem>, {
    seedOrder: opts?.seedOrder,
  })

  const gallerySorted = pick.galleryIds.sort((a, b) => {
    const ia = invById.get(a)
    const ib = invById.get(b)
    return (ib ? galleryQualityScore(ib, 0) : 0) - (ia ? galleryQualityScore(ia, 0) : 0)
  })

  return {
    visibleIds,
    hiddenDuplicates,
    duplicateGroups,
    duplicateHiddenCount: hiddenDuplicates.length,
    primaryCandidateId: pick.primaryId,
    galleryCandidateIds: gallerySorted,
  }
}
