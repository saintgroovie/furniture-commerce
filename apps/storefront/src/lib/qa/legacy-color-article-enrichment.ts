/**
 * Dev/QA only: heuristics to extract legacy color SKU/article from fetched HTML.
 * No Medusa / catalog mutation. Best-effort parsing — callers must surface honest status.
 */

export type LegacyColorArticleStatus = "found" | "not_found" | "unavailable" | "parse_failed"

export type LegacyColorEnrichmentFetchStatus =
  | "ok"
  | "no_urls"
  | "http_error"
  | "timeout"
  | "non_html"
  | "parse_exception"

export type LegacyColorEnrichmentResult = {
  product_sku_hint: string
  legacy_color_name: string | null
  legacy_color_article: string | null
  legacy_color_article_status: LegacyColorArticleStatus
  source_url: string | null
  fetch_status: LegacyColorEnrichmentFetchStatus
  confidence: "high" | "medium" | "low"
  reasons: string[]
  tried_urls: string[]
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg|avif|bmp|ico|pdf)(\?|#|$)/i

export function looksLikeDirectMediaUrl(url: string): boolean {
  const u = url.split("?")[0] || ""
  return IMAGE_EXT.test(u)
}

/** Prefer HTML product pages over direct image/binary URLs. */
export function pickHtmlCandidateUrls(urls: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of urls) {
    const u = String(raw || "").trim()
    if (!u || !/^https?:\/\//i.test(u)) continue
    if (looksLikeDirectMediaUrl(u)) continue
    const k = u.split("#")[0].toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(u)
  }
  return out
}

function normSku(s: string): string {
  return s.replace(/\s+/g, "").replace(/_/g, "-").toLowerCase()
}

function walkJsonLdForSku(node: unknown, out: Set<string>): void {
  if (node == null) return
  if (typeof node === "string") {
    const t = node.trim()
    if (/^[A-Za-z0-9][A-Za-z0-9._/-]{3,40}$/.test(t) && /[-_]/.test(t)) out.add(t)
    return
  }
  if (Array.isArray(node)) {
    for (const x of node) walkJsonLdForSku(x, out)
    return
  }
  if (typeof node === "object") {
    const o = node as Record<string, unknown>
    for (const k of ["sku", "productID", "product_id", "mpn", "gtin", "article"]) {
      const v = o[k]
      if (typeof v === "string") walkJsonLdForSku(v, out)
    }
    for (const v of Object.values(o)) walkJsonLdForSku(v, out)
  }
}

function extractNameFromJsonLd(node: unknown): string | null {
  if (!node || typeof node !== "object") return null
  const o = node as Record<string, unknown>
  const n = o.name
  if (typeof n === "string" && n.trim()) return n.trim()
  if (typeof o.title === "string" && o.title.trim()) return o.title.trim()
  return null
}

/**
 * Best-effort: find a color-specific article distinct from base product SKU.
 */
export function parseLegacyColorArticleFromHtml(
  html: string,
  colorToken: string,
  productSkuHint: string
): { article: string | null; name: string | null; confidence: "high" | "medium" | "low"; reasons: string[] } {
  const reasons: string[] = []
  const base = normSku(productSkuHint)
  const token = (colorToken || "").toLowerCase().replace(/_/g, "-")
  if (!html.trim()) {
    return { article: null, name: null, confidence: "low", reasons: ["empty_html"] }
  }

  const skuCandidates = new Set<string>()
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let lm: RegExpExecArray | null
  while ((lm = ldRe.exec(html)) !== null) {
    const chunk = lm[1]?.trim()
    if (!chunk) continue
    try {
      const parsed: unknown = JSON.parse(chunk)
      const nodes = Array.isArray(parsed) ? parsed : [parsed]
      for (const node of nodes) {
        walkJsonLdForSku(node, skuCandidates)
      }
    } catch {
      reasons.push("json_ld_parse_skip")
    }
  }
  for (const s of Array.from(skuCandidates)) {
    const n = normSku(s)
    if (!n || n === base) continue
    if (n.startsWith(base) && n.length > base.length) {
      reasons.push("json_ld_extended_sku")
      return { article: s.replace(/\s+/g, ""), name: extractNameFromJsonLd(nodesFromLd(html)[0]), confidence: "high", reasons }
    }
    if (token && (n.includes(token) || n.endsWith(`-${token}`) || n.includes(`-${token}-`))) {
      reasons.push("json_ld_token_match")
      return { article: s.replace(/\s+/g, ""), name: extractNameFromJsonLd(nodesFromLd(html)[0]), confidence: "high", reasons }
    }
  }

  const lowerHtml = html.toLowerCase()
  const tokenVariants = new Set<string>([token, token.replace(/-/g, "")].filter(Boolean))
  const idxs: number[] = []
  for (const tv of Array.from(tokenVariants)) {
    if (!tv) continue
    let pos = 0
    while (pos < lowerHtml.length) {
      const i = lowerHtml.indexOf(tv, pos)
      if (i < 0) break
      idxs.push(i)
      pos = i + Math.max(1, tv.length)
    }
  }

  const extendedRe = /\b([A-Z]{1,6}[-_/][0-9]{1,3}[-_/][A-Za-z0-9]+(?:[-_/][A-Za-z0-9]{2,})+)\b/g
  const baseRe = /\b([A-Z]{1,6}[-_/][0-9]{1,3}[-_/][0-9]{1,3})\b/g

  for (const i of idxs.slice(0, 24)) {
    const slice = html.slice(Math.max(0, i - 500), Math.min(html.length, i + 500))
    let m: RegExpExecArray | null
    extendedRe.lastIndex = 0
    while ((m = extendedRe.exec(slice)) !== null) {
      const raw = m[1].replace(/_/g, "-")
      const n = normSku(raw)
      if (n === base) continue
      if (n.startsWith(base) && n.length > base.length) {
        reasons.push("regex_window_extended_base")
        return { article: raw, name: null, confidence: "medium", reasons }
      }
      if (token && (n.includes(token) || raw.toLowerCase().includes(token))) {
        reasons.push("regex_window_token")
        return { article: raw, name: null, confidence: "medium", reasons }
      }
    }
  }

  baseRe.lastIndex = 0
  const globalExtended: string[] = []
  let bm: RegExpExecArray | null
  while ((bm = baseRe.exec(html)) !== null) {
    const tail = html.slice(bm.index + bm[0].length, bm.index + bm[0].length + 12)
    const ext = bm[0] + (tail.match(/^[-_/][A-Za-z0-9]{2,}/)?.[0] || "")
    if (normSku(ext) !== base) globalExtended.push(ext.replace(/_/g, "-"))
  }
  for (const raw of globalExtended) {
    const n = normSku(raw)
    if (n === base) continue
    if (token && n.includes(token)) {
      reasons.push("global_scan_token")
      return { article: raw, name: null, confidence: "low", reasons }
    }
  }

  return { article: null, name: null, confidence: "low", reasons: [...reasons, "no_sku_match_in_html"] }
}

function nodesFromLd(html: string): unknown[] {
  const out: unknown[] = []
  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let lm: RegExpExecArray | null
  while ((lm = ldRe.exec(html)) !== null) {
    const chunk = lm[1]?.trim()
    if (!chunk) continue
    try {
      const parsed: unknown = JSON.parse(chunk)
      if (Array.isArray(parsed)) out.push(...parsed)
      else out.push(parsed)
    } catch {
      /* skip */
    }
  }
  return out
}

export function buildEnrichmentUnavailable(
  productSkuHint: string,
  fetchStatus: LegacyColorEnrichmentFetchStatus,
  reasons: string[],
  triedUrls: string[]
): LegacyColorEnrichmentResult {
  const articleStatus: LegacyColorArticleStatus = fetchStatus === "parse_exception" ? "parse_failed" : "unavailable"
  return {
    product_sku_hint: productSkuHint,
    legacy_color_name: null,
    legacy_color_article: null,
    legacy_color_article_status: articleStatus,
    source_url: null,
    fetch_status: fetchStatus,
    confidence: "low",
    reasons,
    tried_urls: triedUrls,
  }
}

export function buildEnrichmentNotFound(
  productSkuHint: string,
  sourceUrl: string,
  triedUrls: string[],
  extraReasons: string[]
): LegacyColorEnrichmentResult {
  return {
    product_sku_hint: productSkuHint,
    legacy_color_name: null,
    legacy_color_article: null,
    legacy_color_article_status: "not_found",
    source_url: sourceUrl,
    fetch_status: "ok",
    confidence: "low",
    reasons: ["html_fetched_no_color_article", ...extraReasons],
    tried_urls: triedUrls,
  }
}

export function buildEnrichmentFound(
  productSkuHint: string,
  article: string,
  name: string | null,
  sourceUrl: string,
  triedUrls: string[],
  parseReasons: string[],
  confidence: "high" | "medium" | "low"
): LegacyColorEnrichmentResult {
  return {
    product_sku_hint: productSkuHint,
    legacy_color_name: name,
    legacy_color_article: article,
    legacy_color_article_status: "found",
    source_url: sourceUrl,
    fetch_status: "ok",
    confidence,
    reasons: parseReasons,
    tried_urls: triedUrls,
  }
}
