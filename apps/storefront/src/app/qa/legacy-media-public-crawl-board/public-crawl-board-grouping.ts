/**
 * Pure grouping/dedup functions for the public-crawl board — no React, no I/O.
 *
 * Grouping contract (see plan:
 * woodright-legacy-private-export/2026-07-07/reports/legacy-media-assignment-board-public-crawl-plan.md):
 *   1. group by (legacy_site, product_url)               -> ProductGroup
 *   2. inside a product, dedup images by (product_url, image_url) -> ImageGroup
 *   3. preserve duplicate/category hints in collapsed metadata — never drop raw rows silently
 */
import type { CandidateRow, ImageGroup, ProductGroup, ProductSummaryRow } from "./public-crawl-board-types"

function productKey(row: Pick<CandidateRow, "legacy_site" | "product_url">): string {
  return `${row.legacy_site}\u0000${row.product_url}`
}

function imageKey(row: Pick<CandidateRow, "product_url" | "image_url">): string {
  return `${row.product_url}\u0000${row.image_url}`
}

function toNumberOrNull(value: string): number | null {
  const n = Number(value)
  return Number.isFinite(n) && value.trim() !== "" ? n : null
}

export function groupCandidateRows(
  rows: CandidateRow[],
  summaryByProductUrl: Map<string, ProductSummaryRow>
): ProductGroup[] {
  const productMap = new Map<string, { meta: CandidateRow; rows: CandidateRow[] }>()

  for (const row of rows) {
    const pKey = productKey(row)
    const existing = productMap.get(pKey)
    if (existing) {
      existing.rows.push(row)
    } else {
      productMap.set(pKey, { meta: row, rows: [row] })
    }
  }

  const groups: ProductGroup[] = []

  for (const [pKey, { meta, rows: productRows }] of productMap) {
    const imageMap = new Map<string, CandidateRow[]>()
    const noImageRows: CandidateRow[] = []

    for (const row of productRows) {
      const hasImage = row.local_image_path.trim().length > 0 || row.image_url.trim().length > 0
      if (!hasImage) {
        noImageRows.push(row)
        continue
      }
      const iKey = imageKey(row)
      const bucket = imageMap.get(iKey)
      if (bucket) bucket.push(row)
      else imageMap.set(iKey, [row])
    }

    const images: ImageGroup[] = [...imageMap.entries()].map(([iKey, group]) => {
      const first = group[0]
      const categoryHints = [...new Set(group.map((r) => r.category_hint).filter((v) => v.trim().length > 0))]
      return {
        key: iKey,
        image_url: first.image_url,
        local_image_path: first.local_image_path,
        alt_text: first.alt_text,
        title_text: first.title_text,
        is_main_guess: first.is_main_guess,
        gallery_order: first.gallery_order,
        evidence: first.evidence,
        confidence: first.confidence,
        needs_operator_review: first.needs_operator_review,
        candidate_role_guess: first.candidate_role_guess,
        candidate_reason: first.candidate_reason,
        is_suspicious: group.some((r) => r.is_suspicious),
        suspicious_reason: group.find((r) => r.suspicious_reason)?.suspicious_reason ?? null,
        duplicate_row_count: group.length,
        category_hints: categoryHints,
      }
    })

    images.sort((a, b) => {
      const orderA = toNumberOrNull(a.gallery_order) ?? Number.MAX_SAFE_INTEGER
      const orderB = toNumberOrNull(b.gallery_order) ?? Number.MAX_SAFE_INTEGER
      return orderA - orderB
    })

    const roleCounts: Record<string, number> = {}
    for (const img of images) {
      roleCounts[img.candidate_role_guess] = (roleCounts[img.candidate_role_guess] ?? 0) + 1
    }
    for (const row of noImageRows) {
      roleCounts[row.candidate_role_guess] = (roleCounts[row.candidate_role_guess] ?? 0) + 1
    }

    const confidences = productRows.map((r) => toNumberOrNull(r.confidence)).filter((n): n is number => n !== null)
    const maxConfidence = confidences.length ? Math.max(...confidences) : null

    const summary = summaryByProductUrl.get(meta.product_url) ?? null

    groups.push({
      key: pKey,
      legacy_site: meta.legacy_site,
      product_url: meta.product_url,
      product_name: meta.product_name,
      category_hint: meta.category_hint,
      article_hint: meta.article_hint,
      images,
      raw_row_count: productRows.length,
      unique_image_count: images.length,
      role_counts: roleCounts,
      max_confidence: maxConfidence,
      has_no_image_found: noImageRows.length > 0 || roleCounts["no_image_found"] > 0,
      has_duplicates: images.some((img) => img.duplicate_row_count > 1),
      has_suspicious: images.some((img) => img.is_suspicious),
      needs_operator_review: productRows.every((r) => r.needs_operator_review.toLowerCase() === "true"),
      summary_row: summary,
    })
  }

  groups.sort((a, b) => {
    if (a.legacy_site !== b.legacy_site) return a.legacy_site.localeCompare(b.legacy_site)
    return a.product_name.localeCompare(b.product_name, "ru")
  })

  return groups
}

export function buildSummaryIndex(summaryRows: ProductSummaryRow[]): Map<string, ProductSummaryRow> {
  return new Map(summaryRows.map((row) => [row.product_url, row]))
}
