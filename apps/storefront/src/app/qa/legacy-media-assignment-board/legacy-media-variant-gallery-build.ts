/**
 * QA-only: role-based gallery composition (one representative per role + front-family collapse).
 */

import type { CandidateEntry, InvItem } from "./legacy-media-board-types"
import { classifyMediaProductIdentity } from "./suggestion-product-guard"
import type { DedupeHiddenItem, InvItemDedupeFields } from "./legacy-media-dedupe"
import { galleryQualityScore } from "./legacy-media-dedupe"
import {
  canBePrimaryRole,
  canBorrowVisualRole,
  classifyVisualRole,
  compareIdsByVisualRole,
  extractColorTokenFromMedia,
  FRONT_FAMILY_ROLES,
  GALLERY_ROLE_ORDER,
  isDistinctAlternateFront,
  mediaMatchesColorToken,
  NON_BORROWABLE_EXTERNAL_ROLES,
  pickPrimaryAndGalleryByVisualRole,
  primaryRoleStripLabel,
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

export type RejectedBorrowCandidate = {
  mediaId: string
  role: VisualRole
  fromVariantKey: string
  fromVariantLabel: string
  filename?: string
  reason: string
}

export const VISUAL_ROLE_STRIP_LABEL_RU: Record<VisualRole, string> = {
  closed_front: "закрытый фронт",
  hero_front: "главное",
  front_anfas: "анфас",
  front_3_4: "3/4",
  interior: "внутрянка",
  detail: "детали",
  lifestyle: "интерьер",
  scheme: "схема",
  unknown: "?",
}

const BORROWABLE_ROLES: VisualRole[] = ["interior", "detail", "lifestyle"]
const ALT_FRONT_ROLES: VisualRole[] = ["front_anfas", "front_3_4"]

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
  reason: DedupeHiddenItem["reason"] = "near_duplicate",
  matchKey?: string
): void {
  const inv = invById.get(mediaId)
  hidden.push({
    mediaId,
    reason,
    canonicalMediaId,
    matchKey: matchKey ?? `role_rep:${reason}`,
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
  roleCompositionSummary: string
  primarySelectionReason?: string
}

export type HiddenDuplicateRoleGroup = {
  role: VisualRole
  roleLabel: string
  count: number
  canonicalMediaId: string
  hiddenIds: string[]
  filenames: string[]
}

/** Group hidden duplicates by visual role for Details panel. */
export function groupHiddenDuplicatesByRole(
  hidden: DedupeHiddenItem[],
  invById: Map<string, InvItemDedupeFields>,
  rolesById: Map<string, VisualRole>
): HiddenDuplicateRoleGroup[] {
  const groups = new Map<string, HiddenDuplicateRoleGroup>()
  for (const row of hidden) {
    const inv = invById.get(row.mediaId)
    const role = rolesById.get(row.mediaId) ?? (inv ? classifyVisualRole(inv) : "unknown")
    const key = `${role}:${row.canonicalMediaId}`
    const existing = groups.get(key) ?? {
      role,
      roleLabel: VISUAL_ROLE_BADGE_RU[role],
      count: 0,
      canonicalMediaId: row.canonicalMediaId,
      hiddenIds: [],
      filenames: [],
    }
    existing.count += 1
    existing.hiddenIds.push(row.mediaId)
    existing.filenames.push(inv?.filename ?? row.mediaId.slice(0, 16))
    groups.set(key, existing)
  }
  return Array.from(groups.values()).sort((a, b) => VISUAL_ROLE_RANK[a.role] - VISUAL_ROLE_RANK[b.role])
}

function buildRoleCompositionSummary(
  primaryId: string | null,
  galleryIds: string[],
  rolesById: Map<string, VisualRole>,
  hiddenCount: number
): string {
  const parts: string[] = []
  if (primaryId) {
    const pr = rolesById.get(primaryId) ?? "unknown"
    parts.push(`Primary: ${VISUAL_ROLE_BADGE_RU[pr]}`)
  }
  if (galleryIds.length > 0) {
    const g = galleryIds.map((id) => VISUAL_ROLE_BADGE_RU[rolesById.get(id) ?? "unknown"]).join(" → ")
    parts.push(`Gallery: ${g}`)
  }
  if (hiddenCount > 0) parts.push(`скрыто похожих: ${hiddenCount}`)
  return parts.join(" · ")
}

function primarySelectionReasonFor(
  primaryId: string | null,
  rolesById: Map<string, VisualRole>,
  colorToken?: string
): string | undefined {
  if (!primaryId) return undefined
  const role = rolesById.get(primaryId) ?? "unknown"
  const colorNote = colorToken ? `color=${colorToken}` : "color-specific pool"
  return `best ${role} in ${colorNote}; anfas/closed front beats 3/4`
}

/** Role-aware Primary + Gallery; collapse redundant front aliases into hidden duplicates. */
export function applyRoleRepresentativeSelection(
  visibleIds: string[],
  invById: Map<string, InvItemDedupeFields>,
  candById: Map<string, CandidateEntry>,
  opts?: {
    clusterHidden?: DedupeHiddenItem[]
    lockedPrimaryId?: string | null
    colorToken?: string
    productHandle?: string
    productSku?: string
  }
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

  const pick = pickPrimaryAndGalleryByVisualRole(unique, invById as Map<string, InvItem>, {
    colorToken: opts?.colorToken,
    productHandle: opts?.productHandle,
    productSku: opts?.productSku,
  })
  let primaryId: string | null =
    opts?.lockedPrimaryId && unique.includes(opts.lockedPrimaryId) ? opts.lockedPrimaryId : pick.primaryId

  if (primaryId && !canBePrimaryRole(rolesById.get(primaryId) ?? "unknown")) {
    const closedSorted = sortBucket(
      [...(buckets.get("closed_front") ?? []), ...(buckets.get("hero_front") ?? []), ...(buckets.get("front_anfas") ?? [])],
      invById,
      candById
    )
    primaryId = closedSorted[0] ?? pick.primaryId
  }
  if (!primaryId) {
    const closedSorted = sortBucket(
      [...(buckets.get("closed_front") ?? []), ...(buckets.get("front_anfas") ?? []), ...(buckets.get("hero_front") ?? [])],
      invById,
      candById
    )
    primaryId = closedSorted[0] ?? null
  }

  const galleryIds: string[] = []
  const roleStrip: VisualRole[] = []
  let alternateFrontUsed = false

  if (primaryId) {
    roleStrip.push(primaryRoleStripLabel(rolesById.get(primaryId) ?? null))
  }

  for (const role of ["closed_front", "hero_front", "front_anfas"] as VisualRole[]) {
    const bucket = sortBucket(buckets.get(role) ?? [], invById, candById)
    for (const id of bucket) {
      if (id === primaryId) continue
      pushHidden(hidden, id, primaryId || id, invById, "near_duplicate", `front_family:${role}`)
    }
  }

  for (const role of ALT_FRONT_ROLES) {
    const bucket = sortBucket(buckets.get(role) ?? [], invById, candById)
    if (!primaryId || bucket.length === 0) continue
    const pickAlt = bucket.find((id) => id !== primaryId && isDistinctAlternateFront(primaryId, id, invById as Map<string, InvItem>, rolesById))
    for (const id of bucket) {
      if (id === primaryId) continue
      if (id === pickAlt && !alternateFrontUsed) {
        galleryIds.push(id)
        if (!roleStrip.includes(role)) roleStrip.push(role)
        alternateFrontUsed = true
        continue
      }
      pushHidden(hidden, id, pickAlt || primaryId, invById, "near_duplicate", `alt_front:${role}`)
    }
  }

  for (const role of GALLERY_ROLE_ORDER) {
    if (ALT_FRONT_ROLES.includes(role)) continue
    const bucket = sortBucket(buckets.get(role) ?? [], invById, candById)
    if (bucket.length === 0) continue
    const rep = bucket.find((id) => id !== primaryId && !galleryIds.includes(id)) ?? null
    if (!rep) {
      for (const hid of bucket) {
        if (hid !== primaryId) pushHidden(hidden, hid, primaryId || hid, invById)
      }
      continue
    }
    galleryIds.push(rep)
    if (!roleStrip.includes(role)) roleStrip.push(role)
    for (const hid of bucket) {
      if (hid !== rep && hid !== primaryId) pushHidden(hidden, hid, rep, invById)
    }
  }

  galleryIds.sort((a, b) => compareIdsByVisualRole(a, b, invById as Map<string, InvItem>, { rolesById }))
  roleStrip.sort((a, b) => VISUAL_ROLE_RANK[a] - VISUAL_ROLE_RANK[b])

  const primaryRole = primaryId ? rolesById.get(primaryId) ?? null : null
  const primaryNeedsReview =
    !primaryId ||
    primaryRole === "scheme" ||
    primaryRole === "unknown" ||
    (primaryRole != null && !canBePrimaryRole(primaryRole))

  const dedupedHidden = hidden.filter((h, i, arr) => arr.findIndex((x) => x.mediaId === h.mediaId) === i)
  const clusterCount = opts?.clusterHidden?.length ?? 0
  const roleHiddenOnly = dedupedHidden.filter((h) => !opts?.clusterHidden?.some((c) => c.mediaId === h.mediaId))
  const duplicateHiddenCount = Math.max(roleHiddenOnly.length, dedupedHidden.length - clusterCount)

  return {
    primaryId,
    galleryIds,
    rolesById,
    roleStrip,
    hiddenDuplicates: dedupedHidden,
    duplicateHiddenCount,
    primaryNeedsReview,
    primaryRole,
    roleCompositionSummary: buildRoleCompositionSummary(primaryId, galleryIds, rolesById, duplicateHiddenCount),
    primarySelectionReason: primarySelectionReasonFor(primaryId, rolesById, opts?.colorToken),
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
  mediaPoolIds?: string[]
}

function rejectBorrow(
  rejected: RejectedBorrowCandidate[],
  inv: InvItemDedupeFields,
  mediaId: string,
  mediaRole: VisualRole,
  sib: VariantGallerySlice,
  reason: string
): void {
  rejected.push({
    mediaId,
    role: mediaRole,
    fromVariantKey: sib.variantKey,
    fromVariantLabel: sib.label,
    filename: inv.filename,
    reason,
  })
}

export function applySameSkuRoleBorrowing(
  target: VariantGallerySlice,
  siblings: VariantGallerySlice[],
  invById: Map<string, InvItemDedupeFields>,
  candById: Map<string, CandidateEntry>,
  productHandle: string,
  productSku: string
): {
  borrowed: BorrowedSameSkuEntry[]
  galleryCandidateIds: string[]
  rolesById: Map<string, VisualRole>
  rejectedBorrowCandidates: RejectedBorrowCandidate[]
} {
  const borrowed: BorrowedSameSkuEntry[] = []
  const rejectedBorrowCandidates: RejectedBorrowCandidate[] = []
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
    return { borrowed, galleryCandidateIds: galleryIds, rolesById, rejectedBorrowCandidates }
  }

  const targetColor = target.colorNameRaw

  for (const role of BORROWABLE_ROLES) {
    if (filledRoles.has(role)) continue

    outer: for (const sib of siblings) {
      if (sib.variantKey === target.variantKey) continue
      if (sib.identityTier !== "this_sku") continue

      const sibIds = Array.from(
        new Set([
          ...(sib.mediaPoolIds ?? []),
          ...(sib.primaryCandidateId ? [sib.primaryCandidateId] : []),
          ...sib.galleryCandidateIds,
        ])
      )
      for (const id of sibIds) {
        if (ownedIds.has(id)) continue
        const inv = invById.get(id)
        if (!inv) continue
        const mediaRole = sib.rolesById.get(id) ?? classifyVisualRole(inv)

        if (NON_BORROWABLE_EXTERNAL_ROLES.has(mediaRole) || FRONT_FAMILY_ROLES.has(mediaRole)) {
          rejectBorrow(rejectedBorrowCandidates, inv, id, mediaRole, sib, "front role cannot be borrowed")
          continue
        }
        if (!canBorrowVisualRole(mediaRole)) {
          if (mediaRole !== role) {
            rejectBorrow(rejectedBorrowCandidates, inv, id, mediaRole, sib, `role ${mediaRole} is not borrowable`)
          }
          continue
        }
        if (mediaRole !== role) continue

        const identity = classifyMediaProductIdentity(inv, candById.get(id), productHandle, productSku)
        if (identity.tier !== "this_sku") {
          rejectBorrow(rejectedBorrowCandidates, inv, id, mediaRole, sib, `identity ${identity.tier}`)
          continue
        }

        const sourceColor = extractColorTokenFromMedia(inv, productHandle, productSku)
        if (sourceColor && sourceColor === targetColor) {
          rejectBorrow(rejectedBorrowCandidates, inv, id, mediaRole, sib, "same color token as target variant")
          continue
        }
        if (mediaMatchesColorToken(inv, targetColor, productHandle, productSku)) {
          rejectBorrow(rejectedBorrowCandidates, inv, id, mediaRole, sib, "target color owns this media")
          continue
        }

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

  const sortedGallery = galleryIds
    .filter((id) => id !== target.primaryCandidateId)
    .sort((a, b) => compareIdsByVisualRole(a, b, invById as Map<string, InvItem>, { rolesById }))

  const roleStrip = [...target.roleStrip]
  for (const role of BORROWABLE_ROLES) {
    if (borrowed.some((b) => b.role === role) && !roleStrip.includes(role)) roleStrip.push(role)
  }
  for (const id of sortedGallery) {
    const r = rolesById.get(id)
    if (r && !roleStrip.includes(r) && !FRONT_FAMILY_ROLES.has(r) && r !== "front_3_4") roleStrip.push(r)
  }
  roleStrip.sort((a, b) => VISUAL_ROLE_RANK[a] - VISUAL_ROLE_RANK[b])

  return {
    borrowed,
    galleryCandidateIds: sortedGallery,
    rolesById,
    rejectedBorrowCandidates,
  }
}

export function roleBadgeForMedia(
  mediaId: string,
  rolesById: Map<string, VisualRole>,
  borrowedById: Map<string, BorrowedSameSkuEntry>
): string {
  const borrowed = borrowedById.get(mediaId)
  if (borrowed && canBorrowVisualRole(borrowed.role)) return "из этого SKU · другой цвет"
  const role = rolesById.get(mediaId)
  return role ? VISUAL_ROLE_BADGE_RU[role] : "?"
}
