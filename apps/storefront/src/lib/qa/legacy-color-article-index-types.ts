import type { LegacyArticleSourceMethod, LegacySwatchChecked } from "@/lib/qa/legacy-color-article-enrichment"

export type LegacyPageKind = "pdp_with_swatches" | "listing_only" | "unknown" | "unreachable"

export type LegacyPageRegistryEntry = {
  legacy_url: string
  cache_path: string | null
  medusa_handle: string | null
  medusa_sku: string | null
  collection: string | null
  product_title: string | null
  page_kind: LegacyPageKind
  scrape_status: string | null
  sources: string[]
}

export type IndexedSwatchRecord = {
  selector_hint: string
  color_name: string | null
  color_article: string | null
  source_method: LegacyArticleSourceMethod | "unavailable"
  raw_snippet: string
  confidence: "high" | "medium" | "low"
}

export type IndexedArticleCandidate = {
  article: string
  color_name: string | null
  source_method: LegacyArticleSourceMethod
  raw_snippet: string
  swatch: LegacySwatchChecked
  color_token_match: boolean
}

export type IndexedArticleMatchStatus =
  | "found"
  | "not_found_on_pdp"
  | "pdp_cache_missing"
  | "multiple_candidates"
  | "listing_only"
  | "no_pdp_match"
  | "needs_review"

export type IndexedArticleMatch = {
  status: IndexedArticleMatchStatus
  legacy_color_article: string | null
  legacy_color_name: string | null
  legacy_article_source_method: LegacyArticleSourceMethod | null
  raw_evidence_snippet: string | null
  confidence: "high" | "medium" | "low"
  matched_pdp: LegacyPageRegistryEntry | null
  matched_swatch: LegacySwatchChecked | null
  article_candidates: IndexedArticleCandidate[]
  rejected_candidates: IndexedArticleCandidate[]
  reasons: string[]
}

export type ArticleScanProgress = {
  started_at: string
  finished_at: string | null
  pdp_pages_scanned: number
  swatches_found: number
  articles_matched: number
  suggestions_enriched: number
  needs_review: number
  missing_pdp_cache: number
  listing_only_skipped: number
}
