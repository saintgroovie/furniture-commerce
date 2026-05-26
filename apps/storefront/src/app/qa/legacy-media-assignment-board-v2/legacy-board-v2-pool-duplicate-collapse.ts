/**
 * v2 Media pool — collapse exact duplicate visuals only (conservative).
 * Does not change inventory or candidate scope.
 */

import type { LegacyMediaPreviewRecoveryEntry } from "@/lib/qa/legacy-media-preview-recovery-types"
import { normalizeBasenameForDedupe } from "@/app/qa/legacy-media-assignment-board/legacy-media-dedupe"
import { isEffectivePreviewable } from "./legacy-board-v2-pool-preview"
import {
  classifyMediaVariantScope,
  type MediaVariantScope,
} from "./legacy-board-v2-color-variants"
import {
  isExactSkuMedia,
  type PoolSortItem,
} from "./legacy-board-v2-pool-sort"
import type { InvItem } from "./legacy-board-v2-types"

export type DuplicateSourceMeta = {
  id: string
  idShort: string
  filename: string
  sourceLabel: string
  repoPath: string
}

export type CollapsedPoolRow<T extends PoolSortItem = PoolSortItem> = {
  representative: T
  members: T[]
  sourceCount: number
  sources: DuplicateSourceMeta[]
}

export type CollapsePoolContext = {
  productHandle: string | null
  variantKey: string
  currentMainId?: string | null
  gallerySet?: Set<string>
  runtimeFailedIds?: ReadonlySet<string>
  recoveryById?: ReadonlyMap<string, LegacyMediaPreviewRecoveryEntry>
}

function normPath(p: string | null | undefined): string {
  if (!p) return ""
  return p.replace(/\\/g, "/").toLowerCase().split("?")[0]!.replace(/\/+/g, "/")
}

/** Conservative exact-visual key — never groups blue-i1 vs blue-i2 or different angles. */
export function canonicalVisualKey(inv: InvItem): string {
  const bn = normalizeBasenameForDedupe(inv.filename || "")
  const hash = inv.content_quick_hash?.trim()
  if (hash) return bn ? `exact:hash:${hash}|${bn}` : `exact:hash:${hash}`

  const dg = inv.duplicate_group_key?.trim()
  if (dg) return `exact:dg:${dg}`

  const rr = normPath(inv.repo_relative_path || inv.source_path || "")
  if (rr) return `exact:path:${rr}`

  const w = inv.width ?? 0
  const h = inv.height ?? 0
  const sz = inv.size_bytes ?? 0
  if (bn && w > 0 && h > 0 && sz > 0) {
    return `exact:dim:${bn}|${w}x${h}|${sz}`
  }

  if (bn) return `exact:basename:${bn}`

  return `exact:singleton:${inv.id}`
}

function stableRepresentativeId(members: InvItem[]): string {
  if (members.length === 1) return members[0]!.id
  const sorted = [...members].sort((a, b) => {
    const aLegacy = a.id.includes("legacy") ? 1 : 0
    const bLegacy = b.id.includes("legacy") ? 1 : 0
    if (aLegacy !== bLegacy) return aLegacy - bLegacy

    const aPath = normPath(a.repo_relative_path || a.source_path || "")
    const bPath = normPath(b.repo_relative_path || b.source_path || "")
    const aStatic = aPath.startsWith("apps/backend/static") ? 0 : 1
    const bStatic = bPath.startsWith("apps/backend/static") ? 0 : 1
    if (aStatic !== bStatic) return aStatic - bStatic

    const aFn = (a.filename || a.id).toLowerCase()
    const bFn = (b.filename || b.id).toLowerCase()
    if (aFn !== bFn) return aFn.localeCompare(bFn)
    return a.id.localeCompare(b.id)
  })
  return sorted[0]!.id
}

/** Map every inventory id to the stable representative for its canonical visual group. */
export function buildCanonicalRepresentativeMap(items: readonly InvItem[]): Map<string, string> {
  const groups = new Map<string, InvItem[]>()
  for (const inv of items) {
    const key = canonicalVisualKey(inv)
    const list = groups.get(key) ?? []
    list.push(inv)
    groups.set(key, list)
  }
  const map = new Map<string, string>()
  for (const members of groups.values()) {
    const rep = stableRepresentativeId(members)
    for (const member of members) {
      map.set(member.id, rep)
    }
  }
  return map
}

export function remapMediaIdThroughCanonicalMap(
  mediaId: string,
  canonicalMap: ReadonlyMap<string, string>
): string {
  return canonicalMap.get(mediaId) ?? mediaId
}

export function sourceTypeLabel(inv: InvItem): string {
  const p = normPath(inv.repo_relative_path || inv.source_path || "")
  if (p.startsWith("apps/backend/static")) return "backend_static"
  if (p.startsWith("data/processed")) return "processed"
  if (p.startsWith("data/raw")) return "data_raw"
  if (p.startsWith("/woodright") || p.startsWith("/users") || p.startsWith("/yandex")) {
    return "yandex_ref"
  }
  return "other"
}

export function duplicateSourceMeta(inv: InvItem): DuplicateSourceMeta {
  return {
    id: inv.id,
    idShort: inv.id.replace(/^leginv_/, "").slice(0, 12),
    filename: inv.filename || inv.id,
    sourceLabel: sourceTypeLabel(inv),
    repoPath: normPath(inv.repo_relative_path || inv.source_path || "") || "—",
  }
}

function itemShowsAsPreview(
  item: PoolSortItem,
  runtimeFailedIds: ReadonlySet<string>,
  recoveryById?: ReadonlyMap<string, LegacyMediaPreviewRecoveryEntry>
): boolean {
  return isEffectivePreviewable(item.inv, runtimeFailedIds, recoveryById)
}

function representativeScore(
  item: PoolSortItem,
  indexInGroup: number,
  ctx: CollapsePoolContext
): number {
  const failed = ctx.runtimeFailedIds ?? new Set<string>()
  const gallery = ctx.gallerySet ?? new Set<string>()
  let score = indexInGroup

  if (item.inv.id === (ctx.currentMainId ?? null)) score -= 10_000
  if (gallery.has(item.inv.id)) score -= 5_000

  if (ctx.productHandle && ctx.variantKey !== "__all__") {
    const scope = classifyMediaVariantScope(item.inv, ctx.productHandle, ctx.variantKey)
    if (scope === "active") score -= 1_000
    else if (scope === "neutral") score -= 400
    else score += 200
  }

  if (isExactSkuMedia(item.inv, ctx.productHandle)) score -= 500
  if (itemShowsAsPreview(item, failed, ctx.recoveryById)) score -= 200
  if (!item.inv.id.includes("legacy")) score -= 100

  const path = normPath(item.inv.repo_relative_path || item.inv.source_path || "")
  if (path.startsWith("apps/backend/static")) score -= 50
  else if (path.startsWith("data/processed")) score -= 25

  return score
}

export function pickRepresentativePoolItem<T extends PoolSortItem>(
  members: T[],
  ctx: CollapsePoolContext
): T {
  if (members.length === 1) return members[0]!
  let best = members[0]!
  let bestScore = representativeScore(best, 0, ctx)
  for (let i = 1; i < members.length; i++) {
    const item = members[i]!
    const score = representativeScore(item, i, ctx)
    if (score < bestScore) {
      bestScore = score
      best = item
    }
  }
  return best
}

/** Collapse exact duplicates; preserve first-seen group order from sorted `items`. */
export function collapseExactDuplicatePoolItems<T extends PoolSortItem>(
  items: T[],
  ctx: CollapsePoolContext
): CollapsedPoolRow<T>[] {
  const groups = new Map<string, T[]>()
  const order: string[] = []

  for (const item of items) {
    const key = canonicalVisualKey(item.inv)
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(item)
  }

  return order.map((key) => {
    const members = groups.get(key)!
    const representative = pickRepresentativePoolItem(members, ctx)
    const sources = members.map((m) => duplicateSourceMeta(m.inv))
    return {
      representative,
      members,
      sourceCount: members.length,
      sources,
    }
  })
}

export function poolDuplicateStats(rawCount: number, collapsedCount: number) {
  const hiddenDuplicateCount = Math.max(0, rawCount - collapsedCount)
  return { rawCount, uniqueCount: collapsedCount, hiddenDuplicateCount }
}
