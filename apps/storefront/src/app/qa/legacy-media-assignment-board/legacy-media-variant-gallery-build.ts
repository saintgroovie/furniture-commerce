/**
 * QA-only: one representative per visual role + same-SKU borrowing for missing roles.
 */

import type { CandidateEntry, InvItem } from "./legacy-media-board-types"
import { classifyMediaProductIdentity } from "./suggestion-product-guard"
import type { DedupeHiddenItem, InvItemDedupeFields } from "./legacy-media-dedupe"
import { galleryQualityScore } from "./legacy-media-dedupe"
import {
  classifyVisualRole,
  compareIdsByVisualRole,
  pickPrimaryAndGalleryByVisualRole,
  type VisualRole,
  VISUAL_ROLE_BADGE_RU,
  VISUAL_ROLE_RANK,
} from "./legacy-media-visual-role-ranking"

export type BorrowedSameSkuEntry = {
  mediaId: string
  role: VisualRole
  fromVariantKey: string
  fromVariantLabel: string
}

export const VISUAL_ROLE_STRIP_LABEL_RU: Record<VisualRole, string> = {
  hero_front: "главное",
  front_anfas: "анфас",
  interior: "внутрянка",
  detail: "детали",
  lifestyle: "интерьер",
  scheme: "схема",
  unknown: "?",
}

const BORROWABLE_ROLES: VisualRole[] = ["interior", "detail", "lifestyle", "scheme"]
const GALLERY_ROLE_ORDER: VisualRole[] = ["front_anfas", "interior", "detail", "lifestyle", "scheme", "unknown"]

function scoreMediaId(id: string, invById: Map<string, InvItemDedupeFields>, candById: Map<string, CandidateEntry>, orderIndex: number): number {
  const inv = invById.get(id)
  if (!inv) return -999
  return galleryQualityScore(inv, orderIndex)
}

function sortBucket(ids: string[], invById: Map<string, InvItemDedupeFields>, candById: Map<string, CandidateEntry>): string[] {
  return [...ids].sort((a, b) => {
    const sa = scoreMediaId(a, invById, candById, 0)
    const sb = scoreMediaId(b, invById, candById, 0)
    return sb - sa
  })
}

function pushHidden(
  hidden: DedupeHiddenItem[],
  mediaId: string,
  canonicalMediaId: string,
  invById: Map<string, InvItemDedupeFields>,
  reason: DedupeHiddenItem["reason"] = "near_duplicate"
): void {
  const inv = invById.get(mediaId)
  hidden.push({
    mediaId,
    reason,
    canonicalMediaId,
    matchKey: `role_rep:${reason}`,
    filename: inv?.filename,
    sourcePath: inv?.source_path ?? inv?.repo_relative_path ?? null,
  })
}

export type RoleGalleryBuildResult = {
  primaryId: string | null
  galleryIds: string[]
  rolesById: Map<string, VisualRole>
  roleStrip: VisualRole[]
  hiddenDuplicates: DedupeHiddenItem[]
  duplicateHiddenCount: number
  primaryNeedsReview: boolean
  primaryRole: VisualRole | null
}

/** One best media per visual role; collapse extra front/hero into hidden duplicates. */
export function applyRoleRepresentativeSelection(
  visibleIds: string[],
  invById: Map<string, InvItemDedupeFields>,
  candById: Map<string, CandidateEntry>,
  opts?: { clusterHidden?: DedupeHiddenItem[] }
): RoleGalleryBuildResult {
  const unique = Array.from(new Set(visibleIds.filter(Boolean)))
  const hidden: DedupeHiddenItem[] = [...(opts?.clusterHidden ?? [])]
  const rolesById = new Map<string, VisualRole>()
  const buckets = new Map<VisualRole, string[]>()

  for (let i = 0; i < unique.length; i++) {
    const id = unique[i]!
    const inv = invById.get(id)
    if (!inv) continue
    const role = classifyVisualRole(inv, { orderIndex: i })
    rolesById.set(id, role)
    const list = buckets.get(role) ?? []
    list.push(id)
    buckets.set(role, list)
  }

  const heroSorted = sortBucket(buckets.get("hero_front") ?? [], invById, candById)
  const anfasSorted = sortBucket(buckets.get("front_anfas") ?? [], invById, candById)

  let primaryId: string | null = heroSorted[0] ?? anfasSorted[0] ?? null
  if (!primaryId && unique.length > 0) {
    const pick = pickPrimaryAndGalleryByVisualRole(unique, invById as Map<string, InvItem>)
    primaryId = pick.primaryId
  }

  for (const hid of heroSorted.slice(1)) {
    if (primaryId) pushHidden(hidden, hid, primaryId, invById)
  }

  const galleryIds: string[] = []
  const roleStrip: VisualRole[] = []

  if (primaryId) {
    const pr = rolesById.get(primaryId) ?? "hero_front"
    roleStrip.push(pr === "front_anfas" ? "front_anfas" : "hero_front")
  }

  let anfasPick = anfasSorted.find((id) => id !== primaryId) ?? null
  if (!anfasPick && heroSorted.length > 1 && primaryId === heroSorted[0]) {
    const second = heroSorted[1]
    const r2 = rolesById.get(second)
    if (second && second !== primaryId && (r2 === "front_anfas" || r2 === "hero_front")) {
      anfasPick = second
      rolesById.set(second, "front_anfas")
    }
  }
  if (anfasPick) {
    galleryIds.push(anfasPick)
    if (!roleStrip.includes("front_anfas")) roleStrip.push("front_anfas")
  }
  for (const hid of anfasSorted.filter((id) => id !== anfasPick && id !== primaryId)) {
    pushHidden(hidden, hid, anfasPick || primaryId || hid, invById)
  }

  for (const role of GALLERY_ROLE_ORDER) {
    if (role === "front_anfas") continue
    const bucket = sortBucket(buckets.get(role) ?? [], invById, candById)
    if (bucket.length === 0) continue
    const pick = bucket.find((id) => id !== primaryId && !galleryIds.includes(id)) ?? null
    if (!pick) {
      for (const hid of bucket) {
        if (hid !== primaryId) pushHidden(hidden, hid, primaryId || hid, invById)
      }
      continue
    }
    galleryIds.push(pick)
    if (!roleStrip.includes(role)) roleStrip.push(role)
    for (const hid of bucket) {
      if (hid !== pick && hid !== primaryId) pushHidden(hidden, hid, pick, invById)
    }
  }

  galleryIds.sort((a, b) => compareIdsByVisualRole(a, b, invById as Map<string, InvItem>, { rolesById }))

  const primaryRole = primaryId ? rolesById.get(primaryId) ?? null : null
  const primaryNeedsReview =
    !primaryId ||
    primaryRole === "scheme" ||
    primaryRole === "unknown" ||
    (primaryRole !== "hero_front" && primaryRole !== "front_anfas")

  const dedupedHidden = hidden.filter((h, i, arr) => arr.findIndex((x) => x.mediaId === h.mediaId) === i)
  const clusterCount = opts?.clusterHidden?.length ?? 0

  return {
    primaryId,
    galleryIds,
    rolesById,
    roleStrip,
    hiddenDuplicates: dedupedHidden,
    duplicateHiddenCount: Math.max(0, dedupedHidden.length - clusterCount),
    primaryNeedsReview,
    primaryRole,
  }
}

export type VariantGallerySlice = {
  variantKey: string
  label: string
  colorNameRaw: string
  identityTier: "this_sku" | "needs_identity_review"
  primaryCandidateId: string | null
  galleryCandidateIds: string[]
  rolesById: Map<string, VisualRole>
  roleStrip: VisualRole[]
}

export function applySameSkuRoleBorrowing(
  target: VariantGallerySlice,
  siblings: VariantGallerySlice[],
  invById: Map<string, InvItemDedupeFields>,
  candById: Map<string, CandidateEntry>,
  productHandle: string,
  productSku: string
): { borrowed: BorrowedSameSkuEntry[]; galleryCandidateIds: string[]; rolesById: Map<string, VisualRole> } {
  const borrowed: BorrowedSameSkuEntry[] = []
  const galleryIds = [...target.galleryCandidateIds]
  const rolesById = new Map(target.rolesById)
  const ownedIds = new Set<string>([
    ...(target.primaryCandidateId ? [target.primaryCandidateId] : []),
    ...galleryIds,
  ])

  const filledRoles = new Set<VisualRole>()
  if (target.primaryCandidateId) filledRoles.add(rolesById.get(target.primaryCandidateId) ?? "unknown")
  for (const id of galleryIds) filledRoles.add(rolesById.get(id) ?? "unknown")

  if (target.identityTier !== "this_sku") {
    return { borrowed, galleryCandidateIds: galleryIds, rolesById }
  }

  for (const role of BORROWABLE_ROLES) {
    if (filledRoles.has(role)) continue

    outer: for (const sib of siblings) {
      if (sib.variantKey === target.variantKey) continue
      if (sib.identityTier !== "this_sku") continue

      const sibIds = [
        ...(sib.primaryCandidateId ? [sib.primaryCandidateId] : []),
        ...sib.galleryCandidateIds,
      ]
      for (const id of sibIds) {
        if (ownedIds.has(id)) continue
        const inv = invById.get(id)
        if (!inv) continue
        const mediaRole = sib.rolesById.get(id) ?? classifyVisualRole(inv)
        if (mediaRole !== role) continue

        const identity = classifyMediaProductIdentity(inv, candById.get(id), productHandle, productSku)
        if (identity.tier !== "this_sku") continue

        galleryIds.push(id)
        rolesById.set(id, role)
        ownedIds.add(id)
        borrowed.push({
          mediaId: id,
          role,
          fromVariantKey: sib.variantKey,
          fromVariantLabel: sib.label,
        })
        filledRoles.add(role)
        break outer
      }
    }
  }

  galleryIds.sort((a, b) => compareIdsByVisualRole(a, b, invById as Map<string, InvItem>, { rolesById }))
  const roleStrip = [...target.roleStrip]
  for (const role of BORROWABLE_ROLES) {
    if (borrowed.some((b) => b.role === role) && !roleStrip.includes(role)) roleStrip.push(role)
  }
  roleStrip.sort((a, b) => VISUAL_ROLE_RANK[a] - VISUAL_ROLE_RANK[b])

  return { borrowed, galleryCandidateIds: galleryIds, rolesById }
}

export function roleBadgeForMedia(
  mediaId: string,
  rolesById: Map<string, VisualRole>,
  borrowedById: Map<string, BorrowedSameSkuEntry>
): string {
  if (borrowedById.has(mediaId)) return "из этого SKU"
  const role = rolesById.get(mediaId)
  return role ? VISUAL_ROLE_BADGE_RU[role] : "?"
}
