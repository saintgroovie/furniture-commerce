import "server-only"
import * as fs from "fs"
import * as path from "path"
import { getBaseUrl } from "@/lib/api/base"
import {
  FURNITURE_REPO_MARKERS_DESC,
  getFurnitureRepoDataResolution,
  oxfordLocalMvpQaSnapshotPathCandidates,
  type FurnitureRepoDataResolution,
} from "@/lib/qa/furniture-repo-data-root"
import { enrichOxfordMediaPreview } from "@/lib/qa/oxford-local-mvp-media-preview"
import type {
  OxfordLocalMvpMediaReviewPayload,
  OxfordReviewAggregate,
  OxfordReviewMediaItem,
  OxfordSkuReviewRow,
  OxfordSkuReviewStatus,
} from "@/lib/qa/oxford-local-mvp-media-review-types"
import { previewCanUseImgTag } from "@/lib/qa/oxford-local-mvp-media-review-types"

export type {
  OxfordLocalMvpMediaReviewPayload,
  OxfordReviewAggregate,
  OxfordReviewMediaItem,
  OxfordSkuReviewRow,
  OxfordSkuReviewStatus,
} from "@/lib/qa/oxford-local-mvp-media-review-types"

const INVENTORY_REL = "data/normalized/oxford-local-mvp-media-inventory.json"
const SKU_MAP_REL = "data/normalized/oxford-local-mvp-sku-media-candidate-map.json"
const PLAN_REL = "data/normalized/oxford-local-mvp-media-assignment-plan.json"

function legacyDataPathCandidates(rel: string): string[] {
  return [
    path.join(process.cwd(), rel),
    path.resolve(process.cwd(), "../../", rel),
    path.resolve(process.cwd(), "../..", rel),
    path.resolve(process.cwd(), "../../../", rel),
  ]
}

function readJsonFile(
  rel: string,
  resolution: FurnitureRepoDataResolution
): { ok: true; data: unknown } | { ok: false; error: string } {
  const ordered: string[] = []
  if (resolution.repoRoot) ordered.push(path.join(resolution.repoRoot, rel))
  for (const c of oxfordLocalMvpQaSnapshotPathCandidates(rel)) {
    if (!ordered.includes(c)) ordered.push(c)
  }
  for (const c of legacyDataPathCandidates(rel)) {
    if (!ordered.includes(c)) ordered.push(c)
  }

  for (const abs of ordered) {
    if (!fs.existsSync(abs)) continue
    try {
      return { ok: true, data: JSON.parse(fs.readFileSync(abs, "utf8")) }
    } catch (e) {
      return {
        ok: false,
        error: `${rel}: ${e instanceof Error ? e.message : String(e)} (file=${abs}, cwd=${resolution.cwd}, repo_root=${resolution.repoRoot ?? "null"})`,
      }
    }
  }

  const primaryExpected = resolution.repoRoot ? path.join(resolution.repoRoot, rel) : null
  const legacy = legacyDataPathCandidates(rel)
  return {
    ok: false,
    error: [
      `${rel}: file not found`,
      `process.cwd()=${resolution.cwd}`,
      `resolved_repo_root=${resolution.repoRoot ?? "null"}`,
      `primary_expected_path=${primaryExpected ?? "(no repo root resolved)"}`,
      `walk_seeds=${resolution.seedsTried.join(" | ")}`,
      resolution.repoRoot
        ? `legacy_candidates_checked=${legacy.join(" ; ")}`
        : `hint=could not find repo root (need ${FURNITURE_REPO_MARKERS_DESC} on same tree, or Docker readonly mounts ./data and ./docs onto /app, or run apps/storefront/scripts/sync-oxford-local-mvp-qa-json.mjs); legacy_candidates=${legacy.join(" ; ")}`,
    ].join(" — "),
  }
}

function normalizeKey(s: string): string {
  return s.trim().replace(/\\/g, "/")
}

function mediaKeyFrom(sourcePathOrUrl: string, repoRelative: string | null | undefined, filename: string): string {
  return normalizeKey(repoRelative || sourcePathOrUrl || filename || "unknown")
}

function inferSkuReviewStatus(row: {
  product_in_local_medusa_db: boolean
  media_items: OxfordReviewMediaItem[]
  gallery_review_backlog_urls: string[]
}): OxfordSkuReviewStatus {
  if (!row.product_in_local_medusa_db) return "product_missing_for_media_assignment"
  if (row.media_items.length === 0) return "no_media_candidates"
  if (row.gallery_review_backlog_urls.length > 0) return "has_ambiguous_media"
  const hasAmb = row.media_items.some((m) => m.confidence === "ambiguous")
  if (hasAmb) return "has_ambiguous_media"
  const onlyInterim = row.media_items.every(
    (m) => m.media_class === "interim_non_white" || m.media_class === "pdf_crop" || m.media_class === "legacy_reference" || !m.media_class
  )
  if (onlyInterim && row.media_items.length > 0) return "has_only_interim_media"
  return "ready_for_visual_review"
}

export async function getOxfordLocalMvpMediaReviewPayload(): Promise<OxfordLocalMvpMediaReviewPayload> {
  const loadErrors: string[] = []
  const resolution = getFurnitureRepoDataResolution()
  const invR = readJsonFile(INVENTORY_REL, resolution)
  const mapR = readJsonFile(SKU_MAP_REL, resolution)
  const planR = readJsonFile(PLAN_REL, resolution)

  if (invR.ok === false) loadErrors.push(invR.error)
  if (mapR.ok === false) loadErrors.push(mapR.error)
  if (planR.ok === false) loadErrors.push(planR.error)

  const staticBase = getBaseUrl() || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
  const repoRoot = resolution.repoRoot

  const inventoryRecords = (invR.ok && Array.isArray((invR.data as { inventory_records?: unknown }).inventory_records))
    ? ((invR.data as { inventory_records: Record<string, unknown>[] }).inventory_records ?? [])
    : []

  const skuMapRows = (mapR.ok && Array.isArray((mapR.data as { rows?: unknown }).rows))
    ? ((mapR.data as { rows: Record<string, unknown>[] }).rows ?? [])
    : []

  const planRows = (planR.ok && Array.isArray((planR.data as { rows?: unknown }).rows))
    ? ((planR.data as { rows: Record<string, unknown>[] }).rows ?? [])
    : []

  const planByHandle = new Map<string, Record<string, unknown>>()
  for (const pr of planRows) {
    const h = typeof pr.handle === "string" ? pr.handle.toLowerCase() : ""
    if (h) planByHandle.set(h, pr)
  }

  /** Paths / URLs attached to any SKU candidate or plan slot */
  const assignedKeys = new Set<string>()

  function markAssigned(m: OxfordReviewMediaItem) {
    assignedKeys.add(m.media_key)
    if (m.preview_url) assignedKeys.add(normalizeKey(m.preview_url))
  }

  const sku_rows: OxfordSkuReviewRow[] = []
  let media_confirmed = 0
  let media_probable = 0
  let media_ambiguous = 0
  let media_unassigned = 0
  let sku_rows_with_gallery_backlog = 0

  for (const raw of skuMapRows) {
    const sku = String(raw.sku ?? "")
    const handle = String(raw.handle ?? "").toLowerCase()
    const title = (raw.title_or_canonical as string) ?? null
    const product_in = Boolean(raw.product_in_local_medusa_db)
    const plan = planByHandle.get(handle) ?? {}
    const planned_primary = (plan.proposed_primary_url as string) ?? null
    const planned_tier = (plan.proposed_primary_tier as string) ?? null
    const planned_gallery = Array.isArray(plan.proposed_gallery_urls) ? (plan.proposed_gallery_urls as string[]) : []
    const backlog = Array.isArray(plan.gallery_review_backlog_urls)
      ? (plan.gallery_review_backlog_urls as string[])
      : []
    if (backlog.length > 0) sku_rows_with_gallery_backlog += 1

    const candidatesRaw = Array.isArray(raw.candidates) ? (raw.candidates as Record<string, unknown>[]) : []
    const candidates: OxfordReviewMediaItem[] = candidatesRaw.map((c) => {
      const spo = String(c.source_path_or_url ?? "")
      const rr = typeof c.repo_relative_path === "string" ? c.repo_relative_path : null
      const fn = String(c.filename ?? (rr ? path.basename(rr) : path.basename(spo || "file")))
      const conf = String(c.confidence ?? "")
      if (conf === "confirmed") media_confirmed += 1
      else if (conf === "probable") media_probable += 1
      else if (conf === "ambiguous") media_ambiguous += 1
      else media_unassigned += 1

      const item: OxfordReviewMediaItem = {
        media_key: mediaKeyFrom(spo, rr, fn),
        source_display: spo || rr || fn,
        filename: fn,
        source_kind: typeof c.source_kind === "string" ? c.source_kind : undefined,
        confidence: typeof c.confidence === "string" ? c.confidence : undefined,
        match_tier: typeof c.match_tier === "string" ? c.match_tier : undefined,
        media_class: typeof c.media_class === "string" ? c.media_class : undefined,
        recommended_use: typeof c.recommended_use === "string" ? c.recommended_use : undefined,
        matched_sku: typeof c.matched_sku === "string" ? c.matched_sku : sku,
        matched_handle: typeof c.matched_handle === "string" ? c.matched_handle : handle,
        warnings: Array.isArray(c.warnings) ? (c.warnings as string[]) : [],
        is_orphan: false,
        role: "candidate",
        ...enrichOxfordMediaPreview({
          source_path_or_url: spo,
          repo_relative_path: rr,
          filename: fn,
          repoRoot,
        }),
      }
      markAssigned(item)
      return item
    })

    const media_items: OxfordReviewMediaItem[] = [...candidates]

    const pushPlanUrl = (url: string | null, role: OxfordReviewMediaItem["role"]) => {
      if (!url || !url.trim()) return
      const u = url.trim()
      const fn = path.basename(u.split("?")[0] || "image")
      const mk = mediaKeyFrom(u, null, fn)
      if (media_items.some((x) => x.media_key === mk || x.preview_url === u)) return
      const item: OxfordReviewMediaItem = {
        media_key: mk,
        source_display: u,
        filename: fn,
        matched_sku: sku,
        matched_handle: handle,
        warnings: [],
        is_orphan: false,
        role,
        ...enrichOxfordMediaPreview({
          source_path_or_url: u,
          repo_relative_path: null,
          filename: fn,
          repoRoot,
        }),
      }
      media_items.push(item)
      markAssigned(item)
    }

    pushPlanUrl(planned_primary, "planned_primary")
    for (const u of planned_gallery) pushPlanUrl(u, "planned_gallery")
    for (const u of backlog) pushPlanUrl(u, "gallery_backlog")

    const rowWarnings: string[] = []
    if (!product_in) rowWarnings.push("product_missing_for_media_assignment")
    if (backlog.length) rowWarnings.push("has_gallery_review_backlog")

    const review_status = inferSkuReviewStatus({
      product_in_local_medusa_db: product_in,
      media_items,
      gallery_review_backlog_urls: backlog,
    })

    sku_rows.push({
      sku,
      handle,
      title_or_canonical: title,
      product_in_local_medusa_db: product_in,
      planned_primary_url: planned_primary,
      planned_primary_tier: planned_tier,
      planned_gallery_urls: planned_gallery,
      gallery_review_backlog_urls: backlog,
      candidates,
      media_items,
      warnings: rowWarnings,
      review_status,
    })
  }

  const orphan_media: OxfordReviewMediaItem[] = []
  for (const rec of inventoryRecords) {
    const rr = typeof rec.repo_relative_path === "string" ? rec.repo_relative_path : null
    const sr = typeof rec.source_ref === "string" ? rec.source_ref : null
    const fn = String(rec.filename ?? (rr ? path.basename(rr) : sr ? path.basename(sr) : "unknown"))
    const spo = rr || sr || ""
    const mk = mediaKeyFrom(spo, rr, fn)
    if (assignedKeys.has(mk)) continue
    if (rr && assignedKeys.has(normalizeKey(rr))) continue
    const prevProbe = enrichOxfordMediaPreview({
      source_path_or_url: spo,
      repo_relative_path: rr,
      filename: fn,
      repoRoot,
      exists_locally: typeof rec.exists_locally === "boolean" ? rec.exists_locally : null,
      local_binary_status: typeof rec.local_binary_status === "string" ? String(rec.local_binary_status) : null,
      source_kind: typeof rec.source_kind === "string" ? String(rec.source_kind) : null,
      manifest_http_url: typeof rec.url === "string" ? String(rec.url) : null,
    })
    if (prevProbe.preview_url && assignedKeys.has(normalizeKey(prevProbe.preview_url))) continue

    const oitem: OxfordReviewMediaItem = {
      media_key: mk,
      source_display: spo || mk,
      filename: fn,
      source_kind: typeof rec.source_kind === "string" ? rec.source_kind : undefined,
      confidence: typeof rec.prior_confidence === "string" ? rec.prior_confidence : undefined,
      match_tier: typeof rec.match_tier === "string" ? rec.match_tier : undefined,
      media_class: typeof rec.media_class === "string" ? rec.media_class : undefined,
      recommended_use: undefined,
      matched_sku: null,
      matched_handle: null,
      warnings: ["orphan_not_in_sku_candidate_map", ...(rec.local_binary_status ? [String(rec.local_binary_status)] : [])],
      is_orphan: true,
      role: "inventory_only",
      ...prevProbe,
    }
    if (!orphan_media.some((x) => x.media_key === oitem.media_key)) {
      orphan_media.push(oitem)
    }
  }

  function countImgPreview(ms: OxfordReviewMediaItem[]) {
    let withImg = 0
    let without = 0
    for (const m of ms) {
      if (previewCanUseImgTag(m)) withImg += 1
      else without += 1
    }
    return { withImg, without }
  }
  let skuTotal = 0
  let skuWith = 0
  let skuWithout = 0
  for (const r of sku_rows) {
    const c = countImgPreview(r.media_items)
    skuTotal += r.media_items.length
    skuWith += c.withImg
    skuWithout += c.without
  }
  const oc = countImgPreview(orphan_media)

  const aggregate: OxfordReviewAggregate = {
    total_sku_rows: sku_rows.length,
    products_in_local_medusa: sku_rows.filter((r) => r.product_in_local_medusa_db).length,
    product_missing_rows: sku_rows.filter((r) => !r.product_in_local_medusa_db).length,
    total_inventory_records: inventoryRecords.length,
    media_confirmed,
    media_probable,
    media_ambiguous,
    media_unassigned,
    sku_rows_with_gallery_backlog,
    orphan_media_count: orphan_media.length,
    review_total_media_items: skuTotal + orphan_media.length,
    review_media_with_img_preview: skuWith + oc.withImg,
    review_media_without_img_preview: skuWithout + oc.without,
    orphan_with_img_preview: oc.withImg,
    orphan_without_img_preview: oc.without,
  }

  return {
    static_base_url: staticBase,
    sku_rows,
    orphan_media,
    aggregate,
    load_errors: loadErrors,
  }
}
