import * as fs from "fs"
import * as path from "path"
import { getDataRepoRoot, readJsonFile } from "./data-repo-root"
import { getEmergencyFixRepoResolution } from "./emergency-fix-repo-root"
import { buildProductIdentities, type ProductIdentity, type TitleSource } from "./product-identity"

export type { ProductIdentity, TitleSource }

export type PoolMediaRef = {
  id: string
  kind: "inventory" | "seed" | "candidate_top"
  label: string
  filename: string | null
  preview_repo_rel: string | null
  preview_url: string | null
  source_type: string | null
}

export type SkuPoolContext = {
  handle: string
  sku: string | null
  collection: string | null
  product_title: string | null
  product_title_raw: string | null
  product_type_title: string | null
  product_title_source: TitleSource
  product_identity_source: TitleSource
  title_confidence: "high" | "low"
  collection_label: string | null
  category: string | null
  dimensions_label: string | null
  is_willie_winkie: boolean
  expected_motif_from_sku_prefix: string | null
  legacy_page_motif: string | null
  resolved_motif: string | null
  legacy_metadata_mismatch: boolean
  motif_subcollection: string | null
  motif_subcollection_expected: string | null
  motif_subcollection_observed: string | null
  catalog_code_label: string | null
  motif_source: import("./product-decor").DecorSource
  motif_confidence: import("./product-decor").DecorConfidence
  motif_mismatch: boolean
  decor_motif: string | null
  decor_motif_expected: string | null
  decor_motif_observed: string | null
  decor_source: import("./product-decor").DecorSource
  decor_confidence: import("./product-decor").DecorConfidence
  decor_mismatch: boolean
  existing_media: PoolMediaRef[]
  has_reference_media: boolean
}

function identityToSkuFields(id: ProductIdentity | undefined, handle: string): Omit<SkuPoolContext, "existing_media" | "has_reference_media"> {
  return {
    handle,
    sku: id?.sku || handle.toUpperCase(),
    collection: id?.collection || null,
    product_title: id?.product_title || null,
    product_title_raw: id?.product_title_raw || null,
    product_type_title: id?.product_type_title || null,
    product_title_source: id?.product_title_source || "unknown",
    product_identity_source: id?.product_identity_source || id?.product_title_source || "unknown",
    title_confidence: id?.title_confidence || "low",
    collection_label: id?.collection_label || null,
    category: id?.category || null,
    dimensions_label: id?.dimensions_label || null,
    is_willie_winkie: id?.is_willie_winkie || false,
    expected_motif_from_sku_prefix: id?.expected_motif_from_sku_prefix || null,
    legacy_page_motif: id?.legacy_page_motif || null,
    resolved_motif: id?.resolved_motif || null,
    legacy_metadata_mismatch: id?.legacy_metadata_mismatch || false,
    motif_subcollection: id?.motif_subcollection || null,
    motif_subcollection_expected: id?.motif_subcollection_expected || null,
    motif_subcollection_observed: id?.motif_subcollection_observed || null,
    catalog_code_label: id?.catalog_code_label || null,
    motif_source: id?.motif_source || "unknown",
    motif_confidence: id?.motif_confidence || "unknown",
    motif_mismatch: id?.motif_mismatch || false,
    decor_motif: id?.decor_motif || null,
    decor_motif_expected: id?.decor_motif_expected || null,
    decor_motif_observed: id?.decor_motif_observed || null,
    decor_source: id?.decor_source || "unknown",
    decor_confidence: id?.decor_confidence || "unknown",
    decor_mismatch: id?.decor_mismatch || false,
  }
}

type InvItem = {
  id: string
  filename?: string | null
  url?: string | null
  repo_relative_path?: string | null
  handle_hint?: string | null
  sku_hint?: string | null
  collection_hint?: string | null
  source_type?: string | null
  previewable?: boolean
}

type SeedProduct = {
  medusa_product_handle?: string
  medusa_product_title?: string
  medusa_collection_handle?: string
  product_code_normalized?: string
  thumbnail_url?: string
  images?: { url?: string }[]
}

function normalizeFn(name: string | null | undefined): string {
  return (name || "").toLowerCase().split("?")[0]
}

function fileExists(repoRoot: string, rel: string | null | undefined): boolean {
  if (!rel) return false
  const abs = path.join(repoRoot, rel)
  return fs.existsSync(abs) && fs.statSync(abs).size > 0
}

function invToRef(repoRoot: string, item: InvItem): PoolMediaRef {
  const rel = item.repo_relative_path
  const canPreview = fileExists(repoRoot, rel)
  return {
    id: item.id,
    kind: "inventory",
    label: item.source_type || "inventory",
    filename: item.filename || null,
    preview_repo_rel: canPreview ? rel : null,
    preview_url: !canPreview && item.url ? item.url : null,
    source_type: item.source_type || null,
  }
}

export function buildSkuPoolContext(
  handles: string[],
  sourcePagesByHandle: Record<string, string[]> = {},
  collectionByHandle: Record<string, string> = {}
): {
  contexts: Record<string, SkuPoolContext>
  data_repo_root: string | null
} {
  const { dataRepoRoot } = getDataRepoRoot()
  const emergency = getEmergencyFixRepoResolution()
  const repoRoot = dataRepoRoot || emergency.repoRoot

  const identitiesEarly = buildProductIdentities(handles, sourcePagesByHandle, collectionByHandle)
  if (!repoRoot) {
    const empty: Record<string, SkuPoolContext> = {}
    for (const h of handles) {
      empty[h] = {
        ...identityToSkuFields(identitiesEarly[h], h),
        existing_media: [],
        has_reference_media: false,
      }
    }
    return { contexts: empty, data_repo_root: null }
  }

  const inv = readJsonFile<{ items: InvItem[] }>(repoRoot, "data/normalized/legacy-media-inventory.json")
  const seeds = readJsonFile<SeedProduct[]>(repoRoot, "data/normalized/seed-products.json")
  const cmap = readJsonFile<{ products?: Record<string, { top_candidate?: { inventory_id?: string } }> }>(
    repoRoot,
    "data/normalized/legacy-media-product-candidate-map.json"
  )

  const invByHandle = new Map<string, InvItem[]>()
  for (const item of inv?.items || []) {
    const h = (item.handle_hint || "").toLowerCase()
    if (!h) continue
    if (!invByHandle.has(h)) invByHandle.set(h, [])
    invByHandle.get(h)!.push(item)
  }

  const seedByHandle = new Map<string, SeedProduct>()
  for (const s of seeds || []) {
    const h = (s.medusa_product_handle || "").toLowerCase()
    if (h) seedByHandle.set(h, s)
  }

  const identities = buildProductIdentities(handles, sourcePagesByHandle, collectionByHandle)
  const contexts: Record<string, SkuPoolContext> = {}

  for (const handle of handles) {
    const h = handle.toLowerCase()
    const seed = seedByHandle.get(h)
    const invItems = (invByHandle.get(h) || []).slice(0, 32)
    const refs: PoolMediaRef[] = []

    for (const item of invItems) {
      refs.push(invToRef(repoRoot, item))
    }

    if (seed?.thumbnail_url) {
      refs.push({
        id: `seed-thumb-${h}`,
        kind: "seed",
        label: "seed thumbnail",
        filename: seed.thumbnail_url.split("/").pop() || null,
        preview_repo_rel: null,
        preview_url: seed.thumbnail_url,
        source_type: "seed",
      })
    }
    for (const [idx, img] of (seed?.images || []).slice(0, 8).entries()) {
      if (!img?.url) continue
      refs.push({
        id: `seed-img-${h}-${idx}`,
        kind: "seed",
        label: `seed image ${idx + 1}`,
        filename: img.url.split("/").pop() || null,
        preview_repo_rel: null,
        preview_url: img.url,
        source_type: "seed",
      })
    }

    const topId = cmap?.products?.[h]?.top_candidate?.inventory_id
    if (topId && inv?.items) {
      const top = inv.items.find((i) => i.id === topId)
      if (top && !refs.some((r) => r.id === top.id)) {
        refs.unshift({ ...invToRef(repoRoot, top), kind: "candidate_top", label: "top_candidate" })
      }
    }

    const withPreview = refs.filter((r) => r.preview_repo_rel || r.preview_url)
    const id = identities[h]
    contexts[h] = {
      ...identityToSkuFields(id, h),
      sku: id?.sku || seed?.product_code_normalized || h.toUpperCase(),
      collection:
        id?.collection || seed?.medusa_collection_handle || invItems[0]?.collection_hint || null,
      product_title: id?.product_title || seed?.medusa_product_title || null,
      existing_media: refs,
      has_reference_media: withPreview.length > 0,
    }
  }

  return { contexts, data_repo_root: repoRoot }
}

export function filenameInPool(filename: string, pool: SkuPoolContext): boolean {
  const fn = normalizeFn(filename)
  return pool.existing_media.some((m) => normalizeFn(m.filename) === fn)
}
