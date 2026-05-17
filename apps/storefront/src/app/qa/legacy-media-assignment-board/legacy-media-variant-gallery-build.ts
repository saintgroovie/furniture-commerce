/**
 * QA-only: role-based gallery composition (one representative per role + front-family collapse).
 */

import type { CandidateEntry, InvItem } from "./legacy-media-board-types"
import { classifyMediaProductIdentity } from "./suggestion-product-guard"
import type { DedupeHiddenItem, InvItemDedupeFields } from "./legacy-media-dedupe"
import { galleryQualityScore } from "./legacy-media-dedupe"
import {
  canBePrimaryForMedia,
  canBePrimaryRole,
  canBorrowVisualRole,
  classifyVisualRole,
  classifyVisualRoleDetailed,
  compareIdsByVisualRole,
  extractColorTokenFromMedia,
  externalMediaAllowedForColorVariant,
  FRONT_FAMILY_ROLES,
  GALLERY_ROLE_ORDER,
  isBorrowableRole,
  isClearlyBorrowableInteriorOrDetailOrLifestyle,
  isDistinctAlternateFront,
  isExternalColorSpecificMedia,
  isExternalVisualRole,
  mediaMatchesColorToken,
  NON_BORROWABLE_EXTERNAL_ROLES,
  operatorRoleLabelRu,
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
  /** Not shown in visible gallery strip — Details / optional add only */
  optional?: boolean
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
    const role = classifyVisualRole(inv, {
      orderIndex: i,
      productHandle: opts?.productHandle,
      productSku: opts?.productSku,
    })
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

  const rolePickOpts = { productHandle: opts?.productHandle, productSku: opts?.productSku }
  const primaryPoolIds = Array.from(
    new Set([...unique, ...(opts?.clusterHidden?.map((h) => h.mediaId) ?? [])])
  )
  if (
    primaryId &&
    invById.get(primaryId) &&
    !canBePrimaryForMedia(invById.get(primaryId)!, rolesById.get(primaryId) ?? "unknown", rolePickOpts)
  ) {
    const closedSorted = sortBucket(
      [...(buckets.get("closed_front") ?? []), ...(buckets.get("hero_front") ?? []), ...(buckets.get("front_anfas") ?? [])],
      invById,
      candById
    )
    primaryId = closedSorted[0] ?? pick.primaryId
  }
  if (
    !primaryId ||
    (primaryId &&
      invById.get(primaryId) &&
      !canBePrimaryForMedia(invById.get(primaryId)!, rolesById.get(primaryId) ?? "unknown", rolePickOpts))
  ) {
    const repick = pickPrimaryAndGalleryByVisualRole(primaryPoolIds, invById as Map<string, InvItem>, {
      colorToken: opts?.colorToken,
      productHandle: opts?.productHandle,
      productSku: opts?.productSku,
    })
    if (repick.primaryId && canBePrimaryForMedia(invById.get(repick.primaryId)!, repick.primaryRole ?? "unknown", rolePickOpts)) {
      primaryId = repick.primaryId
    }
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

  if (opts?.colorToken) {
    const filteredGallery: string[] = []
    for (const id of galleryIds) {
      const inv = invById.get(id)
      const role = rolesById.get(id) ?? (inv ? classifyVisualRole(inv) : "unknown")
      if (
        inv &&
        isExternalVisualRole(role) &&
        !externalMediaAllowedForColorVariant(inv as InvItem, role, opts.colorToken, opts.productHandle, opts.productSku)
      ) {
        continue
      }
      filteredGallery.push(id)
    }
    galleryIds.length = 0
    galleryIds.push(...filteredGallery)
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

/** Final guard: strip illegal external/borrowed ids from gallery (post-borrow, post-recompose). */
export function sanitizeVariantGalleryCandidates(input: {
  primaryId: string | null
  galleryIds: string[]
  rolesById: Map<string, VisualRole>
  borrowed: BorrowedSameSkuEntry[]
  targetColor: string
  invById: Map<string, InvItemDedupeFields>
  productHandle: string
  productSku: string
  rejectedBorrowCandidates?: RejectedBorrowCandidate[]
}): {
  galleryIds: string[]
  borrowed: BorrowedSameSkuEntry[]
  rejectedBorrowCandidates: RejectedBorrowCandidate[]
} {
  const rejected = [...(input.rejectedBorrowCandidates ?? [])]
  const borrowed: BorrowedSameSkuEntry[] = []
  const galleryIds: string[] = []

  for (const id of input.galleryIds) {
    if (!id || id === input.primaryId) continue
    const inv = input.invById.get(id)
    if (!inv) continue
    const role =
      input.rolesById.get(id) ??
      classifyVisualRole(inv, { productHandle: input.productHandle, productSku: input.productSku })
    const borrowEntry = input.borrowed.find((b) => b.mediaId === id)

    if (borrowEntry) {
      if (!isBorrowableRole(borrowEntry.role) || !isBorrowableRole(role)) {
        rejectBorrow(rejected, inv, id, role, {
          variantKey: borrowEntry.fromVariantKey,
          label: borrowEntry.fromVariantLabel,
        } as VariantGallerySlice, "front role cannot be borrowed")
        continue
      }
      if (
        !isClearlyBorrowableInteriorOrDetailOrLifestyle(inv as InvItem, borrowEntry.role, {
          productHandle: input.productHandle,
          productSku: input.productSku,
        })
      ) {
        rejectBorrow(rejected, inv, id, role, {
          variantKey: borrowEntry.fromVariantKey,
          label: borrowEntry.fromVariantLabel,
        } as VariantGallerySlice, "not clearly borrowable interior/detail/lifestyle")
        continue
      }
      if (
        isExternalColorSpecificMedia(inv as InvItem, {
          role,
          productHandle: input.productHandle,
          productSku: input.productSku,
        })
      ) {
        rejectBorrow(rejected, inv, id, role, {
          variantKey: borrowEntry.fromVariantKey,
          label: borrowEntry.fromVariantLabel,
        } as VariantGallerySlice, "external color-specific media cannot be borrowed")
        continue
      }
      borrowed.push(borrowEntry)
      if (!borrowEntry.optional) galleryIds.push(id)
      continue
    }

    if (
      isExternalColorSpecificMedia(inv as InvItem, {
        role,
        productHandle: input.productHandle,
        productSku: input.productSku,
      }) &&
      !externalMediaAllowedForColorVariant(inv, role, input.targetColor, input.productHandle, input.productSku)
    ) {
      rejectBorrow(
        rejected,
        inv,
        id,
        role,
        { variantKey: `color_${input.targetColor}`, label: input.targetColor } as VariantGallerySlice,
        "external photo belongs to another color"
      )
      continue
    }
    if (role === "unknown" && isWhiteBgExternalGuess(inv)) {
      rejectBorrow(
        rejected,
        inv,
        id,
        role,
        { variantKey: `color_${input.targetColor}`, label: input.targetColor } as VariantGallerySlice,
        "unknown external cannot be borrowed"
      )
      continue
    }

    galleryIds.push(id)
  }

  galleryIds.sort((a, b) => compareIdsByVisualRole(a, b, input.invById as Map<string, InvItem>, { rolesById: input.rolesById }))

  // Optional same-SKU borrows are not in galleryIds — keep them for operator UI.
  for (const entry of input.borrowed) {
    if (!entry.optional) continue
    if (borrowed.some((b) => b.mediaId === entry.mediaId)) continue
    borrowed.push(entry)
  }

  return { galleryIds, borrowed, rejectedBorrowCandidates: rejected }
}

function isWhiteBgExternalGuess(inv: InvItemDedupeFields): boolean {
  const hay = `${inv.filename} ${inv.source_path || ""}`.toLowerCase()
  return (
    /white|белом|yandex/i.test(hay) &&
    !isClearlyBorrowableInteriorOrDetailOrLifestyle(inv as InvItem, "interior", undefined)
  )
}

/** Target already has primary + at least one same-color front/3/4 — defer optional interior borrow. */
function targetHasMinimalSameColorCoverage(
  target: VariantGallerySlice,
  galleryIds: string[],
  rolesById: Map<string, VisualRole>,
  invById: Map<string, InvItemDedupeFields>,
  productHandle: string,
  productSku: string
): boolean {
  if (!target.primaryCandidateId) return false
  const targetColor = target.colorNameRaw
  const owned = new Set<string>([target.primaryCandidateId, ...galleryIds])
  for (const id of Array.from(owned)) {
    const inv = invById.get(id)
    if (!inv) continue
    const role = rolesById.get(id) ?? classifyVisualRole(inv, { productHandle, productSku })
    if (role !== "front_3_4" && role !== "front_anfas" && role !== "closed_front" && role !== "hero_front") continue
    if (mediaMatchesColorToken(inv, targetColor, productHandle, productSku)) return true
  }
  return galleryIds.length >= 1
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
        const mediaRole = sib.rolesById.get(id) ?? classifyVisualRole(inv, { productHandle, productSku })

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

        if (!isClearlyBorrowableInteriorOrDetailOrLifestyle(inv as InvItem, mediaRole, { productHandle, productSku })) {
          rejectBorrow(
            rejectedBorrowCandidates,
            inv,
            id,
            mediaRole,
            sib,
            "not clearly borrowable interior/detail/lifestyle"
          )
          continue
        }
        if (
          isExternalColorSpecificMedia(inv as InvItem, {
            role: mediaRole,
            productHandle,
            productSku,
          })
        ) {
          rejectBorrow(
            rejectedBorrowCandidates,
            inv,
            id,
            mediaRole,
            sib,
            "external color-specific media cannot be borrowed"
          )
          continue
        }

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

        const deferOptional =
          (role === "interior" || role === "detail" || role === "lifestyle") &&
          targetHasMinimalSameColorCoverage(target, galleryIds, rolesById, invById, productHandle, productSku)
        rolesById.set(id, role)
        ownedIds.add(id)
        borrowed.push({
          mediaId: id,
          role,
          fromVariantKey: sib.variantKey,
          fromVariantLabel: sib.label,
          optional: deferOptional,
        })
        if (!deferOptional) galleryIds.push(id)
        filledRoles.add(role)
        break outer
      }
    }
  }

  const sanitized = sanitizeVariantGalleryCandidates({
    primaryId: target.primaryCandidateId,
    galleryIds: galleryIds.filter((id) => id !== target.primaryCandidateId),
    rolesById,
    borrowed,
    targetColor,
    invById,
    productHandle,
    productSku,
    rejectedBorrowCandidates,
  })

  return {
    borrowed: sanitized.borrowed,
    galleryCandidateIds: sanitized.galleryIds,
    rolesById,
    rejectedBorrowCandidates: sanitized.rejectedBorrowCandidates,
  }
}

/** Final guard after borrow / recompose / confirm — same rules as sanitizeVariantGalleryCandidates. */
export function finalSanitizeVariantGalleryOutput(
  input: Parameters<typeof sanitizeVariantGalleryCandidates>[0]
): ReturnType<typeof sanitizeVariantGalleryCandidates> {
  return sanitizeVariantGalleryCandidates(input)
}

export function roleBadgeForMedia(
  mediaId: string,
  rolesById: Map<string, VisualRole>,
  borrowedById: Map<string, BorrowedSameSkuEntry>,
  opts?: { needsReview?: boolean }
): string {
  const borrowed = borrowedById.get(mediaId)
  if (borrowed?.optional) return "другой цвет · опционально"
  if (borrowed && canBorrowVisualRole(borrowed.role)) return "другой цвет · опционально"
  if (opts?.needsReview) return "проверь роль"
  const role = rolesById.get(mediaId)
  return role ? operatorRoleLabelRu(role) : "?"
}

/** Single headline role for suggestion card strip (primary role only). */
export function primaryRoleBadgeForSuggestion(
  primaryId: string | null,
  rolesById: Map<string, VisualRole>,
  invById: Map<string, InvItem>,
  opts?: { productHandle?: string; productSku?: string; needsReview?: boolean }
): string | null {
  if (!primaryId) return null
  const inv = invById.get(primaryId)
  const role = rolesById.get(primaryId) ?? (inv ? classifyVisualRole(inv, opts) : null)
  if (!role) return null
  if (opts?.needsReview) return "проверь роль"
  return operatorRoleLabelRu(role)
}
