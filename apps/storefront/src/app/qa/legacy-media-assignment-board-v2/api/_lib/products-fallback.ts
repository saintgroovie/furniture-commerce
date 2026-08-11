import * as fs from "fs"
import * as path from "path"
import { ORPHAN_P0_OVERLAY_DATA_REL } from "./furniture-repo-data-root"

const CANDIDATE_MAP_REL = "data/normalized/legacy-media-product-candidate-map.json"

export type QaFallbackProductRow = {
  handle: string
  id: string
  sku: string
  collection: string
  title: string | null
  image_urls: string[]
  image_basenames: string[]
  qa_product_source: string
  qa_fallback: true
  do_not_auto_apply: true
}

type HandleEnrichment = {
  sku: string
  collection: string
  title: string | null
}

function inferCollectionFromHandle(handle: string): string {
  const parts = handle.split("-")
  return parts.length >= 2 ? parts[0] : ""
}

function loadCandidateMapEnrichment(repoRoot: string): Map<string, HandleEnrichment> {
  const map = new Map<string, HandleEnrichment>()
  const abs = path.join(repoRoot, CANDIDATE_MAP_REL)
  if (!fs.existsSync(abs)) return map

  try {
    const data = JSON.parse(fs.readFileSync(abs, "utf8")) as {
      entries?: Array<{
        top_candidate?: {
          medusa_product_handle?: string
          medusa_variant_sku?: string
          medusa_collection_handle?: string
        }
        candidates?: Array<{ product_title?: string }>
      }>
    }

    for (const entry of data.entries ?? []) {
      const top = entry.top_candidate
      const handle = String(top?.medusa_product_handle ?? "")
        .trim()
        .toLowerCase()
      if (!handle || map.has(handle)) continue

      const title =
        entry.candidates?.find((c) => c.product_title)?.product_title ?? null

      map.set(handle, {
        sku: String(top?.medusa_variant_sku ?? "").trim(),
        collection: String(top?.medusa_collection_handle ?? "")
          .trim()
          .toLowerCase(),
        title: title != null ? String(title) : null,
      })
    }
  } catch {
    /* read-only QA fallback — ignore parse errors */
  }

  return map
}

function collectOverlayHandles(repoRoot: string): Set<string> {
  const handles = new Set<string>()
  const abs = path.join(repoRoot, ORPHAN_P0_OVERLAY_DATA_REL)
  if (!fs.existsSync(abs)) return handles

  try {
    const overlay = JSON.parse(fs.readFileSync(abs, "utf8")) as {
      resolved_candidates?: Array<{ catalog_handle?: string | null }>
    }
    for (const candidate of overlay.resolved_candidates ?? []) {
      const handle = String(candidate.catalog_handle ?? "")
        .trim()
        .toLowerCase()
      if (handle) handles.add(handle)
    }
  } catch {
    /* ignore */
  }

  return handles
}

export type QaProductsFallbackResult = {
  products: QaFallbackProductRow[]
  catalog_source: "fallback_missing_seed_products"
  missing_file: string
  fallback_handles_source: "orphan_p0_overlay" | "candidate_map" | "none"
}

/**
 * Read-only QA catalog stubs when normalized seed/board product files are absent.
 * Does not create or mutate normalized files.
 */
export function buildQaProductsFallback(
  repoRoot: string,
  missingFile: string
): QaProductsFallbackResult {
  const enrichment = loadCandidateMapEnrichment(repoRoot)
  const handles = collectOverlayHandles(repoRoot)
  let fallbackHandlesSource: QaProductsFallbackResult["fallback_handles_source"] =
    handles.size > 0 ? "orphan_p0_overlay" : "none"

  if (handles.size === 0) {
    for (const handle of Array.from(enrichment.keys())) handles.add(handle)
    if (handles.size > 0) fallbackHandlesSource = "candidate_map"
  }

  const products: QaFallbackProductRow[] = Array.from(handles).sort().map((handle) => {
    const enrich = enrichment.get(handle)
    return {
      handle,
      id: `qa-product:${handle}`,
      sku: enrich?.sku || handle.toUpperCase(),
      collection: enrich?.collection || inferCollectionFromHandle(handle),
      title: enrich?.title ?? handle,
      image_urls: [],
      image_basenames: [],
      qa_product_source: "fallback_missing_seed_products",
      qa_fallback: true,
      do_not_auto_apply: true,
    }
  })

  return {
    products,
    catalog_source: "fallback_missing_seed_products",
    missing_file: missingFile,
    fallback_handles_source: fallbackHandlesSource,
  }
}
