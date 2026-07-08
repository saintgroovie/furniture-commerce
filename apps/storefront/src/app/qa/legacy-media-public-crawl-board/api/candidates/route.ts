import * as fs from "fs"
import { NextResponse } from "next/server"
import { parseCsv } from "../_lib/csv-parse"
import {
  candidateCsvPath,
  getExportRootResolution,
  publicCrawlBoardProdBlocked,
  suspiciousImagesCsvPath,
} from "../_lib/public-crawl-export-root"
import type { CandidateRow, ProductSummaryRow, PublicCrawlBoardApiResponse } from "../../public-crawl-board-types"

export const dynamic = "force-dynamic"

/**
 * READ-ONLY loader for the public-crawl candidate pack.
 *
 * Reads exactly 4 files from the allowlisted private export root:
 *   candidate-pack/public-crawl-v1/candidate-images-kids.csv
 *   candidate-pack/public-crawl-v1/candidate-images-woodright.csv
 *   candidate-pack/public-crawl-v1/candidate-products-summary.csv
 *   reports/public-crawl-suspicious-images.csv
 *
 * Never writes. Never touches Medusa/DB. Never imports v2 board code.
 */
export async function GET(): Promise<Response> {
  if (publicCrawlBoardProdBlocked()) {
    return new NextResponse("Not found", { status: 404 })
  }

  const resolution = getExportRootResolution()
  if (!resolution.exists) {
    return NextResponse.json(
      {
        error: "export_root_not_found",
        detail: { export_root: resolution.exportRoot, hint: "Set WOODRIGHT_PUBLIC_CRAWL_EXPORT_ROOT if the export lives elsewhere." },
      },
      { status: 500 }
    )
  }
  if (!resolution.candidatePackExists) {
    return NextResponse.json(
      {
        error: "candidate_pack_not_found",
        detail: { candidate_pack_dir: resolution.candidatePackDir },
      },
      { status: 500 }
    )
  }

  const kidsPath = candidateCsvPath(resolution.exportRoot, "kids")
  const woodrightPath = candidateCsvPath(resolution.exportRoot, "woodright")
  const summaryPath = candidateCsvPath(resolution.exportRoot, "products-summary")
  const suspiciousPath = suspiciousImagesCsvPath(resolution.exportRoot)

  let kidsRaw: string, woodrightRaw: string, summaryRaw: string
  try {
    kidsRaw = fs.readFileSync(kidsPath, "utf8")
    woodrightRaw = fs.readFileSync(woodrightPath, "utf8")
    summaryRaw = fs.readFileSync(summaryPath, "utf8")
  } catch (err) {
    return NextResponse.json(
      {
        error: "read_failed",
        detail: {
          message: err instanceof Error ? err.message : String(err),
          checked_paths: [kidsPath, woodrightPath, summaryPath],
        },
      },
      { status: 500 }
    )
  }

  // Suspicious images report is best-effort — its absence must not break the board.
  let suspiciousRaw = ""
  let suspiciousLoaded = false
  try {
    suspiciousRaw = fs.readFileSync(suspiciousPath, "utf8")
    suspiciousLoaded = true
  } catch {
    suspiciousLoaded = false
  }

  const suspiciousByPath = new Map<string, string>()
  if (suspiciousLoaded) {
    for (const row of parseCsv(suspiciousRaw)) {
      const rel = (row.local_image_path ?? "").trim()
      if (rel) suspiciousByPath.set(rel, row.reason ?? "")
    }
  }

  function toRows(raw: string): CandidateRow[] {
    return parseCsv(raw).map((r) => {
      const rel = (r.local_image_path ?? "").trim()
      const suspiciousReason = rel ? suspiciousByPath.get(rel) ?? null : null
      return {
        legacy_site: (r.legacy_site ?? "") as CandidateRow["legacy_site"],
        product_url: r.product_url ?? "",
        product_name: r.product_name ?? "",
        category_hint: r.category_hint ?? "",
        article_hint: r.article_hint ?? "",
        image_url: r.image_url ?? "",
        local_image_path: r.local_image_path ?? "",
        alt_text: r.alt_text ?? "",
        title_text: r.title_text ?? "",
        is_main_guess: r.is_main_guess ?? "",
        gallery_order: r.gallery_order ?? "",
        evidence: r.evidence ?? "",
        confidence: r.confidence ?? "",
        needs_operator_review: r.needs_operator_review ?? "",
        candidate_role_guess: r.candidate_role_guess ?? "",
        candidate_reason: r.candidate_reason ?? "",
        is_suspicious: suspiciousReason !== null,
        suspicious_reason: suspiciousReason,
      }
    })
  }

  const kidsRows = toRows(kidsRaw)
  const woodrightRows = toRows(woodrightRaw)

  const productsSummary: ProductSummaryRow[] = parseCsv(summaryRaw).map((r) => ({
    legacy_site: (r.legacy_site ?? "") as ProductSummaryRow["legacy_site"],
    product_url: r.product_url ?? "",
    product_name: r.product_name ?? "",
    category_hint: r.category_hint ?? "",
    article_hint: r.article_hint ?? "",
    image_count: r.image_count ?? "",
    main_candidate_count: r.main_candidate_count ?? "",
    gallery_candidate_count: r.gallery_candidate_count ?? "",
    detail_candidate_count: r.detail_candidate_count ?? "",
    reject_candidate_count: r.reject_candidate_count ?? "",
    no_image_found_count: r.no_image_found_count ?? "",
    min_confidence: r.min_confidence ?? "",
    max_confidence: r.max_confidence ?? "",
    needs_operator_review: r.needs_operator_review ?? "",
  }))

  const payload: PublicCrawlBoardApiResponse = {
    generated_at: new Date().toISOString(),
    export_root: resolution.exportRoot,
    candidate_pack_dir: resolution.candidatePackDir,
    rows: [...kidsRows, ...woodrightRows],
    products_summary: productsSummary,
    meta: {
      kids_rows: kidsRows.length,
      woodright_rows: woodrightRows.length,
      suspicious_rows_loaded: suspiciousLoaded ? suspiciousByPath.size : 0,
    },
  }

  return NextResponse.json(payload, {
    status: 200,
    headers: { "Cache-Control": "private, max-age=30" },
  })
}
