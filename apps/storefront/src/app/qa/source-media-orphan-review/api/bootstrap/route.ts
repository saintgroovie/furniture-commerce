import * as fs from "fs"
import * as path from "path"
import { NextResponse } from "next/server"
import { getFurnitureRepoDataResolution } from "../../../legacy-media-assignment-board-v2/api/_lib/furniture-repo-data-root"
import { auditFile, getAuditRepoResolution } from "../_lib/audit-repo-root"
import {
  buildEnrichmentIndexes,
  enrichOrphanRow,
} from "../_lib/source-orphan-review-enrichment"
import {
  buildSeedCodeToHandleIndex,
  resolveHandleFromSkuGuess,
} from "../../../_lib/media-source-join"
import type { BootstrapPayload, DashboardStats, ReviewRow } from "../../source-orphan-review-types"

export const dynamic = "force-dynamic"

type QueueRow = {
  source_id: string
  source_kind: string
  basename: string
  source_url?: string | null
  legacy_cache_provenance?: string | null
  legacy_newly_included?: boolean | null
  sku_guess?: string | null
  classification_status: string
  priority_score: number
  priority_tier: string
  priority_reasons?: string[]
}

type ManifestRow = {
  source_id: string
  source_kind: string
  basename: string
  source_url?: string | null
  source_path?: string | null
  source_page_url?: string | null
  local_cache_path?: string | null
  legacy_cache_provenance?: string | null
  legacy_newly_included_vs_stale_468_crawl?: boolean | null
  sku_guess?: string | null
  handle_guess?: string | null
  collection_guess?: string | null
  role_guess?: string | null
  color_guess?: string | null
  classification_status: string
  classification_reason?: string | null
  suggested_next_action?: string | null
}

function whyNotSafe(row: ManifestRow, queue: QueueRow): string {
  const parts: string[] = []
  if (row.classification_status === "needs_manual_mapping") {
    parts.push("SKU guess present but not in legacy-media-inventory — manual mapping only.")
  } else if (row.classification_status === "unmapped_orphan") {
    parts.push("No inventory match and not in the 58 safe supplement batch.")
  }
  if (row.classification_status !== "safe_candidate_for_review") {
    parts.push("Not classified as safe_candidate_for_review (supplement flow is separate).")
  }
  if (queue.priority_reasons?.some((r) => /cross_sku|i4|i5/i.test(r))) {
    parts.push("Possible cross-SKU filename pattern — do not use as CO-02-1 substitute.")
  }
  if (row.suggested_next_action) {
    parts.push(`Audit suggested: ${row.suggested_next_action}.`)
  }
  return parts.join(" ")
}

function previewUrl(row: ManifestRow): string | null {
  if (row.source_kind === "legacy_site" && row.source_url) return row.source_url
  if (row.source_kind === "yandex_public" && row.source_url) return row.source_url
  return null
}

function crossSkuRisk(queue: QueueRow, manifest: ManifestRow): boolean {
  if (manifest.classification_status === "blocked_cross_sku") return true
  return Boolean(
    queue.priority_reasons?.some((r) => /cross_sku|possible_cross_sku/i.test(r))
  )
}

export async function GET() {
  const resolution = getAuditRepoResolution()
  if (!resolution.repoRoot || !resolution.auditDir) {
    return NextResponse.json(
      {
        error: "audit_pack_not_found",
        hint: "Run full-cache audit: tmp/source-media-completeness-audit-full-legacy-cache/",
        cwd: resolution.cwd,
        checked_paths: resolution.seedsTried,
      },
      { status: 404 }
    )
  }

  const queuePath = auditFile(resolution.repoRoot, "source-orphan-priority-queue.json")
  const manifestPath = auditFile(resolution.repoRoot, "all-source-media-manifest.json")
  const summaryPath = auditFile(resolution.repoRoot, "source-media-completeness-summary.json")
  const diffPath = auditFile(resolution.repoRoot, "full-vs-stale-legacy-diff.json")

  try {
    const queue = JSON.parse(fs.readFileSync(queuePath, "utf8")) as {
      full_queue: QueueRow[]
      by_priority_tier: Record<string, number>
      total_orphan_and_manual: number
    }
    const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8")) as Record<string, unknown>
    const diff = JSON.parse(fs.readFileSync(diffPath, "utf8")) as {
      newly_included_legacy_urls_count?: number
      safe_candidate_comparison?: { prior_supplement_safe_count?: number }
    }

    const manifestById = new Map<string, ManifestRow>()
    const manifestRaw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      items: ManifestRow[]
      generated_at?: string
    }
    for (const item of manifestRaw.items || []) {
      manifestById.set(item.source_id, item)
    }

    const dataRepoRoot = getFurnitureRepoDataResolution().repoRoot ?? resolution.repoRoot
    const enrichmentIndexes = buildEnrichmentIndexes(dataRepoRoot)
    const seedRaw = JSON.parse(
      fs.readFileSync(path.join(dataRepoRoot, "data/normalized/seed-products.json"), "utf8")
    ) as
      | Array<{ product_code_normalized?: string; medusa_product_handle?: string }>
      | { products?: Array<{ product_code_normalized?: string; medusa_product_handle?: string }> }
    const seedProducts = Array.isArray(seedRaw) ? seedRaw : seedRaw.products ?? []
    const seedCodeIndex = buildSeedCodeToHandleIndex(seedProducts)

    const items: ReviewRow[] = (queue.full_queue || []).map((q) => {
      const m = manifestById.get(q.source_id)
      const merged: ManifestRow = {
        source_id: q.source_id,
        source_kind: q.source_kind,
        basename: q.basename,
        source_url: m?.source_url ?? q.source_url ?? null,
        source_path: m?.source_path ?? null,
        source_page_url: m?.source_page_url ?? null,
        local_cache_path: m?.local_cache_path ?? null,
        legacy_cache_provenance: m?.legacy_cache_provenance ?? q.legacy_cache_provenance ?? null,
        legacy_newly_included_vs_stale_468_crawl:
          m?.legacy_newly_included_vs_stale_468_crawl ?? q.legacy_newly_included ?? null,
        sku_guess: m?.sku_guess ?? q.sku_guess ?? null,
        handle_guess: m?.handle_guess ?? null,
        collection_guess: m?.collection_guess ?? null,
        role_guess: m?.role_guess ?? null,
        color_guess: m?.color_guess ?? null,
        classification_status: m?.classification_status ?? q.classification_status,
        classification_reason: m?.classification_reason ?? null,
        suggested_next_action: m?.suggested_next_action ?? null,
      }
      const handleGuess =
        merged.handle_guess ??
        resolveHandleFromSkuGuess(merged.sku_guess, seedCodeIndex) ??
        null
      const enrichment =
        enrichmentIndexes != null
          ? enrichOrphanRow(q.basename, handleGuess, enrichmentIndexes)
          : {
              duplicate_evidence: { has_evidence: false, matches: [] },
              sku_context: {
                handle: handleGuess?.toLowerCase() ?? null,
                title: null,
                collection: merged.collection_guess ?? null,
                in_assignment_board: false,
                assignment_board_url: null,
                candidate_pool_count: 0,
                existing_media: [],
              },
              precheck_summary:
                "Normalized inventory indexes unavailable — engineering precheck required before any map decision.",
            }

      return {
        source_id: q.source_id,
        source_kind: q.source_kind,
        basename: q.basename,
        source_url: merged.source_url,
        source_path: merged.source_path,
        source_page_url: merged.source_page_url,
        local_cache_path: merged.local_cache_path ?? null,
        legacy_cache_provenance: merged.legacy_cache_provenance,
        legacy_newly_included: Boolean(merged.legacy_newly_included_vs_stale_468_crawl),
        sku_guess: merged.sku_guess,
        handle_guess: handleGuess,
        collection_guess: merged.collection_guess,
        role_guess: merged.role_guess,
        color_guess: merged.color_guess,
        classification_status: merged.classification_status,
        classification_reason: merged.classification_reason,
        priority_score: q.priority_score,
        priority_tier: q.priority_tier as ReviewRow["priority_tier"],
        priority_reasons: q.priority_reasons || [],
        cross_sku_risk: crossSkuRisk(q, merged),
        why_not_safe: whyNotSafe(merged, q),
        preview_url: previewUrl(merged),
        enrichment,
        operator_decision: "pending",
        operator_notes: "",
      }
    })

    const stats: DashboardStats = {
      total_queue_rows: queue.total_orphan_and_manual ?? items.length,
      p0_count: queue.by_priority_tier?.P0_review_first ?? 528,
      needs_manual_mapping_count:
        (summary.classification_counts as Record<string, number>)?.needs_manual_mapping ?? 330,
      newly_included_legacy_count: diff.newly_included_legacy_urls_count ?? 817,
      stable_safe_supplement_count:
        diff.safe_candidate_comparison?.prior_supplement_safe_count ?? 58,
      co02_missing_targets: [
        "CO-02-1_main",
        "CO-02-1_gallery_04",
        "CO-02-1_gallery_05",
        "co-02-1-i4",
        "co-02-1-i5",
      ],
    }

    const payload: BootstrapPayload = {
      generated_at: new Date().toISOString(),
      audit_variant: String(summary.audit_variant || "full_legacy_cache_union"),
      stats,
      items,
      _meta: {
        repo_root: resolution.repoRoot,
        audit_dir: resolution.auditDir,
        queue_path: queuePath,
        manifest_path: manifestPath,
      },
    }

    return NextResponse.json(payload)
  } catch (e) {
    return NextResponse.json(
      { error: "read_failed", message: String(e) },
      { status: 500 }
    )
  }
}
