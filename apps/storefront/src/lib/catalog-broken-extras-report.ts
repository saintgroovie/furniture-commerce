import { diagnoseStaticExtraUrl } from "@/lib/extra-url-diagnose"
import {
  collectDisplayGroupExtraImageUrls,
  collectExtraProductImageUrls,
  mergeUniqueExtraUrls,
} from "@/lib/product-images"

export type BrokenExtrasCandidateRow = {
  handle: string
  variant_sku: string | null
  title: string
  metadata_collection: string | null
  product_type: string | null
  display_group: string | null
  listing_is_representative: boolean
  representative_handle: string | null
  main_thumbnail: string
  own_images_raw_length: number
  own_images_raw_preview: unknown[]
  group_member_handles: string[]
  group_member_thumbnails: string[]
  group_member_images_lengths: number[]
  display_group_extra_image_urls_length: number
  final_extra_srcs: string[]
  static_diagnosis_per_extra: Array<{ url: string; diagnosis: string }>
}

function sortMembersForGroup(
  members: Record<string, unknown>[]
): Record<string, unknown>[] {
  return [...members].sort(
    (a, b) =>
      (((a.metadata as Record<string, unknown> | undefined)?.display_group_sort as number) ??
        99) -
      (((b.metadata as Record<string, unknown> | undefined)?.display_group_sort as number) ??
        99)
  )
}

function groupMembersForProduct(
  p: Record<string, unknown>,
  all: Record<string, unknown>[]
): Record<string, unknown>[] {
  const meta = p.metadata as Record<string, unknown> | undefined
  const dg = meta?.display_group as string | undefined
  const coll = meta?.collection as string | undefined
  if (!dg || !coll) return [p]
  const members = all.filter((q) => {
    const m = q.metadata as Record<string, unknown> | undefined
    return m?.display_group === dg && m?.collection === coll
  })
  return sortMembersForGroup(members.length > 0 ? members : [p])
}

function firstVariantSku(p: Record<string, unknown>): string | null {
  const v = p.variants
  if (!Array.isArray(v) || v.length === 0) return null
  const sku = (v[0] as Record<string, unknown>)?.sku
  return typeof sku === "string" ? sku : null
}

/**
 * Read-only report for QA: one row per watched handle present in Store payload.
 */
export function buildBrokenExtrasCandidateRows(
  allProducts: Record<string, unknown>[],
  watchHandlesLower: Set<string>
): BrokenExtrasCandidateRow[] {
  const out: BrokenExtrasCandidateRow[] = []

  for (const raw of allProducts) {
    const h = typeof raw.handle === "string" ? raw.handle.toLowerCase() : ""
    if (!h || !watchHandlesLower.has(h)) continue

    const p = raw
    const meta = p.metadata as Record<string, unknown> | undefined
    const members = groupMembersForProduct(p, allProducts)
    const rep = members[0]
    const repHandle = typeof rep.handle === "string" ? rep.handle : null
    const repId = rep.id as string | undefined
    const pid = p.id as string | undefined
    const listing_is_representative = Boolean(repId && pid && repId === pid)

    const repThumbRaw = rep.thumbnail
    const mainNorm =
      typeof repThumbRaw === "string" ? repThumbRaw.trim() : ""

    const dgExtra = collectDisplayGroupExtraImageUrls(members, mainNorm)
    const ownRep = collectExtraProductImageUrls(rep, mainNorm)
    const final_extra_srcs = mergeUniqueExtraUrls(mainNorm, [ownRep, dgExtra])

    const imgs = p.images
    const ownPreview = Array.isArray(imgs) ? imgs.slice(0, 5) : []

    const static_diagnosis_per_extra = final_extra_srcs.map((url) => ({
      url,
      diagnosis: diagnoseStaticExtraUrl(url),
    }))

    out.push({
      handle: typeof p.handle === "string" ? p.handle : h,
      variant_sku: firstVariantSku(p),
      title: String(p.title ?? ""),
      metadata_collection:
        typeof meta?.collection === "string" ? meta.collection : null,
      product_type: (() => {
        const pt = (p.product_classification as { product_type?: string } | undefined)
          ?.product_type
        return typeof pt === "string" && pt.trim() ? pt.trim() : null
      })(),
      display_group: typeof meta?.display_group === "string" ? meta.display_group : null,
      listing_is_representative,
      representative_handle: repHandle,
      main_thumbnail: mainNorm,
      own_images_raw_length: Array.isArray(p.images) ? p.images.length : 0,
      own_images_raw_preview: ownPreview,
      group_member_handles: members.map((m) =>
        typeof m.handle === "string" ? m.handle : "—"
      ),
      group_member_thumbnails: members.map((m) =>
        typeof m.thumbnail === "string" ? m.thumbnail.trim() : ""
      ),
      group_member_images_lengths: members.map((m) =>
        Array.isArray(m.images) ? m.images.length : 0
      ),
      display_group_extra_image_urls_length: dgExtra.length,
      final_extra_srcs,
      static_diagnosis_per_extra,
    })
  }

  return out
}

export const DEFAULT_BROKEN_EXTRAS_WATCH_HANDLES = [
  "co-02-1",
  "co-15-2",
  "co-05-1",
  "co-61-1",
]
