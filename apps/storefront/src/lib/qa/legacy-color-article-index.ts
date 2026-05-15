/**
 * Dev/QA only: read-only legacy color article index from cached PDP HTML.
 * Never treats product SKU / handle / filename token as color article.
 */

import * as crypto from "crypto"
import * as fs from "fs"
import * as path from "path"
import {
  collectAllSwatchesFromHtml,
  enrichFromFetchedHtml,
  normSku,
  parseLegacySwatchLabelText,
  type LegacyArticleSourceMethod,
  type LegacyColorEnrichmentResult,
  type LegacySwatchChecked,
  type LegacyUrlCandidate,
} from "@/lib/qa/legacy-color-article-enrichment"
import type {
  ArticleScanProgress,
  IndexedArticleCandidate,
  IndexedArticleMatch,
  IndexedArticleMatchStatus,
  IndexedSwatchRecord,
  LegacyPageKind,
  LegacyPageRegistryEntry,
} from "@/lib/qa/legacy-color-article-index-types"

export type {
  ArticleScanProgress,
  IndexedArticleCandidate,
  IndexedArticleMatch,
  IndexedArticleMatchStatus,
  IndexedSwatchRecord,
  LegacyPageKind,
  LegacyPageRegistryEntry,
} from "@/lib/qa/legacy-color-article-index-types"

export type LegacyPdpIndexEntry = {
  page: LegacyPageRegistryEntry
  swatches: IndexedSwatchRecord[]
}

export type LegacyColorArticleIndexStats = {
  registry_pages: number
  cache_files: number
  pdp_with_swatches: number
  listing_only: number
  unknown: number
  unreachable: number
  total_swatches: number
  total_articles: number
}

const LEGACY_MAX_HTML_BYTES = 1_500_000

export function legacyCacheHtmlPath(repoRoot: string, url: string): string {
  const hash = crypto.createHash("md5").update(url).digest("hex")
  return path.join(repoRoot, "data", "raw", "legacy", "cache", `${hash}.html`)
}

export function readCachedLegacyHtml(repoRoot: string, url: string): string | null {
  const cachePath = legacyCacheHtmlPath(repoRoot, url)
  try {
    if (!fs.existsSync(cachePath)) return null
    const buf = fs.readFileSync(cachePath)
    if (buf.byteLength > LEGACY_MAX_HTML_BYTES) return null
    return buf.toString("utf8")
  } catch {
    return null
  }
}

function normUrl(url: string): string {
  return url.split("#")[0].trim().toLowerCase()
}

function readJsonArray(repoRoot: string, rel: string): unknown[] {
  const abs = path.join(repoRoot, rel)
  if (!fs.existsSync(abs)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as unknown
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

/** Classify cached/live HTML — listing sidebar filters are not PDP swatch sources. */
export function classifyLegacyPageKind(
  html: string | null,
  scrapeStatus: string | null = null
): LegacyPageKind {
  if (!html) return "unreachable"
  const scrape = (scrapeStatus || "").toLowerCase()
  if (scrape === "listing_only") return "listing_only"

  const hasFilters = /ty-product-filters|color-filter|cm-product-filters|sidebar-filter/i.test(html)
  const swatchTitles = html.match(
    /<a\b[^>]*class="[^"]*ty-product-options__image--wrapper[^"]*"[^>]*title\s*=\s*("([^"]*)"|'([^']*)')/gi
  )
  let parseableSwatches = 0
  if (swatchTitles) {
    for (const m of swatchTitles) {
      const title = (m.match(/title\s*=\s*("([^"]*)"|'([^']*)')/i)?.[2] ??
        m.match(/title\s*=\s*("([^"]*)"|'([^']*)')/i)?.[3] ??
        "") as string
      if (parseLegacySwatchLabelText(title, "PRODUCT-SKU-HINT-PLACEHOLDER", "", "")) parseableSwatches += 1
    }
  }

  if (parseableSwatches >= 1) return "pdp_with_swatches"
  if (hasFilters && parseableSwatches === 0) return "listing_only"
  if (/ty-product-option-child|product-options__image/i.test(html) && parseableSwatches === 0) return "unknown"
  if (hasFilters) return "listing_only"
  return "unknown"
}

function pushRegistry(
  map: Map<string, LegacyPageRegistryEntry>,
  url: string,
  patch: Partial<LegacyPageRegistryEntry> & { source: string }
): void {
  const u = String(url || "").trim()
  if (!u.startsWith("http")) return
  const key = normUrl(u)
  const prev = map.get(key)
  const cachePath = patch.cache_path ?? (prev?.cache_path ?? null)
  map.set(key, {
    legacy_url: u,
    cache_path: cachePath,
    medusa_handle: patch.medusa_handle ?? prev?.medusa_handle ?? null,
    medusa_sku: patch.medusa_sku ?? prev?.medusa_sku ?? null,
    collection: patch.collection ?? prev?.collection ?? null,
    product_title: patch.product_title ?? prev?.product_title ?? null,
    page_kind: patch.page_kind ?? prev?.page_kind ?? "unknown",
    scrape_status: patch.scrape_status ?? prev?.scrape_status ?? null,
    sources: Array.from(new Set([...(prev?.sources ?? []), patch.source])),
  })
}

/** Collect legacy page URLs from normalized/raw artifacts (read-only). */
export function buildLegacyPageRegistry(repoRoot: string): LegacyPageRegistryEntry[] {
  const map = new Map<string, LegacyPageRegistryEntry>()

  for (const rel of [
    "data/raw/legacy/legacy-products.json",
    "data/raw/legacy/greenwich-products.json",
  ]) {
    for (const row of readJsonArray(repoRoot, rel)) {
      if (!row || typeof row !== "object") continue
      const o = row as Record<string, unknown>
      const pageUrl = String(o.page_url ?? "").trim()
      if (!pageUrl.startsWith("http")) continue
      const sku = String(o.product_code_from_image ?? o.product_code_raw ?? "").trim() || null
      const cachePath = legacyCacheHtmlPath(repoRoot, pageUrl)
      const hasCache = fs.existsSync(cachePath)
      pushRegistry(map, pageUrl, {
        source: rel,
        medusa_sku: sku,
        collection: String(o.collection_hint ?? "").trim() || null,
        product_title: String(o.product_title_raw ?? "").trim() || null,
        scrape_status: String(o.scrape_status ?? "").trim() || null,
        cache_path: hasCache ? cachePath : null,
        page_kind: hasCache
          ? classifyLegacyPageKind(readCachedLegacyHtml(repoRoot, pageUrl), String(o.scrape_status ?? ""))
          : "unreachable",
      })
    }
  }

  for (const row of readJsonArray(repoRoot, "data/normalized/image-map.after-front.json")) {
    if (!row || typeof row !== "object") continue
    const o = row as Record<string, unknown>
    const pageUrl = String(o.legacy_page_url ?? "").trim()
    if (!pageUrl.startsWith("http")) continue
    const sku = String(o.product_code_normalized ?? "").trim() || null
    const handle = String(o.medusa_product_handle ?? "").trim() || null
    const cachePath = legacyCacheHtmlPath(repoRoot, pageUrl)
    const hasCache = fs.existsSync(cachePath)
    pushRegistry(map, pageUrl, {
      source: "image-map.after-front.json",
      medusa_sku: sku,
      medusa_handle: handle || null,
      collection: String(o.collection_name_normalized ?? "").trim() || null,
      product_title: String(o.legacy_title_matched ?? o.canonical_name ?? "").trim() || null,
      cache_path: hasCache ? cachePath : null,
      page_kind: hasCache ? classifyLegacyPageKind(readCachedLegacyHtml(repoRoot, pageUrl)) : "unreachable",
    })
  }

  for (const row of readJsonArray(repoRoot, "data/normalized/legacy-media-inventory.json")) {
    if (!row || typeof row !== "object") continue
    const items = (row as { items?: unknown[] }).items
    if (!Array.isArray(items)) continue
    for (const it of items) {
      if (!it || typeof it !== "object") continue
      const o = it as Record<string, unknown>
      for (const u of [o.legacy_product_url, o.page_url, o.url]) {
        const pageUrl = String(u ?? "").trim()
        if (!pageUrl.startsWith("http") || /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(pageUrl)) continue
        const cachePath = legacyCacheHtmlPath(repoRoot, pageUrl)
        const hasCache = fs.existsSync(cachePath)
        pushRegistry(map, pageUrl, {
          source: "legacy-media-inventory.json",
          medusa_sku: String(o.sku_hint ?? "").trim() || null,
          medusa_handle: String(o.handle_hint ?? "").trim() || null,
          collection: String(o.collection_hint ?? "").trim() || null,
          cache_path: hasCache ? cachePath : null,
          page_kind: hasCache ? classifyLegacyPageKind(readCachedLegacyHtml(repoRoot, pageUrl)) : "unreachable",
        })
      }
    }
  }

  const cacheDir = path.join(repoRoot, "data", "raw", "legacy", "cache")
  if (fs.existsSync(cacheDir)) {
    for (const name of fs.readdirSync(cacheDir)) {
      if (!name.endsWith(".html")) continue
      const cachePath = path.join(cacheDir, name)
      const keyFromFile = name.replace(/\.html$/, "")
      for (const entry of Array.from(map.values())) {
        if (entry.cache_path && path.basename(entry.cache_path).replace(/\.html$/, "") === keyFromFile) {
          entry.cache_path = cachePath
          if (entry.page_kind === "unreachable") {
            const html = readCachedLegacyHtml(repoRoot, entry.legacy_url)
            entry.page_kind = classifyLegacyPageKind(html, entry.scrape_status)
          }
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.legacy_url.localeCompare(b.legacy_url))
}

export function buildLegacyColorArticleIndex(repoRoot: string): Map<string, LegacyPdpIndexEntry> {
  const registry = buildLegacyPageRegistry(repoRoot)
  const index = new Map<string, LegacyPdpIndexEntry>()
  for (const page of registry) {
    if (page.page_kind !== "pdp_with_swatches") continue
    const html = readCachedLegacyHtml(repoRoot, page.legacy_url)
    if (!html) continue
    const swatches = extractIndexedSwatches(html, page.medusa_sku || "INDEX-SKU", "", "")
    index.set(normUrl(page.legacy_url), { page, swatches })
  }
  return index
}

export function indexStats(registry: LegacyPageRegistryEntry[], index: Map<string, LegacyPdpIndexEntry>): LegacyColorArticleIndexStats {
  let totalSwatches = 0
  let totalArticles = 0
  for (const e of Array.from(index.values())) {
    totalSwatches += e.swatches.length
    totalArticles += e.swatches.filter((s) => s.color_article).length
  }
  return {
    registry_pages: registry.length,
    cache_files: registry.filter((p) => p.cache_path).length,
    pdp_with_swatches: registry.filter((p) => p.page_kind === "pdp_with_swatches").length,
    listing_only: registry.filter((p) => p.page_kind === "listing_only").length,
    unknown: registry.filter((p) => p.page_kind === "unknown").length,
    unreachable: registry.filter((p) => p.page_kind === "unreachable").length,
    total_swatches: totalSwatches,
    total_articles: totalArticles,
  }
}

function extractIndexedSwatches(
  html: string,
  productSkuHint: string,
  filenameToken: string,
  candidateMapSku: string
): IndexedSwatchRecord[] {
  const raw = collectAllSwatchesFromHtml(html, "", productSkuHint, filenameToken, candidateMapSku)
  return raw
    .filter((s) => s.article)
    .map((s) => ({
      selector_hint: s.selector_hint,
      color_name: s.color_name,
      color_article: s.article,
      source_method: s.source_method === "unavailable" ? ("hover-title" as const) : s.source_method,
      raw_snippet: s.raw_snippet,
      confidence: s.source_method === "hover-title" || s.source_method === "nearby-text" ? "high" : "medium",
    }))
}

export type ResolvePdpParams = {
  product_handle: string
  product_sku_hint: string
  candidate_urls?: LegacyUrlCandidate[]
}

/** Resolve exact legacy PDP for a product — never by color token alone. */
export function resolveLegacyPdpForProduct(
  repoRoot: string,
  registry: LegacyPageRegistryEntry[],
  params: ResolvePdpParams
): LegacyPageRegistryEntry | null {
  const handleNorm = params.product_handle.toLowerCase().replace(/_/g, "-")
  const skuNorm = normSku(params.product_sku_hint)
  const urlCandidates = params.candidate_urls ?? []

  const scoreEntry = (e: LegacyPageRegistryEntry, reason: string): { e: LegacyPageRegistryEntry; score: number; reason: string } => {
    let score = 0
    if (e.medusa_sku && normSku(e.medusa_sku) === skuNorm) score += 100
    if (e.medusa_handle && e.medusa_handle.toLowerCase().replace(/_/g, "-") === handleNorm) score += 80
    if (e.page_kind === "pdp_with_swatches") score += 40
    if (e.cache_path) score += 20
    if (e.page_kind === "listing_only") score -= 50
    return { e, score, reason }
  }

  const hits: Array<{ e: LegacyPageRegistryEntry; score: number; reason: string }> = []

  for (const c of urlCandidates) {
    const key = normUrl(c.url)
    const reg = registry.find((r) => normUrl(r.legacy_url) === key)
    if (reg) hits.push(scoreEntry(reg, `candidate_url:${c.source}`))
  }

  for (const e of registry) {
    if (e.medusa_sku && normSku(e.medusa_sku) === skuNorm) hits.push(scoreEntry(e, "registry_sku"))
    if (e.medusa_handle && e.medusa_handle.toLowerCase().replace(/_/g, "-") === handleNorm) {
      hits.push(scoreEntry(e, "registry_handle"))
    }
    if (skuNorm && e.legacy_url.toLowerCase().includes(skuNorm.replace(/-/g, ""))) {
      hits.push(scoreEntry(e, "url_contains_sku_token"))
    }
  }

  hits.sort((a, b) => b.score - a.score)
  const best = hits[0]
  if (!best || best.score < 20) return null
  const skuMatch = best.e.medusa_sku && normSku(best.e.medusa_sku) === skuNorm
  const handleMatch = best.e.medusa_handle && best.e.medusa_handle.toLowerCase().replace(/_/g, "-") === handleNorm
  const urlMatch = urlCandidates.some((c) => normUrl(c.url) === normUrl(best.e.legacy_url))
  if (!skuMatch && !handleMatch && !urlMatch) return null
  return best.e
}

export type MatchIndexedArticleParams = {
  product_handle: string
  product_sku_hint: string
  color_token: string
  filename_color_token?: string | null
  candidate_map_sku?: string | null
  candidate_urls?: LegacyUrlCandidate[]
}

export function matchIndexedColorArticle(
  repoRoot: string,
  params: MatchIndexedArticleParams
): IndexedArticleMatch {
  const registry = buildLegacyPageRegistry(repoRoot)
  const pdp = resolveLegacyPdpForProduct(repoRoot, registry, {
    product_handle: params.product_handle,
    product_sku_hint: params.product_sku_hint,
    candidate_urls: params.candidate_urls,
  })

  if (!pdp) {
    return {
      status: "no_pdp_match",
      legacy_color_article: null,
      legacy_color_name: null,
      legacy_article_source_method: null,
      raw_evidence_snippet: null,
      confidence: "low",
      matched_pdp: null,
      matched_swatch: null,
      article_candidates: [],
      rejected_candidates: [],
      reasons: ["no_legacy_pdp_resolved_for_product_identity"],
    }
  }

  if (pdp.page_kind === "listing_only") {
    return {
      status: "listing_only",
      legacy_color_article: null,
      legacy_color_name: null,
      legacy_article_source_method: null,
      raw_evidence_snippet: null,
      confidence: "low",
      matched_pdp: pdp,
      matched_swatch: null,
      article_candidates: [],
      rejected_candidates: [],
      reasons: ["matched_page_classified_listing_only", "sidebar_filters_not_swatch_source"],
    }
  }

  const html = readCachedLegacyHtml(repoRoot, pdp.legacy_url)
  if (!html) {
    return {
      status: "pdp_cache_missing",
      legacy_color_article: null,
      legacy_color_name: null,
      legacy_article_source_method: null,
      raw_evidence_snippet: null,
      confidence: "low",
      matched_pdp: pdp,
      matched_swatch: null,
      article_candidates: [],
      rejected_candidates: [],
      reasons: ["legacy_pdp_resolved_but_repo_cache_missing"],
    }
  }

  const fn = params.filename_color_token || params.color_token
  const cm = params.candidate_map_sku || params.product_sku_hint
  const swatches = collectAllSwatchesFromHtml(html, params.color_token, params.product_sku_hint, fn, cm)
  let matching = swatches.filter((s) => s.color_token_match && s.article)
  const dedupeMatch = new Set<string>()
  matching = matching.filter((s) => {
    const key = `${s.article}::${s.color_name || ""}`
    if (dedupeMatch.has(key)) return false
    dedupeMatch.add(key)
    return true
  })
  const nonMatching = swatches.filter((s) => s.article && !s.color_token_match)

  if (matching.length > 1) {
    const token = params.color_token.toLowerCase()
    const graphitePrefer = matching.filter((s) => /графит|graphite/i.test(s.hover_text || s.raw_snippet))
    if (token === "grey" && graphitePrefer.length === 1) matching = graphitePrefer
    const exactName = matching.filter((s) => {
      const name = (s.color_name || "").toLowerCase()
      return name && (name === token || name.includes(token))
    })
    if (exactName.length === 1) matching = exactName
  }

  const toCandidate = (s: LegacySwatchChecked): IndexedArticleCandidate => ({
    article: s.article!,
    color_name: s.color_name,
    source_method: (s.source_method === "unavailable" ? "hover-title" : s.source_method) as LegacyArticleSourceMethod,
    raw_snippet: s.raw_snippet,
    swatch: s,
    color_token_match: s.color_token_match,
  })

  if (matching.length === 1) {
    const s = matching[0]
    return {
      status: "found",
      legacy_color_article: s.article,
      legacy_color_name: s.color_name,
      legacy_article_source_method: (s.source_method === "unavailable" ? "hover-title" : s.source_method) as LegacyArticleSourceMethod,
      raw_evidence_snippet: s.raw_snippet,
      confidence: "high",
      matched_pdp: pdp,
      matched_swatch: s,
      article_candidates: matching.map(toCandidate),
      rejected_candidates: nonMatching.map(toCandidate),
      reasons: [`indexed_pdp_match:${pdp.legacy_url}`, `swatch_${s.source_method}`],
    }
  }

  if (matching.length > 1) {
    return {
      status: "multiple_candidates",
      legacy_color_article: null,
      legacy_color_name: null,
      legacy_article_source_method: null,
      raw_evidence_snippet: matching[0]?.raw_snippet ?? null,
      confidence: "low",
      matched_pdp: pdp,
      matched_swatch: null,
      article_candidates: matching.map(toCandidate),
      rejected_candidates: nonMatching.map(toCandidate),
      reasons: [`multiple_color_token_matches:${matching.length}`, "needs_article_review"],
    }
  }

  return {
    status: "not_found_on_pdp",
    legacy_color_article: null,
    legacy_color_name: null,
    legacy_article_source_method: null,
    raw_evidence_snippet: swatches[0]?.raw_snippet ?? null,
    confidence: "low",
    matched_pdp: pdp,
    matched_swatch: null,
    article_candidates: [],
    rejected_candidates: swatches.filter((s) => s.article).map(toCandidate),
    reasons: ["pdp_cache_scanned_no_color_token_article_match"],
  }
}

export function indexedStatusUiLabel(status: IndexedArticleMatchStatus, article: string | null, method: string | null): string {
  if (status === "found" && article) return `${article}${method ? ` · ${method}` : ""}`
  if (status === "not_found_on_pdp") return "not found on matched PDP"
  if (status === "pdp_cache_missing") return "PDP cache missing"
  if (status === "multiple_candidates") return "multiple candidates"
  if (status === "listing_only") return "listing only (no PDP swatches)"
  if (status === "no_pdp_match") return "no PDP match"
  if (status === "needs_review") return "needs article review"
  return status
}

/** Merge index match into enrichment result (index wins when found on cached PDP). */
export function applyIndexedMatchToEnrichment(
  base: LegacyColorEnrichmentResult,
  indexed: IndexedArticleMatch
): LegacyColorEnrichmentResult & {
  indexed_article_status: IndexedArticleMatchStatus
  indexed_pdp_url: string | null
  indexed_cache_path: string | null
  indexed_article_ui: string
  article_candidates: IndexedArticleCandidate[]
  rejected_article_candidates: IndexedArticleCandidate[]
} {
  const indexed_pdp_url = indexed.matched_pdp?.legacy_url ?? null
  const indexed_cache_path = indexed.matched_pdp?.cache_path ?? null
  const indexed_article_ui = indexedStatusUiLabel(
    indexed.status,
    indexed.legacy_color_article,
    indexed.legacy_article_source_method
  )

  if (indexed.status === "found" && indexed.legacy_color_article && indexed.legacy_article_source_method) {
    return {
      ...base,
      legacy_color_article: indexed.legacy_color_article,
      legacy_color_name: indexed.legacy_color_name,
      legacy_color_article_status: "found",
      legacy_article_source_method: indexed.legacy_article_source_method,
      legacy_article_source_url: indexed_pdp_url,
      source_url: indexed_pdp_url,
      source_method: indexed.legacy_article_source_method,
      raw_evidence_snippet: indexed.raw_evidence_snippet,
      swatches_checked: indexed.matched_swatch
        ? [indexed.matched_swatch, ...base.swatches_checked.filter((s) => s !== indexed.matched_swatch)]
        : base.swatches_checked,
      confidence: indexed.confidence,
      reasons: [...indexed.reasons, ...base.reasons.filter((r) => !r.startsWith("indexed_"))],
      fetch_status: "ok",
      hover_status: "not_needed",
      indexed_article_status: indexed.status,
      indexed_pdp_url,
      indexed_cache_path,
      indexed_article_ui,
      article_candidates: indexed.article_candidates,
      rejected_article_candidates: indexed.rejected_candidates,
    }
  }

  const articleStatus =
    indexed.status === "multiple_candidates"
      ? "not_found"
      : indexed.status === "listing_only" || indexed.status === "pdp_cache_missing" || indexed.status === "no_pdp_match"
        ? "not_found"
        : base.legacy_color_article_status

  return {
    ...base,
    legacy_color_article:
      indexed.status === "found"
        ? indexed.legacy_color_article
        : indexed.status === "multiple_candidates"
          ? null
          : base.legacy_color_article,
    legacy_color_name:
      indexed.status === "found"
        ? indexed.legacy_color_name
        : indexed.status === "multiple_candidates"
          ? null
          : base.legacy_color_name,
    legacy_color_article_status: articleStatus,
    reasons: [...indexed.reasons, ...base.reasons],
    indexed_article_status: indexed.status,
    indexed_pdp_url,
    indexed_cache_path,
    indexed_article_ui,
    article_candidates: indexed.article_candidates,
    rejected_article_candidates: indexed.rejected_candidates,
  }
}

export type ScanSuggestionInput = {
  product_handle: string
  product_sku_hint: string
  variant_key: string
  color_token: string
  filename_color_token?: string
  candidate_map_sku?: string | null
  candidate_urls?: LegacyUrlCandidate[]
}

export type ScanSuggestionResult = {
  key: string
  match: IndexedArticleMatch
  enrichment: ReturnType<typeof applyIndexedMatchToEnrichment>
}

export function scanIndexedArticlesForSuggestions(
  repoRoot: string,
  suggestions: ScanSuggestionInput[]
): { results: ScanSuggestionResult[]; progress: ArticleScanProgress } {
  const started = new Date().toISOString()
  const results: ScanSuggestionResult[] = []
  let swatchesFound = 0
  let articlesMatched = 0
  let needsReview = 0
  let missingCache = 0
  let listingSkipped = 0
  const pdpScanned = new Set<string>()

  for (const s of suggestions) {
    const match = matchIndexedColorArticle(repoRoot, {
      product_handle: s.product_handle,
      product_sku_hint: s.product_sku_hint,
      color_token: s.color_token,
      filename_color_token: s.filename_color_token,
      candidate_map_sku: s.candidate_map_sku,
      candidate_urls: s.candidate_urls,
    })
    if (match.matched_pdp?.legacy_url) pdpScanned.add(match.matched_pdp.legacy_url)
    if (match.status === "listing_only") listingSkipped += 1
    if (match.status === "pdp_cache_missing") missingCache += 1
    if (match.status === "multiple_candidates") needsReview += 1
    if (match.article_candidates.length) swatchesFound += match.article_candidates.length
    if (match.status === "found") articlesMatched += 1

    const base = enrichFromFetchedHtml({
      html: match.matched_pdp ? readCachedLegacyHtml(repoRoot, match.matched_pdp.legacy_url) || "" : "",
      colorToken: s.color_token,
      productSkuHint: s.product_sku_hint,
      filenameToken: s.filename_color_token || s.color_token,
      candidateMapSku: s.candidate_map_sku || s.product_sku_hint,
      sourceUrl: match.matched_pdp?.legacy_url || "",
      urlsChecked: [],
      triedUrls: (s.candidate_urls ?? []).map((c) => c.url),
    }).result

    const enrichment = applyIndexedMatchToEnrichment(base, match)
    const key = `${s.product_handle.toLowerCase()}::${s.variant_key}`
    results.push({ key, match, enrichment })
  }

  return {
    results,
    progress: {
      started_at: started,
      finished_at: new Date().toISOString(),
      pdp_pages_scanned: pdpScanned.size,
      swatches_found: swatchesFound,
      articles_matched: articlesMatched,
      suggestions_enriched: results.length,
      needs_review: needsReview,
      missing_pdp_cache: missingCache,
      listing_only_skipped: listingSkipped,
    },
  }
}
