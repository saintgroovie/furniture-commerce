/**
 * Types for the Legacy Media Public Crawl Board — READ-ONLY preview prototype.
 *
 * Deliberately independent from `legacy-media-assignment-board-v2` types
 * (`InvItem`, `CandidateEntry`, `ProductRow`, etc.): the v2 board assumes an
 * already-resolved `medusa_product_handle` / `medusa_variant_sku`, which the
 * public-crawl candidate pack does not have. Mirrors the candidate-pack CSV
 * columns 1:1 instead.
 */

export type PublicCrawlSiteId = "woodright-kids.ru" | "woodright.ru"

export type CandidateRoleGuess =
  | "main_candidate"
  | "gallery_candidate"
  | "detail_candidate"
  | "reject_candidate"
  | "no_image_found"
  | string

/** One row from candidate-images-{kids,woodright}.csv, plus derived QA flags. */
export type CandidateRow = {
  legacy_site: PublicCrawlSiteId
  product_url: string
  product_name: string
  category_hint: string
  article_hint: string
  image_url: string
  local_image_path: string
  alt_text: string
  title_text: string
  is_main_guess: string
  gallery_order: string
  evidence: string
  confidence: string
  needs_operator_review: string
  candidate_role_guess: CandidateRoleGuess
  candidate_reason: string
  /** Derived server-side by joining reports/public-crawl-suspicious-images.csv. */
  is_suspicious: boolean
  suspicious_reason: string | null
}

/** One row from candidate-products-summary.csv (informational, not recomputed client-side). */
export type ProductSummaryRow = {
  legacy_site: PublicCrawlSiteId
  product_url: string
  product_name: string
  category_hint: string
  article_hint: string
  image_count: string
  main_candidate_count: string
  gallery_candidate_count: string
  detail_candidate_count: string
  reject_candidate_count: string
  no_image_found_count: string
  min_confidence: string
  max_confidence: string
  needs_operator_review: string
}

export type PublicCrawlBoardApiResponse = {
  generated_at: string
  export_root: string
  candidate_pack_dir: string
  rows: CandidateRow[]
  products_summary: ProductSummaryRow[]
  meta: {
    kids_rows: number
    woodright_rows: number
    suspicious_rows_loaded: number
  }
}

export type PublicCrawlBoardApiError = {
  error: string
  detail?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Client-side derived (grouped) view model — computed in
// public-crawl-board-grouping.ts, never persisted.
// ---------------------------------------------------------------------------

/** One unique (product_url, image_url) slot inside a product — raw duplicate rows collapsed. */
export type ImageGroup = {
  key: string
  image_url: string
  local_image_path: string
  alt_text: string
  title_text: string
  is_main_guess: string
  gallery_order: string
  evidence: string
  confidence: string
  needs_operator_review: string
  candidate_role_guess: CandidateRoleGuess
  candidate_reason: string
  is_suspicious: boolean
  suspicious_reason: string | null
  /** How many raw manifest rows collapsed into this single image slot. */
  duplicate_row_count: number
  /** Distinct category_hint values seen across the collapsed raw rows (woodright multi-category case). */
  category_hints: string[]
}

/** One product card — grouped by (legacy_site, product_url). */
export type ProductGroup = {
  key: string
  legacy_site: PublicCrawlSiteId
  product_url: string
  product_name: string
  category_hint: string
  article_hint: string
  images: ImageGroup[]
  /** Raw manifest row count for this product (before dedup) — do not present as "image count". */
  raw_row_count: number
  /** Count of distinct (product_url, image_url) pairs — the real image count. */
  unique_image_count: number
  role_counts: Record<string, number>
  max_confidence: number | null
  has_no_image_found: boolean
  has_duplicates: boolean
  has_suspicious: boolean
  needs_operator_review: boolean
  summary_row: ProductSummaryRow | null
}

export type SiteFilter = "all" | PublicCrawlSiteId
export type RoleFilter = "all" | "main_candidate" | "gallery_candidate" | "detail_candidate" | "no_image_found"
export type ConfidenceFilter = "all" | "low"
export type DuplicateFilter = "all" | "duplicates_only"
export type SuspiciousFilter = "all" | "suspicious_only"

export type BoardFilters = {
  site: SiteFilter
  role: RoleFilter
  confidence: ConfidenceFilter
  duplicate: DuplicateFilter
  suspicious: SuspiciousFilter
  search: string
}

export const DEFAULT_BOARD_FILTERS: BoardFilters = {
  site: "all",
  role: "all",
  confidence: "all",
  duplicate: "all",
  suspicious: "all",
  search: "",
}

/** Confidence threshold below which a row is flagged "low confidence" in the UI. */
export const LOW_CONFIDENCE_THRESHOLD = 0.5

/**
 * Guards against rendering CSV-sourced strings (`image_url`, `product_url`) as
 * `javascript:`/`data:`/etc. hrefs. Candidate pack data comes from a public
 * crawl and is not sanitized upstream — only allow http(s) links to render as
 * clickable; anything else renders as plain text.
 */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}
