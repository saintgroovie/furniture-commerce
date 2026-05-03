import type { DisplayEntry } from "@/lib/display-group"
import {
  collectDisplayGroupExtraImageUrls,
  collectExtraProductImageUrls,
  mergeUniqueExtraUrls,
} from "@/lib/product-images"
import { isProductInActiveCatalogScope } from "@/lib/catalog-scope"

/** Diagnostic bucket for catalog card media (server-side, no DOM). */
export type CatalogMediaDebugSuspectedReason =
  | "ok_greenwich_like"
  | "members_have_no_images"
  | "members_not_loaded"
  | "display_group_missing"
  | "extras_collected_but_not_rendered"
  | "invalid_or_empty_extra_urls"
  | "unknown"

export type CatalogMediaDebugRow = {
  handle: string
  display_group: string | null
  collection: string | null
  in_catalog_scope: boolean
  group_member_count: number
  representative_thumbnail_present: boolean
  representative_images_length: number
  display_group_extra_image_urls_length: number
  own_extra_urls_length: number
  total_extra_srcs_length: number
  first_three_extra_urls: string[]
  suspected_reason: CatalogMediaDebugSuspectedReason
}

function repImagesLength(p: Record<string, unknown>): number {
  const raw = p.images
  return Array.isArray(raw) ? raw.length : 0
}

function inferReason(args: {
  totalExtra: number
  dgExtraLen: number
  ownExtraLen: number
  hasDgMeta: boolean
  groupMemberCount: number
  repImagesLen: number
  listingUngrouped: boolean
}): CatalogMediaDebugSuspectedReason {
  const {
    totalExtra,
    dgExtraLen,
    ownExtraLen,
    hasDgMeta,
    groupMemberCount,
    repImagesLen,
    listingUngrouped,
  } = args

  if (totalExtra > 0) return "ok_greenwich_like"

  if (listingUngrouped && hasDgMeta && groupMemberCount <= 1) {
    return "members_not_loaded"
  }

  if (hasDgMeta && groupMemberCount > 1 && dgExtraLen === 0 && ownExtraLen === 0) {
    return "members_have_no_images"
  }

  if (!hasDgMeta && repImagesLen <= 1 && ownExtraLen === 0) {
    return "display_group_missing"
  }

  if (dgExtraLen > 0 && totalExtra === 0) {
    return "invalid_or_empty_extra_urls"
  }

  if (ownExtraLen > 0 && totalExtra === 0) {
    return "invalid_or_empty_extra_urls"
  }

  return "unknown"
}

/**
 * One row per grouped (or pass-through) catalog card — same extra math as non-Oliver {@link ProductCard}.
 * Set `listingUngrouped` when products are not run through {@link groupProductsForDisplay} (e.g. legacy bespoke listing).
 */
export function buildCatalogMediaDebugRows(
  entries: DisplayEntry[],
  options?: { listingUngrouped?: boolean }
): CatalogMediaDebugRow[] {
  const listingUngrouped = options?.listingUngrouped ?? false
  const out: CatalogMediaDebugRow[] = []

  for (const entry of entries) {
    const p = entry.product
    const handle = typeof p.handle === "string" ? p.handle : ""
    const meta = p.metadata as Record<string, unknown> | undefined
    const dgMeta =
      typeof meta?.display_group === "string" && meta.display_group.trim()
        ? meta.display_group.trim()
        : null
    const coll =
      typeof meta?.collection === "string" && meta.collection.trim()
        ? meta.collection.trim()
        : null
    const inScope = isProductInActiveCatalogScope(p)

    const thumbRaw = p.thumbnail
    const mainSrc =
      typeof thumbRaw === "string" ? thumbRaw.trim() : ""
    const thumbPresent = mainSrc.length > 0

    const groupExtras = Array.isArray(
      (p as { display_group_extra_image_urls?: unknown }).display_group_extra_image_urls
    )
      ? ((p as { display_group_extra_image_urls: string[] }).display_group_extra_image_urls ??
        [])
      : []

    const ownExtra = collectExtraProductImageUrls(p, mainSrc)
    const totalExtra = mergeUniqueExtraUrls(mainSrc, [ownExtra, groupExtras])

    const groupMemberCount = entry.displayGroup?.count ?? 1
    const repImagesLen = repImagesLength(p)

    const firstThree = totalExtra.slice(0, 3)

    const suspected_reason = inferReason({
      totalExtra: totalExtra.length,
      dgExtraLen: groupExtras.length,
      ownExtraLen: ownExtra.length,
      hasDgMeta: dgMeta != null,
      groupMemberCount,
      repImagesLen,
      listingUngrouped,
    })

    out.push({
      handle: handle || "—",
      display_group: dgMeta,
      collection: coll,
      in_catalog_scope: inScope,
      group_member_count: groupMemberCount,
      representative_thumbnail_present: thumbPresent,
      representative_images_length: repImagesLen,
      display_group_extra_image_urls_length: groupExtras.length,
      own_extra_urls_length: ownExtra.length,
      total_extra_srcs_length: totalExtra.length,
      first_three_extra_urls: firstThree,
      suspected_reason,
    })
  }

  return out
}

/** Raw bespoke-style rows: one product per card, no `display_group_extra_image_urls` merge. */
export function buildUngroupedListingDebugRows(
  products: Record<string, unknown>[]
): CatalogMediaDebugRow[] {
  const entries: DisplayEntry[] = products.map((product) => ({
    product,
    displayGroup: undefined,
  }))
  return buildCatalogMediaDebugRows(entries, { listingUngrouped: true })
}

/** Member-level URL count (same helper as grouped card extras source). */
export function memberMergedExtraCountForProduct(
  product: Record<string, unknown>,
  allProducts: Record<string, unknown>[]
): { memberCount: number; mergedExtraLen: number; mainSrc: string } {
  const meta = product.metadata as Record<string, unknown> | undefined
  const dg = meta?.display_group as string | undefined
  const coll = meta?.collection as string | undefined
  const mainSrc =
    typeof product.thumbnail === "string" ? product.thumbnail.trim() : ""
  if (!dg || !coll) {
    return {
      memberCount: 1,
      mergedExtraLen: collectExtraProductImageUrls(product, mainSrc).length,
      mainSrc,
    }
  }
  const members = allProducts.filter((q) => {
    const m = q.metadata as Record<string, unknown> | undefined
    return m?.display_group === dg && m?.collection === coll
  })
  const merged = collectDisplayGroupExtraImageUrls(members, mainSrc)
  return { memberCount: members.length, mergedExtraLen: merged.length, mainSrc }
}
