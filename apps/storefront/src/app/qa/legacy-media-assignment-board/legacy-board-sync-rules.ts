/**
 * QA-only: board-wide dry-run / apply for current review rules (identity, roles, dedupe, borrow).
 * No Medusa/seed/evidence I/O.
 */

import {
  DEFAULT_VARIANT_KEY,
  LABEL_NEEDS_REVIEW_RU,
  displayLabelFromColorToken,
  reviewSuffixRu,
  sourceLabelForVariantKey,
} from "./legacy-color-variant-labels"
import { dedupeAndSortVariantMedia, type InvItemDedupeFields } from "./legacy-media-dedupe"
import {
  applySameSkuRoleBorrowing,
  sanitizeVariantGalleryCandidates,
  type BorrowedSameSkuEntry,
} from "./legacy-media-variant-gallery-build"
import { variantHasEstablishedGalleryOrder, type GalleryOrderSource } from "./legacy-variant-gallery-order"
import type { VisualRole } from "./legacy-media-visual-role-ranking"
import {
  classifyMediaProductIdentity,
  explicitProductTokenFromMedia,
  normHandle,
  normSku,
} from "./suggestion-product-guard"
import type { CandidateEntry, InvItem, ProductRow, SuggestedVariant } from "./legacy-media-board-types"

export const SYNC_RULE_VERSION = "2026-05-17-rules-v1"

export type SyncVariantState = {
  label: string
  sourceLabel?: string | null
  labelEditedByUser?: boolean
  labelStatus?: string
  primary: string | null
  gallery: string[]
  reference: string[]
  rejected: string[]
  primaryManualOverride?: boolean
  primaryAutoPicked?: boolean
  primaryNeedsReview?: boolean
  galleryOrderSource?: GalleryOrderSource | null
  galleryOrderLocked?: boolean
  syncRuleVersion?: string
  syncAppliedAt?: string
}

export type SyncHiddenDuplicate = {
  mediaId: string
  reason: string
  canonicalMediaId: string
  filename?: string
}

export type VariantSyncPlanItem = {
  productHandle: string
  productSku: string
  collection: string
  variantKey: string
  displayLabel: string
  sourceLabel: string
  identityTier: "this_sku" | "needs_identity_review" | "existing_only"
  currentPrimary: string | null
  proposedPrimary: string | null
  currentGallery: string[]
  proposedGallery: string[]
  hiddenDuplicates: SyncHiddenDuplicate[]
  borrowedSameSku: BorrowedSameSkuEntry[]
  needsIdentityReview: string[]
  excluded: string[]
  protectedManualOrder: boolean
  protectedLabel: boolean
  protectedPrimary: boolean
  wouldChange: boolean
  safeToApply: boolean
  reasons: string[]
  isSuggestionOnly: boolean
}

export type ProductSyncPlan = {
  handle: string
  sku: string
  collection: string
  variantItems: VariantSyncPlanItem[]
  excludedMediaIds: string[]
  needsIdentityReviewMediaIds: string[]
}

export type BoardSyncPlanSummary = {
  productsScanned: number
  variantsScanned: number
  wouldChangeCount: number
  safeToApplyCount: number
  protectedManualOrders: number
  protectedLabels: number
  duplicatesHidden: number
  borrowedSameSkuRoles: number
  needsIdentityReviewMedia: number
  excludedOtherSku: number
}

export type BoardSyncPlan = {
  ruleVersion: string
  generatedAt: string
  products: ProductSyncPlan[]
  summary: BoardSyncPlanSummary
}

function pathNamesSelectedProduct(hay: string, selectedHandle: string, selectedSku: string): boolean {
  const h = normHandle(selectedHandle)
  const sku = normSku(selectedSku)
  if (hay.includes(h)) return true
  if (sku && hay.replace(/-/g, "").includes(sku.replace(/-/g, ""))) return true
  return false
}

export function extractColorTokenForSync(inv: InvItem, selectedHandle: string, selectedSku: string): string | null {
  const hay = `${inv.filename} ${inv.source_path || ""} ${inv.repo_relative_path || ""}`.toLowerCase()
  const m = hay.match(/(?:color|colour)[_-]([a-z0-9-]+)/)
  if (m?.[1]) return m[1]
  const explicit = explicitProductTokenFromMedia(inv)
  const h = normHandle(selectedHandle)
  if (explicit && explicit !== h && explicit !== normSku(selectedSku)) return null
  if (!pathNamesSelectedProduct(hay, selectedHandle, selectedSku)) return null
  const m2 = hay.match(
    /(?:^|[-_])(blue|grey|gray|cream|milk|olive|green|white|beige|black|brown|graphite|ivory)(?:[-_.]|$)/i
  )
  return m2?.[1]?.toLowerCase() ?? null
}

function inferDefaultColorToken(seedUrls: string[], filenames: string[]): string | null {
  const hay = filenames.join(" ").toLowerCase()
  if (/milk|молоч/i.test(hay)) return "milk"
  if (/cream|крем|ivory|молок/i.test(hay)) return "cream"
  if (/_gallery_\d+/i.test(hay)) return "cream"
  if (/[-_]iso[-_]?\d|hero|main/i.test(hay)) return "cream"
  if (/[-_]i\d+$/i.test(hay)) return "milk"
  const seedHay = seedUrls.join(" ").toLowerCase()
  if (/milk|молоч/i.test(seedHay)) return "milk"
  if (/cream|крем|ivory|молок/i.test(seedHay)) return "cream"
  if (/_gallery_|\/gallery_/i.test(seedHay)) return "cream"
  if (/white|бел/i.test(seedHay)) return "white"
  return null
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((id, i) => id === b[i])
}

/** Build suggested variants using current board rules (identity → color → dedupe → borrow). */
export function buildSuggestedVariantsForProductSync(input: {
  handle: string
  product: ProductRow | null
  invItems: InvItem[]
  candById: Map<string, CandidateEntry>
  variantsByHandle?: Record<string, SyncVariantState>
  rejectedVariantKeys?: string[]
}): SuggestedVariant[] {
  const h = input.handle.toLowerCase()
  const productSkuHint = (input.product?.sku || "").trim()
  const seedImageUrls = [...(input.product?.image_urls ?? [])]
  const rejected = new Set(input.rejectedVariantKeys ?? [])
  const confirmedRow = input.variantsByHandle ?? {}

  type GroupAcc = {
    label: string
    thisSkuIds: string[]
    reviewIds: string[]
    candidateMapSku: string | null
    confidence: "high" | "medium" | "low"
    reasons: Set<string>
    identityNotes: Set<string>
    foreignHandle: string | null
    foreignSku: string | null
    pageUrlCandidates: Map<string, string>
    sourcePathHints: Set<string>
    sourceUrl: string | null
  }

  const groups = new Map<string, GroupAcc>()
  const invMap = new Map<string, InvItemDedupeFields>()
  for (const it of input.invItems) {
    invMap.set(it.id, it)
    const ce = input.candById.get(it.id)
    const identity = classifyMediaProductIdentity(it, ce, h, productSkuHint)
    if (identity.tier === "excluded") continue

    const hayName = `${it.filename} ${it.source_path || ""}`.toLowerCase()
    let token = extractColorTokenForSync(it, h, productSkuHint)
    if (!token) {
      if (/_gallery_\d+/i.test(hayName)) {
        token = inferDefaultColorToken(seedImageUrls, [it.filename]) ?? "cream"
      } else {
        const inferred =
          inferDefaultColorToken(seedImageUrls, [it.filename]) ??
          (identity.tier === "this_sku" ? inferDefaultColorToken(seedImageUrls, []) : null)
        token = inferred || "needs_review"
      }
    }
    const baseKey = token === "needs_review" ? "color_needs_review" : `color_${token}`
    const variantKey = identity.tier === "needs_identity_review" ? `${baseKey}__review` : baseKey
    if (rejected.has(variantKey) || rejected.has(baseKey)) continue

    const baseRu =
      token === "needs_review"
        ? LABEL_NEEDS_REVIEW_RU
        : displayLabelFromColorToken(token, { productSkuHint }) || LABEL_NEEDS_REVIEW_RU

    const current = groups.get(variantKey) ?? {
      label: identity.tier === "needs_identity_review" ? reviewSuffixRu(baseRu) : baseRu,
      thisSkuIds: [],
      reviewIds: [],
      candidateMapSku: ce?.top_candidate?.medusa_variant_sku?.trim() || null,
      confidence: ce?.confidence === "confirmed" ? "high" : ce?.confidence === "probable" ? "medium" : "low",
      reasons: new Set<string>(),
      identityNotes: new Set<string>(),
      foreignHandle: identity.foreignHandle,
      foreignSku: identity.foreignSku,
      pageUrlCandidates: new Map<string, string>(),
      sourcePathHints: new Set<string>(),
      sourceUrl: it.legacy_product_url || it.page_url || it.url || null,
    }
    if (identity.tier === "this_sku") current.thisSkuIds.push(it.id)
    else current.reviewIds.push(it.id)
    for (const r of identity.reasons) current.identityNotes.add(r)
    if (it.source_path) current.sourcePathHints.add(it.source_path)
    current.reasons.add(`filename token color_${token}`)
    if (identity.tier === "needs_identity_review") {
      current.reasons.add("needs identity review — not bulk-confirm safe")
    }
    groups.set(variantKey, current)
  }

  type SliceAcc = {
    variantKey: string
    label: string
    v: GroupAcc
    deduped: ReturnType<typeof dedupeAndSortVariantMedia>
    identityTier: "this_sku" | "needs_identity_review"
    reasons: string[]
  }

  const slices: SliceAcc[] = []
  for (const [variantKey, v] of Array.from(groups.entries())) {
    const isReview = variantKey.endsWith("__review")
    const rawIds = isReview ? v.reviewIds : v.thisSkuIds
    if (rawIds.length === 0) continue
    const colorNameRaw = variantKey.replace(/^color_/, "").replace(/__review$/, "")
    const deduped = dedupeAndSortVariantMedia(rawIds, invMap, input.candById, {
      seedOrder: rawIds,
      selectedSku: productSkuHint || h,
      productHandle: h,
      productSku: productSkuHint,
      colorToken: colorNameRaw === "needs_review" ? "" : colorNameRaw,
    })
    if (deduped.visibleIds.length === 0) continue

    const reasons = Array.from(v.reasons)
    if (deduped.duplicateHiddenCount > 0) {
      reasons.push(`dedupe: ${deduped.duplicateHiddenCount} похожих скрыто`)
    }
    const confirmed = confirmedRow[variantKey]
    let label = v.label
    if (confirmed?.labelEditedByUser && confirmed.label?.trim()) label = confirmed.label.trim()
    else if (confirmed?.labelStatus === "user_edited" && confirmed.label?.trim()) label = confirmed.label.trim()

    slices.push({
      variantKey,
      label,
      v,
      deduped,
      identityTier: isReview ? "needs_identity_review" : "this_sku",
      reasons,
    })
  }

  const gallerySlices = slices.map((s) => {
    const poolIds = Array.from(
      new Set([
        ...s.deduped.visibleIds,
        ...s.deduped.hiddenDuplicates.map((d) => d.mediaId),
        ...(s.identityTier === "this_sku" ? s.v.thisSkuIds : s.v.reviewIds),
      ])
    )
    return {
      variantKey: s.variantKey,
      label: s.label,
      colorNameRaw: s.variantKey.replace(/^color_/, "").replace(/__review$/, ""),
      identityTier: s.identityTier,
      primaryCandidateId: s.deduped.primaryCandidateId,
      galleryCandidateIds: s.deduped.galleryCandidateIds,
      rolesById: new Map<string, VisualRole>(
        Object.entries(s.deduped.rolesById ?? {}).map(([id, role]) => [id, role as VisualRole])
      ),
      roleStrip: (s.deduped.roleStrip ?? []) as VisualRole[],
      mediaPoolIds: poolIds,
    }
  })

  const out: SuggestedVariant[] = []
  for (const s of slices) {
    const baseSlice = gallerySlices.find((g) => g.variantKey === s.variantKey)!
    let galleryCandidateIds = baseSlice.galleryCandidateIds
    let rolesById = baseSlice.rolesById
    let roleStrip = baseSlice.roleStrip
    let borrowedSameSku: BorrowedSameSkuEntry[] = []
    let rejectedBorrowCandidates: import("./legacy-media-variant-gallery-build").RejectedBorrowCandidate[] = []
    if (s.identityTier === "this_sku") {
      const borrowed = applySameSkuRoleBorrowing(baseSlice, gallerySlices, invMap, input.candById, h, productSkuHint)
      const colorNameRaw = s.variantKey.replace(/^color_/, "").replace(/__review$/, "")
      const sanitized = sanitizeVariantGalleryCandidates({
        primaryId: s.deduped.primaryCandidateId,
        galleryIds: borrowed.galleryCandidateIds,
        rolesById: borrowed.rolesById,
        borrowed: borrowed.borrowed,
        targetColor: colorNameRaw,
        invById: invMap,
        productHandle: h,
        productSku: productSkuHint,
        rejectedBorrowCandidates: borrowed.rejectedBorrowCandidates,
      })
      galleryCandidateIds = sanitized.galleryIds
      rolesById = borrowed.rolesById
      borrowedSameSku = sanitized.borrowed
      rejectedBorrowCandidates = sanitized.rejectedBorrowCandidates
    }
    const colorNameRaw = s.variantKey.replace(/^color_/, "").replace(/__review$/, "")
    out.push({
      variantKey: s.variantKey,
      label: s.label,
      colorNameRaw,
      productSkuHint,
      filenameColorToken: colorNameRaw === "needs_review" ? "" : colorNameRaw,
      candidateMapSku: s.v.candidateMapSku,
      candidatePageUrls: [],
      seedImageUrls,
      sourceUrl: s.v.sourceUrl,
      sourcePathHints: Array.from(s.v.sourcePathHints).slice(0, 3),
      mediaIds: s.deduped.visibleIds,
      primaryCandidateId: s.deduped.primaryCandidateId,
      galleryCandidateIds,
      confidence: s.identityTier === "this_sku" ? s.v.confidence : "low",
      reasons: s.reasons,
      identityTier: s.identityTier,
      identityNotes: Array.from(s.v.identityNotes).slice(0, 6),
      foreignHandle: s.v.foreignHandle,
      foreignSku: s.v.foreignSku,
      hiddenDuplicateIds: s.deduped.hiddenDuplicates.map((d) => d.mediaId),
      duplicateHiddenCount: s.deduped.duplicateHiddenCount,
      duplicateGroups: s.deduped.duplicateGroups,
      roleStrip,
      rolesByMediaId: Object.fromEntries(rolesById),
      borrowedSameSku,
      rejectedBorrowCandidates,
      primaryNeedsReview: s.deduped.primaryNeedsReview,
      roleCompositionSummary: s.deduped.roleCompositionSummary,
    })
  }
  return out
}

function buildVariantPlanItem(input: {
  product: ProductRow
  suggestion: SuggestedVariant | null
  existing: SyncVariantState | null
  metaStatus?: string | null
  invById: Map<string, InvItem>
  candById: Map<string, CandidateEntry>
  variantKeyOverride?: string
}): VariantSyncPlanItem | null {
  const h = input.product.handle.toLowerCase()
  const sku = (input.product.sku || "").trim()
  const collection = input.product.collection || ""
  const variantKey = input.variantKeyOverride ?? input.suggestion?.variantKey ?? ""
  if (!variantKey) return null

  const existing = input.existing
  const suggestion = input.suggestion
  const protectedManualOrder = existing
    ? variantHasEstablishedGalleryOrder(existing, input.metaStatus)
    : false
  const protectedLabel = Boolean(existing?.labelEditedByUser || existing?.labelStatus === "user_edited")
  const protectedPrimary = Boolean(existing?.primaryManualOverride)

  let displayLabel = suggestion?.label ?? existing?.label ?? LABEL_NEEDS_REVIEW_RU
  if (protectedLabel && existing?.label?.trim()) displayLabel = existing.label.trim()

  const currentPrimary = existing?.primary ?? null
  const currentGallery = [...(existing?.gallery ?? [])]

  let proposedPrimary: string | null = suggestion?.primaryCandidateId ?? currentPrimary
  let proposedGallery = suggestion ? [...suggestion.galleryCandidateIds] : [...currentGallery]
  const reasons: string[] = suggestion ? [...suggestion.reasons] : []

  if (!suggestion && existing) {
    const ids = [existing.primary, ...existing.gallery].filter(Boolean) as string[]
    if (ids.length > 0) {
      const invMap = new Map<string, InvItemDedupeFields>()
      for (const [id, row] of Array.from(input.invById.entries())) invMap.set(id, row)
      const deduped = dedupeAndSortVariantMedia(ids, invMap, input.candById, {
        seedOrder: ids,
        preserveGalleryOrder: protectedManualOrder ? existing.gallery : undefined,
        selectedSku: sku,
      })
      if (!protectedPrimary) proposedPrimary = deduped.primaryCandidateId ?? proposedPrimary
      if (!protectedManualOrder) proposedGallery = [...deduped.galleryCandidateIds]
      reasons.push("rules: dedupe applied to existing variant media")
    }
  }

  if (protectedManualOrder) {
    proposedGallery = [...currentGallery]
    if (!protectedPrimary) {
      // advisory only in reasons — still may propose primary if not manual
    } else {
      proposedPrimary = currentPrimary
    }
  }
  if (protectedPrimary) proposedPrimary = currentPrimary

  const identityTier = suggestion?.identityTier ?? "existing_only"
  const hiddenDuplicates: SyncHiddenDuplicate[] = (suggestion?.hiddenDuplicateIds ?? []).map((mediaId) => {
    const inv = input.invById.get(mediaId)
    return {
      mediaId,
      reason: "near_duplicate",
      canonicalMediaId: mediaId,
      filename: inv?.filename,
    }
  })

  if (protectedManualOrder) reasons.push("protected: manual/recommended gallery order — gallery not auto-changed")
  if (protectedLabel) reasons.push("protected: user-edited label preserved")
  if (protectedPrimary) reasons.push("protected: primaryManualOverride")

  const primaryChanged = currentPrimary !== proposedPrimary
  const galleryChanged = !arraysEqual(currentGallery, proposedGallery)
  const wouldChange = primaryChanged || galleryChanged

  const safeToApply =
    identityTier === "this_sku" &&
    wouldChange &&
    !protectedPrimary &&
    (!protectedManualOrder || primaryChanged)

  return {
    productHandle: h,
    productSku: sku,
    collection,
    variantKey,
    displayLabel,
    sourceLabel: existing?.sourceLabel ?? sourceLabelForVariantKey(variantKey),
    identityTier: identityTier === "needs_identity_review" ? "needs_identity_review" : identityTier === "this_sku" ? "this_sku" : "existing_only",
    currentPrimary,
    proposedPrimary,
    currentGallery,
    proposedGallery,
    hiddenDuplicates,
    borrowedSameSku: (suggestion?.borrowedSameSku ?? []) as BorrowedSameSkuEntry[],
    needsIdentityReview: identityTier === "needs_identity_review" ? [...(suggestion?.mediaIds ?? [])] : [],
    excluded: [],
    protectedManualOrder,
    protectedLabel,
    protectedPrimary,
    wouldChange,
    safeToApply,
    reasons,
    isSuggestionOnly: !existing && Boolean(suggestion),
  }
}

export function buildProductSyncPlan(input: {
  product: ProductRow
  invItems: InvItem[]
  candById: Map<string, CandidateEntry>
  variantsByHandle: Record<string, SyncVariantState>
  variantMetaByHandle?: Record<string, { status?: string }>
  rejectedVariantKeys?: string[]
}): ProductSyncPlan {
  const h = input.product.handle.toLowerCase()
  const invForProduct = input.invItems
  const invById = new Map(invForProduct.map((it) => [it.id, it]))
  const sku = (input.product.sku || "").trim()

  const excludedMediaIds: string[] = []
  const needsIdentityReviewMediaIds: string[] = []

  for (const it of invForProduct) {
    const ce = input.candById.get(it.id)
    const identity = classifyMediaProductIdentity(it, ce, h, sku)
    if (identity.tier === "excluded") excludedMediaIds.push(it.id)
    else if (identity.tier === "needs_identity_review") needsIdentityReviewMediaIds.push(it.id)
  }

  const suggestions = buildSuggestedVariantsForProductSync({
    handle: h,
    product: input.product,
    invItems: invForProduct,
    candById: input.candById,
    variantsByHandle: input.variantsByHandle,
    rejectedVariantKeys: input.rejectedVariantKeys,
  })

  const variantItems: VariantSyncPlanItem[] = []
  const seenKeys = new Set<string>()

  for (const s of suggestions) {
    seenKeys.add(s.variantKey)
    const item = buildVariantPlanItem({
      product: input.product,
      suggestion: s,
      existing: input.variantsByHandle[s.variantKey] ?? null,
      metaStatus: input.variantMetaByHandle?.[s.variantKey]?.status,
      invById,
      candById: input.candById,
    })
    if (item) variantItems.push(item)
  }

  for (const [vk, vv] of Object.entries(input.variantsByHandle)) {
    if (seenKeys.has(vk)) continue
    const ids = [vv.primary, ...vv.gallery].filter(Boolean) as string[]
    if (ids.length === 0 && vk === DEFAULT_VARIANT_KEY) continue
    const item = buildVariantPlanItem({
      product: input.product,
      suggestion: null,
      existing: vv,
      metaStatus: input.variantMetaByHandle?.[vk]?.status,
      invById,
      candById: input.candById,
      variantKeyOverride: vk,
    })
    if (item) variantItems.push(item)
  }

  return {
    handle: h,
    sku,
    collection: input.product.collection || "",
    variantItems,
    excludedMediaIds,
    needsIdentityReviewMediaIds,
  }
}

export function summarizeBoardSyncPlan(plan: BoardSyncPlan): BoardSyncPlanSummary {
  let variantsScanned = 0
  let wouldChangeCount = 0
  let safeToApplyCount = 0
  let protectedManualOrders = 0
  let protectedLabels = 0
  let duplicatesHidden = 0
  let borrowedSameSkuRoles = 0
  let needsIdentityReviewMedia = 0
  let excludedOtherSku = 0

  for (const p of plan.products) {
    excludedOtherSku += p.excludedMediaIds.length
    needsIdentityReviewMedia += p.needsIdentityReviewMediaIds.length
    for (const v of p.variantItems) {
      variantsScanned++
      if (v.wouldChange) wouldChangeCount++
      if (v.safeToApply) safeToApplyCount++
      if (v.protectedManualOrder) protectedManualOrders++
      if (v.protectedLabel) protectedLabels++
      duplicatesHidden += v.hiddenDuplicates.length
      borrowedSameSkuRoles += v.borrowedSameSku.length
    }
  }

  return {
    productsScanned: plan.products.length,
    variantsScanned,
    wouldChangeCount,
    safeToApplyCount,
    protectedManualOrders,
    protectedLabels,
    duplicatesHidden,
    borrowedSameSkuRoles,
    needsIdentityReviewMedia,
    excludedOtherSku,
  }
}

export function buildBoardSyncPlan(input: {
  products: ProductRow[]
  invItems: InvItem[]
  candById: Map<string, CandidateEntry>
  variantsByHandle: Record<string, Record<string, SyncVariantState>>
  variantMetaByHandle?: Record<string, Record<string, { status?: string }>>
  rejectedSuggestedVariantsByHandle?: Record<string, string[]>
  productHandles?: string[]
}): BoardSyncPlan {
  const handleFilter = input.productHandles?.map((x) => x.toLowerCase())
  const products =
    handleFilter && handleFilter.length > 0
      ? input.products.filter((p) => handleFilter.includes(p.handle.toLowerCase()))
      : input.products

  const productsPlans = products.map((product) => {
    const h = product.handle.toLowerCase()
    return buildProductSyncPlan({
      product,
      invItems: input.invItems,
      candById: input.candById,
      variantsByHandle: input.variantsByHandle[h] ?? {},
      variantMetaByHandle: input.variantMetaByHandle?.[h],
      rejectedVariantKeys: input.rejectedSuggestedVariantsByHandle?.[h],
    })
  })

  const plan: BoardSyncPlan = {
    ruleVersion: SYNC_RULE_VERSION,
    generatedAt: new Date().toISOString(),
    products: productsPlans,
    summary: { productsScanned: 0, variantsScanned: 0, wouldChangeCount: 0, safeToApplyCount: 0, protectedManualOrders: 0, protectedLabels: 0, duplicatesHidden: 0, borrowedSameSkuRoles: 0, needsIdentityReviewMedia: 0, excludedOtherSku: 0 },
  }
  plan.summary = summarizeBoardSyncPlan(plan)
  return plan
}

export type ApplySyncResult = {
  variants: Record<string, SyncVariantState>
  applied: number
  skipped: number
  activeZonesMirror: { primary: string | null; gallery: string[] } | null
}

export function applyProductSyncPlan(input: {
  plan: ProductSyncPlan
  variants: Record<string, SyncVariantState>
  activeVariantKey: string | null
  safeOnly: boolean
}): ApplySyncResult {
  const next: Record<string, SyncVariantState> = { ...input.variants }
  let applied = 0
  let skipped = 0
  const now = new Date().toISOString()

  for (const item of input.plan.variantItems) {
    if (item.identityTier === "needs_identity_review") {
      skipped++
      continue
    }
    if (input.safeOnly && !item.safeToApply) {
      skipped++
      continue
    }
    if (!input.safeOnly && !item.wouldChange && !item.isSuggestionOnly) {
      skipped++
      continue
    }

    const prev = next[item.variantKey] ?? {
      label: item.displayLabel,
      primary: null,
      gallery: [],
      reference: [],
      rejected: [],
    }

    const label = item.protectedLabel ? prev.label : item.displayLabel
    const primary = item.protectedPrimary ? prev.primary : item.proposedPrimary
    const gallery = item.protectedManualOrder ? [...prev.gallery] : [...item.proposedGallery]

    next[item.variantKey] = {
      ...prev,
      label,
      sourceLabel: prev.sourceLabel ?? item.sourceLabel,
      labelEditedByUser: item.protectedLabel ? prev.labelEditedByUser : prev.labelEditedByUser,
      labelStatus: item.protectedLabel ? prev.labelStatus : prev.labelStatus ?? "inferred",
      primary,
      gallery,
      primaryManualOverride: item.protectedPrimary ? true : prev.primaryManualOverride,
      primaryAutoPicked: !item.protectedPrimary,
      primaryNeedsReview: false,
      galleryOrderSource: item.protectedManualOrder ? prev.galleryOrderSource ?? "manual" : "rules",
      galleryOrderLocked: item.protectedManualOrder ? true : false,
      syncRuleVersion: SYNC_RULE_VERSION,
      syncAppliedAt: now,
    }
    applied++
  }

  const activeKey = input.activeVariantKey
  const active = activeKey ? next[activeKey] : null
  const activeZonesMirror = active
    ? { primary: active.primary, gallery: [...active.gallery] }
    : null

  return { variants: next, applied, skipped, activeZonesMirror }
}
