/**
 * Pure helpers: localStorage migration + export document shape for legacy media QA board.
 * No server I/O.
 */

import type { LegacyColorEnrichmentResult } from "@/lib/qa/legacy-color-article-enrichment"
import type { VariantMetaByHandle, VariantMetaState } from "./legacy-media-board-types"

export type ProductZoneState = {
  primary: string | null
  gallery: string[]
  reference_only: string[]
  lane_rejected: string[]
}

export type GlobalRejection = { inventory_id: string; reason: string }

export type PersistedV1Assignment = {
  inventory_id: string
  target_handle: string
  role: "primary_candidate" | "gallery_candidate" | "reference_only" | "do_not_use"
  sort_order: number
}

export type PersistedV1 = {
  version: 1
  assignments: PersistedV1Assignment[]
  rejections: GlobalRejection[]
}

export type PersistedV2 = {
  version: 2
  zonesByHandle: Record<string, ProductZoneState>
  globalRejections: GlobalRejection[]
}

export type ProductExportRow = {
  handle: string
  sku: string
  collection: string
  primary_candidate: string | null
  gallery_candidates: string[]
  reference_only: string[]
  rejected: string[]
}

export function emptyZones(): ProductZoneState {
  return { primary: null, gallery: [], reference_only: [], lane_rejected: [] }
}

export function migrateV1ToV2(v1: PersistedV1): PersistedV2 {
  const zonesByHandle: Record<string, ProductZoneState> = {}
  const ensure = (h: string): ProductZoneState => {
    const k = h.toLowerCase()
    if (!zonesByHandle[k]) zonesByHandle[k] = emptyZones()
    return zonesByHandle[k]
  }
  const sorted = [...v1.assignments].sort((a, b) => a.sort_order - b.sort_order)
  for (const a of sorted) {
    const z = ensure(a.target_handle)
    if (a.role === "primary_candidate") {
      if (z.primary && z.primary !== a.inventory_id) z.gallery.unshift(z.primary)
      z.primary = a.inventory_id
    } else if (a.role === "gallery_candidate") {
      if (!z.gallery.includes(a.inventory_id)) z.gallery.push(a.inventory_id)
    } else if (a.role === "reference_only") {
      if (!z.reference_only.includes(a.inventory_id)) z.reference_only.push(a.inventory_id)
    } else if (a.role === "do_not_use") {
      if (!z.lane_rejected.includes(a.inventory_id)) z.lane_rejected.push(a.inventory_id)
    }
  }
  return { version: 2, zonesByHandle, globalRejections: [...v1.rejections] }
}

export function parsePersisted(raw: unknown): PersistedV2 | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  if (o.version === 2 && o.zonesByHandle && typeof o.zonesByHandle === "object") {
    return normalizeV2(o as Record<string, unknown>)
  }
  if (o.version === 1 && Array.isArray(o.assignments)) {
    return migrateV1ToV2(o as unknown as PersistedV1)
  }
  if (Array.isArray(o.assignments) && !o.zonesByHandle) {
    return migrateV1ToV2({
      version: 1,
      assignments: o.assignments as PersistedV1["assignments"],
      rejections: (Array.isArray(o.rejections) ? o.rejections : []) as GlobalRejection[],
    })
  }
  return null
}

function normalizeV2(o: Record<string, unknown>): PersistedV2 {
  const zb = (o.zonesByHandle ?? {}) as Record<string, unknown>
  const zonesByHandle: Record<string, ProductZoneState> = {}
  for (const [h, z] of Object.entries(zb)) {
    if (!z || typeof z !== "object") continue
    const zz = z as Record<string, unknown>
    zonesByHandle[h.toLowerCase()] = {
      primary: typeof zz.primary === "string" ? zz.primary : null,
      gallery: Array.isArray(zz.gallery) ? zz.gallery.map(String) : [],
      reference_only: Array.isArray(zz.reference_only) ? zz.reference_only.map(String) : [],
      lane_rejected: Array.isArray(zz.lane_rejected) ? zz.lane_rejected.map(String) : [],
    }
  }
  const gr = Array.isArray(o.globalRejections) ? o.globalRejections : []
  const globalRejections: GlobalRejection[] = gr
    .filter((r) => r && typeof r === "object")
    .map((r) => {
      const x = r as Record<string, unknown>
      return { inventory_id: String(x.inventory_id ?? ""), reason: String(x.reason ?? "") }
    })
    .filter((r) => r.inventory_id)
  return { version: 2, zonesByHandle, globalRejections }
}

export function collectAllAssignedIds(zones: Record<string, ProductZoneState>): Set<string> {
  const s = new Set<string>()
  for (const z of Object.values(zones)) {
    if (z.primary) s.add(z.primary)
    for (const id of z.gallery) s.add(id)
    for (const id of z.reference_only) s.add(id)
    for (const id of z.lane_rejected) s.add(id)
  }
  return s
}

export function removeIdFromAllZones(zones: Record<string, ProductZoneState>, id: string): Record<string, ProductZoneState> {
  const next: Record<string, ProductZoneState> = {}
  for (const [h, z] of Object.entries(zones)) {
    const nz: ProductZoneState = {
      primary: z.primary === id ? null : z.primary,
      gallery: z.gallery.filter((x) => x !== id),
      reference_only: z.reference_only.filter((x) => x !== id),
      lane_rejected: z.lane_rejected.filter((x) => x !== id),
    }
    const has = nz.primary || nz.gallery.length || nz.reference_only.length || nz.lane_rejected.length
    if (has) next[h] = nz
  }
  return next
}

export function buildExportDocument(params: {
  exportedAt: string
  products: Array<{ handle: string; sku: string; collection: string }>
  zonesByHandle: Record<string, ProductZoneState>
  globalRejections: GlobalRejection[]
  notes?: string | null
}): Record<string, unknown> {
  const { exportedAt, products, zonesByHandle, globalRejections, notes } = params
  const productsOut: ProductExportRow[] = products.map((p) => {
    const h = p.handle.toLowerCase()
    const z = zonesByHandle[h] ?? emptyZones()
    return {
      handle: p.handle,
      sku: p.sku,
      collection: p.collection,
      primary_candidate: z.primary,
      gallery_candidates: [...z.gallery],
      reference_only: [...z.reference_only],
      rejected: [...z.lane_rejected],
    }
  })
  return {
    version: 2,
    exported_at: exportedAt,
    review_meta: {
      scope: "legacy_media_assignment_board",
      status: "exported_from_storefront_qa",
      local_dev_only: true,
      production_rollout: false,
      compatible_filename: "data/normalized/legacy-media-assignment-decisions.json",
      schema: "legacy_media_assignment_v2",
    },
    products: productsOut,
    global_rejections: globalRejections,
    notes: notes ?? null,
    /** Backward-compatible flat view for scripts that still expect v1-style rows */
    legacy_assignments_v1_flat: flattenToV1Assignments(zonesByHandle),
  }
}

function flattenToV1Assignments(zonesByHandle: Record<string, ProductZoneState>): PersistedV1Assignment[] {
  const out: PersistedV1Assignment[] = []
  for (const [handle, z] of Object.entries(zonesByHandle)) {
    let order = 0
    if (z.primary) {
      out.push({ inventory_id: z.primary, target_handle: handle, role: "primary_candidate", sort_order: order++ })
    }
    for (const id of z.gallery) {
      out.push({ inventory_id: id, target_handle: handle, role: "gallery_candidate", sort_order: order++ })
    }
    for (const id of z.reference_only) {
      out.push({ inventory_id: id, target_handle: handle, role: "reference_only", sort_order: order++ })
    }
    for (const id of z.lane_rejected) {
      out.push({ inventory_id: id, target_handle: handle, role: "do_not_use", sort_order: order++ })
    }
  }
  return out
}

export function defaultVariantMeta(productSkuHint: string, overrides?: Partial<VariantMetaState>): VariantMetaState {
  return {
    productSkuHint,
    filenameColorToken: null,
    candidateMapSku: null,
    legacyColorName: null,
    legacyColorArticle: null,
    legacyColorArticleStatus: "legacy_fetch_unreachable",
    legacyArticleSourceMethod: null,
    legacyArticleSourceUrl: null,
    rawEvidenceSnippet: null,
    urlsChecked: [],
    swatchesChecked: [],
    hoverStatus: null,
    sourceUrl: null,
    fetchStatus: "idle",
    confidence: "low",
    reasons: [],
    sourcePathHints: [],
    status: "suggested",
    fetchedAt: new Date().toISOString(),
    useLegacyName: false,
    useLegacyArticle: false,
    editedLegacyArticle: null,
    ...overrides,
  }
}

export function variantMetaFromEnrichmentAndSuggestion(params: {
  productSkuHint: string
  filenameColorToken?: string | null
  candidateMapSku?: string | null
  suggestionReasons: string[]
  suggestionConfidence: "high" | "medium" | "low"
  suggestionSourcePathHints: string[]
  suggestionSourceUrl: string | null
  enrichment: LegacyColorEnrichmentResult | null
  useLegacyName: boolean
  useLegacyArticle: boolean
  editedLegacyArticle: string | null
  status: VariantMetaState["status"]
}): VariantMetaState {
  const enc = params.enrichment
  const articleFound = enc?.legacy_color_article_status === "found" && Boolean(enc?.legacy_color_article)
  return defaultVariantMeta(params.productSkuHint, {
    filenameColorToken: enc?.filename_color_token ?? params.filenameColorToken ?? null,
    candidateMapSku: enc?.candidate_map_sku ?? params.candidateMapSku ?? null,
    legacyColorName: enc?.legacy_color_name ?? null,
    legacyColorArticle: enc?.legacy_color_article ?? null,
    legacyColorArticleStatus: (enc?.legacy_color_article_status ?? "legacy_fetch_unreachable") as VariantMetaState["legacyColorArticleStatus"],
    legacyArticleSourceMethod: enc?.legacy_article_source_method ?? enc?.source_method ?? null,
    legacyArticleSourceUrl: enc?.legacy_article_source_url ?? enc?.source_url ?? params.suggestionSourceUrl,
    rawEvidenceSnippet: enc?.raw_evidence_snippet ?? null,
    urlsChecked: enc?.urls_checked ?? [],
    swatchesChecked: enc?.swatches_checked ?? [],
    hoverStatus: enc?.hover_status ?? null,
    sourceUrl: enc?.legacy_article_source_url ?? enc?.source_url ?? params.suggestionSourceUrl,
    fetchStatus: (enc?.fetch_status ?? "no_urls") as VariantMetaState["fetchStatus"],
    confidence: (enc?.confidence ?? params.suggestionConfidence) as VariantMetaState["confidence"],
    reasons: [...params.suggestionReasons, ...(enc?.reasons ?? [])],
    sourcePathHints: [...params.suggestionSourcePathHints],
    status: params.status,
    useLegacyName: params.useLegacyName,
    useLegacyArticle: articleFound ? params.useLegacyArticle : false,
    editedLegacyArticle: params.editedLegacyArticle,
  })
}

function normSkuHint(s: string): string {
  return s.replace(/\s+/g, "").replace(/_/g, "-").toLowerCase()
}

/** Hydrate variant meta from older localStorage that used colorSkuOrArticle / camelCase sourceUrl. */
export function migrateLegacyVariantMetaRow(raw: unknown, productSkuHint: string): VariantMetaState {
  if (!raw || typeof raw !== "object") return defaultVariantMeta(productSkuHint)
  const r = raw as Record<string, unknown>
  if (typeof r.productSkuHint === "string" && r.productSkuHint.length > 0) {
    return { ...defaultVariantMeta(productSkuHint), ...(raw as VariantMetaState) }
  }
  const base = normSkuHint(productSkuHint)
  const oldArticle = String(r.colorSkuOrArticle ?? "").trim()
  const legacyFromOld = oldArticle && normSkuHint(oldArticle) !== base ? oldArticle : null
  const src = r.sourceUrl != null ? String(r.sourceUrl) : null
  return defaultVariantMeta(productSkuHint, {
    legacyColorArticle: legacyFromOld,
    legacyColorArticleStatus: legacyFromOld ? "found" : "legacy_fetch_unreachable",
    sourceUrl: src,
    sourcePathHints: Array.isArray(r.sourcePathHints) ? r.sourcePathHints.map(String) : [],
    reasons: Array.isArray(r.reasons) ? r.reasons.map(String) : ["migrated_from_assisted_v1_variant_meta"],
    confidence: r.confidence === "high" || r.confidence === "medium" || r.confidence === "low" ? r.confidence : "low",
    status: r.status === "suggested" || r.status === "confirmed" || r.status === "edited" || r.status === "rejected" ? r.status : "edited",
    fetchedAt: typeof r.fetchedAt === "string" ? r.fetchedAt : new Date().toISOString(),
    useLegacyName: false,
    useLegacyArticle: Boolean(legacyFromOld),
    editedLegacyArticle: null,
  })
}

/** Export slice: snake_case fields for handoff JSON (matches QA contract). */
export function serializeVariantMetaForExport(meta: VariantMetaState): Record<string, unknown> {
  const resolvedArticle =
    meta.editedLegacyArticle?.trim() ||
    (meta.useLegacyArticle ? meta.legacyColorArticle : null) ||
    null
  return {
    product_sku_hint: meta.productSkuHint,
    filename_color_token: meta.filenameColorToken,
    candidate_map_sku: meta.candidateMapSku,
    legacy_color_name: meta.legacyColorName,
    legacy_color_article: resolvedArticle,
    legacy_color_article_parsed: meta.legacyColorArticle,
    legacy_color_article_status: meta.legacyColorArticleStatus,
    legacy_article_source_method: meta.legacyArticleSourceMethod,
    legacy_article_source_url: meta.legacyArticleSourceUrl,
    raw_evidence_snippet: meta.rawEvidenceSnippet,
    source_url: meta.sourceUrl,
    fetch_status: meta.fetchStatus,
    hover_status: meta.hoverStatus,
    confidence: meta.confidence,
    reasons: meta.reasons,
    use_legacy_name: meta.useLegacyName,
    use_legacy_article: meta.useLegacyArticle,
    edited_legacy_article: meta.editedLegacyArticle,
    source_path_hints: meta.sourcePathHints,
    variant_decision_status: meta.status,
    fetched_at: meta.fetchedAt,
  }
}

export function serializeAllVariantMetaExport(variantMetaByHandle: VariantMetaByHandle): Record<string, Record<string, Record<string, unknown>>> {
  const out: Record<string, Record<string, Record<string, unknown>>> = {}
  for (const [h, row] of Object.entries(variantMetaByHandle)) {
    out[h] = {}
    for (const [vk, m] of Object.entries(row)) {
      out[h][vk] = serializeVariantMetaForExport(m)
    }
  }
  return out
}
