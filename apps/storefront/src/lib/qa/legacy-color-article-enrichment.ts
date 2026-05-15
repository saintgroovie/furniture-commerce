/**
 * Dev/QA only: read-only legacy color article extraction from legacy product pages.
 * Never treats product SKU / handle / filename token / candidate-map SKU as color article.
 */

export type LegacyColorArticleStatus =
  | "found"
  | "not_found"
  | "legacy_fetch_unreachable"
  | "parse_failed"
  | "hover_required"

export type LegacyColorEnrichmentFetchStatus =
  | "ok"
  | "no_urls"
  | "http_error"
  | "timeout"
  | "non_html"
  | "parse_exception"
  | "legacy_unreachable"

export type LegacyArticleSourceMethod =
  | "hover-tooltip"
  | "hover-title"
  | "aria-label"
  | "data-attr"
  | "alt"
  | "nearby-text"
  | "embedded-json"
  | "unavailable"

export type LegacyUrlFetchStatus =
  | "ok"
  | "http_error"
  | "timeout"
  | "unreachable"
  | "skipped_non_html"
  | "not_attempted"

export type LegacyUrlChecked = {
  url: string
  source: string
  fetch_status: LegacyUrlFetchStatus
  http_status: number | null
  error: string | null
  reachable_from_api: boolean
}

export type LegacySwatchChecked = {
  selector_hint: string
  color_token_match: boolean
  attributes_before: Record<string, string>
  hover_text: string | null
  article: string | null
  color_name: string | null
  source_method: LegacyArticleSourceMethod | "unavailable"
  raw_snippet: string
}

export type HoverEvidenceInput = {
  selector?: string
  attributes_before?: Record<string, string>
  hover_text?: string
  title?: string
  aria_label?: string
  data_attrs?: Record<string, string>
  outer_html_snippet?: string
}

export type LegacyUrlCandidate = { url: string; source: string }

export type LegacyColorEnrichmentResult = {
  product_sku_hint: string
  filename_color_token: string | null
  candidate_map_sku: string | null
  legacy_color_name: string | null
  legacy_color_article: string | null
  legacy_article_source_method: LegacyArticleSourceMethod | null
  legacy_article_source_url: string | null
  legacy_color_article_status: LegacyColorArticleStatus
  /** @deprecated use legacy_article_source_url */
  source_url: string | null
  /** @deprecated use legacy_article_source_method */
  source_method: LegacyArticleSourceMethod | null
  fetch_status: LegacyColorEnrichmentFetchStatus
  urls_checked: LegacyUrlChecked[]
  swatches_checked: LegacySwatchChecked[]
  confidence: "high" | "medium" | "low"
  reasons: string[]
  raw_evidence_snippet: string | null
  hover_status: "not_needed" | "required" | "supplied" | "unavailable"
  tried_urls: string[]
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg|avif|bmp|ico|pdf)(\?|#|$)/i
const ARTICLE_TOKEN_RE = /\b([A-Z]{1,6}[-_/][0-9]{1,3}(?:[-_/][A-Za-z0-9]{1,12}){1,4})\b/gi
/** CS-Cart laminate / legacy color codes in swatch title (e.g. G503, S499, М442). */
const LAMINATE_ARTICLE_RE = /\b([A-Za-zА-Яа-я][0-9]{3,4})\b/

const COLOR_TOKEN_ALIASES: Record<string, string[]> = {
  blue: ["blue", "син", "голуб", "navy", "n436"],
  grey: ["grey", "gray", "сер", "графит", "graphite", "grey-blue", "grey_blue"],
  gray: ["grey", "gray", "сер", "графит", "graphite"],
  olive: ["olive", "олив", "изумруд", "green", "зелен"],
  green: ["green", "изумруд", "олив", "зелен"],
  white: ["white", "бел", "white25"],
  cream: ["cream", "крем", "беж", "капуч", "cappuccino", "capuch"],
  brown: ["brown", "какао", "cacao", "корич"],
  graphite: ["graphite", "графит", "graphite25"],
  powder: ["powder", "пудр"],
  capuchino: ["capuch", "капуч", "cappuccino"],
  cacao: ["cacao", "какао"],
}

export function looksLikeDirectMediaUrl(url: string): boolean {
  const u = url.split("?")[0] || ""
  return IMAGE_EXT.test(u)
}

export function normSku(s: string): string {
  return s.replace(/\s+/g, "").replace(/_/g, "-").toLowerCase()
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

export function dedupeUrlCandidates(candidates: LegacyUrlCandidate[]): LegacyUrlCandidate[] {
  const out: LegacyUrlCandidate[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    const u = String(c.url || "").trim()
    if (!u || !/^https?:\/\//i.test(u)) continue
    const k = u.split("#")[0].toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ url: u, source: c.source || "unknown" })
  }
  return out
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
}

function readAttributeValues(html: string, attrName: string): string[] {
  const out: string[] = []
  const re = new RegExp(`${attrName}\\s*=\\s*("([^"]*)"|'([^']*)')`, "gi")
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const v = decodeHtmlEntities((m[2] ?? m[3] ?? "").trim())
    if (v) out.push(v)
  }
  return out
}

function readDataAttributes(html: string): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = []
  const re = /data-([a-z][a-z0-9_-]*)\s*=\s*("([^"]*)"|'([^']*)')/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const name = (m[1] ?? "").toLowerCase()
    const value = decodeHtmlEntities((m[3] ?? m[4] ?? "").trim())
    if (!name || !value) continue
    out.push({ name, value })
  }
  return out
}

function normalizeLaminateArticleCode(code: string): string {
  return code
    .replace(/\u0410/g, "A")
    .replace(/\u0412/g, "B")
    .replace(/\u0413/g, "G")
    .replace(/\u0415/g, "E")
    .replace(/\u041a/g, "K")
    .replace(/\u041b/g, "L")
    .replace(/\u041c/g, "M")
    .replace(/\u041d/g, "H")
    .replace(/\u041e/g, "O")
    .replace(/\u0421/g, "C")
    .replace(/\u0422/g, "T")
    .replace(/\u0423/g, "Y")
    .replace(/\u0425/g, "X")
    .replace(/\u043d/g, "H")
    .toUpperCase()
}

function colorLabelMatchesToken(labelHay: string, colorToken: string): boolean {
  const t = (colorToken || "").toLowerCase().replace(/_/g, "-")
  if (!t) return true
  const h = labelHay.toLowerCase()
  const aliases = COLOR_TOKEN_ALIASES[t] ?? [t]
  if (aliases.some((a) => h.includes(a))) return true
  return h.includes(t) || h.includes(t.replace(/-/g, ""))
}

function tokenMatchesColor(hay: string, colorToken: string): boolean {
  return colorLabelMatchesToken(hay, colorToken)
}

function isDisallowedArticle(article: string, productSkuHint: string, filenameToken: string, candidateMapSku: string): boolean {
  const n = normSku(article)
  if (!n) return true
  if (n === normSku(productSkuHint)) return true
  if (filenameToken && n === normSku(filenameToken)) return true
  if (candidateMapSku && n === normSku(candidateMapSku)) return true
  return false
}

/** Parse CS-Cart swatch label like "Белый G503" or hover title " Графит S499 ". */
export function parseLegacySwatchLabelText(
  value: string,
  productSkuHint: string,
  filenameToken: string,
  candidateMapSku: string
): { article: string; colorName: string | null } | null {
  const raw = decodeHtmlEntities(value.trim())
  if (!raw) return null

  const laminate = raw.match(LAMINATE_ARTICLE_RE)
  if (laminate?.[1]) {
    const article = normalizeLaminateArticleCode(laminate[1])
    if (article.length >= 4 && !isDisallowedArticle(article, productSkuHint, filenameToken, candidateMapSku)) {
      const colorName = raw.replace(laminate[0], "").replace(/\s+/g, " ").trim() || null
      return { article, colorName: colorName && colorName.length > 1 ? colorName.slice(0, 80) : null }
    }
  }

  return extractArticleTokenFromText(raw, productSkuHint, filenameToken, candidateMapSku, "")
}

function extractArticleTokenFromText(
  value: string,
  productSkuHint: string,
  filenameToken: string,
  candidateMapSku: string,
  colorToken: string
): { article: string; colorName: string | null } | null {
  const base = normSku(productSkuHint)
  const raw = decodeHtmlEntities(value.trim())
  if (!raw) return null

  let m: RegExpExecArray | null
  const re = new RegExp(ARTICLE_TOKEN_RE.source, "gi")
  const hits: string[] = []
  while ((m = re.exec(raw)) !== null) {
    const tok = m[1].replace(/_/g, "-")
    if (!isDisallowedArticle(tok, productSkuHint, filenameToken, candidateMapSku)) hits.push(tok)
  }
  if (!hits.length) return null

  const extended = hits.find((h) => normSku(h).startsWith(base) && normSku(h).length > base.length)
  const tokenHit = hits.find((h) => colorToken && normSku(h).includes(colorToken.replace(/_/g, "-")))
  const article = extended || tokenHit || hits[0]
  if (isDisallowedArticle(article, productSkuHint, filenameToken, candidateMapSku)) return null

  const parts = raw.split(/[·•|/–—-]+/).map((p) => p.trim()).filter(Boolean)
  const colorName =
    parts.find((p) => !ARTICLE_TOKEN_RE.test(p) && p.length > 1 && !normSku(p).includes(normSku(article)))?.slice(0, 80) ||
    null

  return { article, colorName }
}

type AttrHit = { method: LegacyArticleSourceMethod; value: string }

function collectAttrHits(attrs: Record<string, string>): AttrHit[] {
  const out: AttrHit[] = []
  const map: Array<[LegacyArticleSourceMethod, string[]]> = [
    ["hover-title", ["title"]],
    ["aria-label", ["aria-label", "aria_label"]],
    ["alt", ["alt"]],
  ]
  for (const [method, keys] of map) {
    for (const k of keys) {
      const v = attrs[k]
      if (v) out.push({ method, value: v })
    }
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("data-") && /sku|article|product|variant|color|colour|ref|code/.test(k)) {
      out.push({ method: "data-attr", value: v })
    }
  }
  return out
}

function snippetFromAttrs(attrs: Record<string, string>, max = 220): string {
  const parts = Object.entries(attrs)
    .slice(0, 8)
    .map(([k, v]) => `${k}="${v.slice(0, 80)}"`)
  return parts.join(" ").slice(0, max)
}

/**
 * CS-Cart / Unitheme: color swatches expose hover text in static `title` on
 * `ty-product-options__image--wrapper.cm-tooltip` (no real browser hover needed).
 */
export function extractCsCartTyProductOptionSwatches(
  html: string,
  colorToken: string,
  productSkuHint: string,
  filenameToken: string,
  candidateMapSku: string
): LegacySwatchChecked[] {
  const swatches: LegacySwatchChecked[] = []
  const swatchTitleRe =
    /<a\b[^>]*class="[^"]*ty-product-options__image--wrapper[^"]*"[^>]*title\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi
  let tm: RegExpExecArray | null
  let swIdx = 0
  while ((tm = swatchTitleRe.exec(html)) !== null) {
    const title = decodeHtmlEntities((tm[2] ?? tm[3] ?? "").trim())
    const block = html.slice(Math.max(0, tm.index - 400), tm.index + 800)
    const imgSrc =
      block.match(/data-ca-variation-image\s*=\s*("([^"]*)"|'([^']*)')/i)?.[2] ??
      block.match(/data-ca-variation-image\s*=\s*("([^"]*)"|'([^']*)')/i)?.[3] ??
      ""
    const attrHay = [title, imgSrc].filter(Boolean).join(" ")
    const parsed = parseLegacySwatchLabelText(title, productSkuHint, filenameToken, candidateMapSku)
    swatches.push({
      selector_hint: `a.ty-product-options__image--wrapper.cm-tooltip[${swIdx}]`,
      color_token_match: colorLabelMatchesToken(attrHay, colorToken),
      attributes_before: { title, ...(imgSrc ? { "data-ca-variation-image": imgSrc } : {}) },
      hover_text: title,
      article: parsed?.article ?? null,
      color_name: parsed?.colorName ?? null,
      source_method: parsed?.article ? "hover-title" : "unavailable",
      raw_snippet: title.slice(0, 220),
    })
    swIdx += 1
    if (swatches.length >= 48) break
  }
  const childRe = /<div class="ty-product-option-child">\s*([^<]+?)\s*<\/div>/gi
  let cm: RegExpExecArray | null
  while ((cm = childRe.exec(html)) !== null) {
    const label = decodeHtmlEntities(cm[1].trim())
    const parsed = parseLegacySwatchLabelText(label, productSkuHint, filenameToken, candidateMapSku)
    if (!parsed) continue
    swatches.push({
      selector_hint: `div.ty-product-option-child[${swatches.length}]`,
      color_token_match: colorLabelMatchesToken(label, colorToken),
      attributes_before: { "option-child-label": label },
      hover_text: label,
      article: parsed.article,
      color_name: parsed.colorName,
      source_method: "nearby-text",
      raw_snippet: label.slice(0, 220),
    })
  }
  return swatches
}

export function extractEmbeddedJsonSwatchHints(
  html: string,
  colorToken: string,
  productSkuHint: string,
  filenameToken: string,
  candidateMapSku: string
): LegacySwatchChecked[] {
  const out: LegacySwatchChecked[] = []
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi
  let sm: RegExpExecArray | null
  let si = 0
  while ((sm = scriptRe.exec(html)) !== null) {
    const body = sm[1]
    if (!/variant|feature|product_option|variation/i.test(body)) continue
    const hay = body.slice(0, 120_000)
    const parsed = parseLegacySwatchLabelText(hay, productSkuHint, filenameToken, candidateMapSku)
    if (!parsed) continue
    if (colorToken && !colorLabelMatchesToken(hay, colorToken)) continue
    out.push({
      selector_hint: `script.embedded-json[${si}]`,
      color_token_match: colorLabelMatchesToken(hay, colorToken),
      attributes_before: {},
      hover_text: null,
      article: parsed.article,
      color_name: parsed.colorName,
      source_method: "embedded-json",
      raw_snippet: hay.slice(0, 220),
    })
    si += 1
    if (out.length >= 12) break
  }
  return out
}

export function extractSwatchesFromHtml(
  html: string,
  colorToken: string,
  productSkuHint: string,
  filenameToken: string,
  candidateMapSku: string
): LegacySwatchChecked[] {
  const swatches: LegacySwatchChecked[] = []
  const tagRe =
    /<(a|button|span|li|div|label|img)\b([^>]*(?:class|data-|title|aria-label|alt)[^>]*)>/gi
  let m: RegExpExecArray | null
  let idx = 0
  while ((m = tagRe.exec(html)) !== null) {
    const tag = (m[1] || "div").toLowerCase()
    const attrChunk = m[2] || ""
    const classVal = attrChunk.match(/class\s*=\s*("([^"]*)"|'([^']*)')/i)?.[2] ?? attrChunk.match(/class\s*=\s*("([^"]*)"|'([^']*)')/i)?.[3] ?? ""
    if (/ty-product-filters|color-filter|facet|sidebar-filter|cm-product-filters/i.test(classVal + attrChunk)) {
      continue
    }
    const swatchLike =
      /swatch|color|colour|variant|option|thumb|palette/i.test(classVal) ||
      /data-(color|variant|sku|article|option)/i.test(attrChunk)
    if (!swatchLike && tag !== "img") continue

    const attrs: Record<string, string> = {}
    for (const name of ["title", "aria-label", "alt", "class", "href", "data-color", "data-variant", "data-sku", "data-article"]) {
      const v = attrChunk.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"))
      if (v) attrs[name] = decodeHtmlEntities((v[2] ?? v[3] ?? "").trim())
    }
    for (const d of readDataAttributes(attrChunk)) {
      attrs[`data-${d.name}`] = d.value
    }

    const attrHay = Object.values(attrs).join(" ")
    const colorMatch = tokenMatchesColor(attrHay, colorToken)
    if (!colorMatch && colorToken) continue

    const selectorHint = `${tag}.${(classVal || "swatch").split(/\s+/).slice(0, 2).join(".")}[${idx}]`
    idx += 1

    let article: string | null = null
    let colorName: string | null = null
    let sourceMethod: LegacyArticleSourceMethod | "unavailable" = "unavailable"

    for (const hit of collectAttrHits(attrs)) {
      const parsed = parseLegacySwatchLabelText(hit.value, productSkuHint, filenameToken, candidateMapSku)
      if (parsed) {
        article = parsed.article
        colorName = parsed.colorName
        sourceMethod = hit.method
        break
      }
    }

    swatches.push({
      selector_hint: selectorHint,
      color_token_match: colorMatch,
      attributes_before: attrs,
      hover_text: null,
      article,
      color_name: colorName,
      source_method: sourceMethod,
      raw_snippet: snippetFromAttrs(attrs),
    })
    if (swatches.length >= 40) break
  }
  return swatches
}

export function resolveArticleFromSwatches(
  swatches: LegacySwatchChecked[],
  colorToken: string,
  productSkuHint: string,
  filenameToken: string,
  candidateMapSku: string
): {
  article: string | null
  colorName: string | null
  sourceMethod: LegacyArticleSourceMethod | null
  rawSnippet: string | null
  swatch: LegacySwatchChecked | null
} {
  const matching = swatches.filter((s) => s.color_token_match)
  for (const s of matching) {
    if (!s.article) continue
    if (isDisallowedArticle(s.article, productSkuHint, filenameToken, candidateMapSku)) continue
    return {
      article: s.article,
      colorName: s.color_name,
      sourceMethod: s.source_method === "unavailable" ? null : s.source_method,
      rawSnippet: s.raw_snippet,
      swatch: s,
    }
  }
  return { article: null, colorName: null, sourceMethod: null, rawSnippet: null, swatch: null }
}

/** Apply browser hover evidence (from external Playwright script or operator). */
export function resolveArticleFromHoverEvidence(
  evidence: HoverEvidenceInput[],
  colorToken: string,
  productSkuHint: string,
  filenameToken: string,
  candidateMapSku: string
): {
  article: string | null
  colorName: string | null
  sourceMethod: LegacyArticleSourceMethod | null
  rawSnippet: string | null
  swatch: LegacySwatchChecked | null
} {
  for (const ev of evidence) {
    const attrs: Record<string, string> = { ...(ev.attributes_before ?? {}) }
    if (ev.title) attrs.title = ev.title
    if (ev.aria_label) attrs["aria-label"] = ev.aria_label
    if (ev.data_attrs) {
      for (const [k, v] of Object.entries(ev.data_attrs)) attrs[k.startsWith("data-") ? k : `data-${k}`] = v
    }

    const attrHay = [Object.values(attrs).join(" "), ev.hover_text ?? "", ev.outer_html_snippet ?? ""].join(" ")
    if (colorToken && !tokenMatchesColor(attrHay, colorToken)) continue

    const texts: Array<{ method: LegacyArticleSourceMethod; value: string }> = []
    if (ev.hover_text) texts.push({ method: "hover-tooltip", value: ev.hover_text })
    for (const hit of collectAttrHits(attrs)) texts.push(hit)

    for (const t of texts) {
      const parsed = extractArticleTokenFromText(t.value, productSkuHint, filenameToken, candidateMapSku, colorToken)
      if (parsed) {
        const swatch: LegacySwatchChecked = {
          selector_hint: ev.selector || "hover-evidence",
          color_token_match: true,
          attributes_before: attrs,
          hover_text: ev.hover_text ?? null,
          article: parsed.article,
          color_name: parsed.colorName,
          source_method: t.method,
          raw_snippet: (ev.outer_html_snippet || ev.hover_text || snippetFromAttrs(attrs)).slice(0, 280),
        }
        return {
          article: parsed.article,
          colorName: parsed.colorName,
          sourceMethod: t.method,
          rawSnippet: swatch.raw_snippet,
          swatch,
        }
      }
    }
  }
  return { article: null, colorName: null, sourceMethod: null, rawSnippet: null, swatch: null }
}

export function finalizeEnrichmentResult(
  base: Omit<
    LegacyColorEnrichmentResult,
    "source_url" | "source_method" | "legacy_article_source_url" | "legacy_article_source_method"
  > & {
    legacy_article_source_url?: string | null
    legacy_article_source_method?: LegacyArticleSourceMethod | null
  }
): LegacyColorEnrichmentResult {
  return {
    ...base,
    legacy_article_source_url: base.legacy_article_source_url ?? null,
    legacy_article_source_method: base.legacy_article_source_method ?? null,
    source_url: base.legacy_article_source_url ?? null,
    source_method: base.legacy_article_source_method ?? null,
  }
}

export function buildEnrichmentUnreachable(
  productSkuHint: string,
  filenameToken: string | null,
  candidateMapSku: string | null,
  fetchStatus: LegacyColorEnrichmentFetchStatus,
  reasons: string[],
  urlsChecked: LegacyUrlChecked[],
  triedUrls: string[]
): LegacyColorEnrichmentResult {
  const articleStatus: LegacyColorArticleStatus =
    fetchStatus === "parse_exception" ? "parse_failed" : "legacy_fetch_unreachable"
  return finalizeEnrichmentResult({
    product_sku_hint: productSkuHint,
    filename_color_token: filenameToken,
    candidate_map_sku: candidateMapSku,
    legacy_color_name: null,
    legacy_color_article: null,
    legacy_color_article_status: articleStatus,
    fetch_status: fetchStatus,
    urls_checked: urlsChecked,
    swatches_checked: [],
    confidence: "low",
    reasons,
    raw_evidence_snippet: null,
    hover_status: "unavailable",
    tried_urls: triedUrls,
  })
}

export function buildEnrichmentNotFound(
  productSkuHint: string,
  filenameToken: string | null,
  candidateMapSku: string | null,
  sourceUrl: string,
  urlsChecked: LegacyUrlChecked[],
  swatchesChecked: LegacySwatchChecked[],
  triedUrls: string[],
  extraReasons: string[],
  rawSnippet: string | null
): LegacyColorEnrichmentResult {
  return finalizeEnrichmentResult({
    product_sku_hint: productSkuHint,
    filename_color_token: filenameToken,
    candidate_map_sku: candidateMapSku,
    legacy_color_name: null,
    legacy_color_article: null,
    legacy_color_article_status: "not_found",
    legacy_article_source_url: sourceUrl,
    fetch_status: "ok",
    urls_checked: urlsChecked,
    swatches_checked: swatchesChecked,
    confidence: "low",
    reasons: ["html_fetched_swatch_scan_no_color_article", ...extraReasons],
    raw_evidence_snippet: rawSnippet,
    hover_status: swatchesChecked.length ? "required" : "unavailable",
    tried_urls: triedUrls,
  })
}

export function buildEnrichmentHoverRequired(
  productSkuHint: string,
  filenameToken: string | null,
  candidateMapSku: string | null,
  sourceUrl: string,
  urlsChecked: LegacyUrlChecked[],
  swatchesChecked: LegacySwatchChecked[],
  triedUrls: string[],
  reasons: string[],
  rawSnippet: string | null
): LegacyColorEnrichmentResult {
  return finalizeEnrichmentResult({
    product_sku_hint: productSkuHint,
    filename_color_token: filenameToken,
    candidate_map_sku: candidateMapSku,
    legacy_color_name: null,
    legacy_color_article: null,
    legacy_color_article_status: "hover_required",
    legacy_article_source_url: sourceUrl,
    fetch_status: "ok",
    urls_checked: urlsChecked,
    swatches_checked: swatchesChecked,
    confidence: "low",
    reasons: ["legacy_page_reachable_hover_extraction_needed", ...reasons],
    raw_evidence_snippet: rawSnippet,
    hover_status: "required",
    tried_urls: triedUrls,
  })
}

export function buildEnrichmentFound(
  productSkuHint: string,
  filenameToken: string | null,
  candidateMapSku: string | null,
  article: string,
  name: string | null,
  sourceUrl: string,
  urlsChecked: LegacyUrlChecked[],
  swatchesChecked: LegacySwatchChecked[],
  triedUrls: string[],
  parseReasons: string[],
  confidence: "high" | "medium" | "low",
  sourceMethod: LegacyArticleSourceMethod,
  rawSnippet: string | null
): LegacyColorEnrichmentResult {
  return finalizeEnrichmentResult({
    product_sku_hint: productSkuHint,
    filename_color_token: filenameToken,
    candidate_map_sku: candidateMapSku,
    legacy_color_name: name,
    legacy_color_article: article,
    legacy_color_article_status: "found",
    legacy_article_source_url: sourceUrl,
    legacy_article_source_method: sourceMethod,
    fetch_status: "ok",
    urls_checked: urlsChecked,
    swatches_checked: swatchesChecked,
    confidence,
    reasons: parseReasons,
    raw_evidence_snippet: rawSnippet,
    hover_status: "not_needed",
    tried_urls: triedUrls,
  })
}

export type EnrichFromHtmlParams = {
  html: string
  colorToken: string
  productSkuHint: string
  filenameToken: string | null
  candidateMapSku: string | null
  sourceUrl: string
  urlsChecked: LegacyUrlChecked[]
  triedUrls: string[]
}

function sanitizeSwatchArticles(
  swatches: LegacySwatchChecked[],
  productSkuHint: string,
  filenameToken: string,
  candidateMapSku: string
): LegacySwatchChecked[] {
  return swatches.map((s) => ({
    ...s,
    article:
      s.article && isDisallowedArticle(s.article, productSkuHint, filenameToken, candidateMapSku) ? null : s.article,
  }))
}

export function collectAllSwatchesFromHtml(
  html: string,
  colorToken: string,
  productSkuHint: string,
  filenameToken: string,
  candidateMapSku: string
): LegacySwatchChecked[] {
  const fn = filenameToken || ""
  const cm = candidateMapSku || ""
  const csCart = extractCsCartTyProductOptionSwatches(html, colorToken, productSkuHint, fn, cm)
  const embedded = extractEmbeddedJsonSwatchHints(html, colorToken, productSkuHint, fn, cm)
  const generic = extractSwatchesFromHtml(html, colorToken, productSkuHint, fn, cm)
  const merged = [...csCart, ...embedded, ...generic]
  const seen = new Set<string>()
  const out: LegacySwatchChecked[] = []
  for (const s of merged) {
    const key = `${s.selector_hint}::${s.raw_snippet.slice(0, 80)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return sanitizeSwatchArticles(out, productSkuHint, fn, cm)
}

/** Parse static HTML for swatch attributes; never falls back to product SKU / JSON-LD body scan. */
export function enrichFromFetchedHtml(params: EnrichFromHtmlParams):
  | { kind: "found"; result: LegacyColorEnrichmentResult }
  | { kind: "hover_required"; result: LegacyColorEnrichmentResult }
  | { kind: "not_found"; result: LegacyColorEnrichmentResult } {
  const swatches = collectAllSwatchesFromHtml(
    params.html,
    params.colorToken,
    params.productSkuHint,
    params.filenameToken || "",
    params.candidateMapSku || ""
  )

  const resolved = resolveArticleFromSwatches(
    swatches,
    params.colorToken,
    params.productSkuHint,
    params.filenameToken || "",
    params.candidateMapSku || ""
  )

  if (resolved.article && resolved.sourceMethod) {
    return {
      kind: "found",
      result: buildEnrichmentFound(
        params.productSkuHint,
        params.filenameToken,
        params.candidateMapSku,
        resolved.article,
        resolved.colorName,
        params.sourceUrl,
        params.urlsChecked,
        swatches,
        params.triedUrls,
        [`swatch_${resolved.sourceMethod}`],
        "high",
        resolved.sourceMethod,
        resolved.rawSnippet
      ),
    }
  }

  const colorSwatches = swatches.filter((s) => s.color_token_match)
  if (colorSwatches.length > 0) {
    const sample = colorSwatches[0]
    return {
      kind: "hover_required",
      result: buildEnrichmentHoverRequired(
        params.productSkuHint,
        params.filenameToken,
        params.candidateMapSku,
        params.sourceUrl,
        params.urlsChecked,
        swatches,
        params.triedUrls,
        [`swatches_for_color=${colorSwatches.length}`, "static_html_missing_hover_article"],
        sample.raw_snippet
      ),
    }
  }

  return {
    kind: "not_found",
    result: buildEnrichmentNotFound(
      params.productSkuHint,
      params.filenameToken,
      params.candidateMapSku,
      params.sourceUrl,
      params.urlsChecked,
      swatches,
      params.triedUrls,
      swatches.length ? ["swatches_present_no_color_token_match"] : ["no_swatch_elements_detected"],
      swatches[0]?.raw_snippet ?? null
    ),
  }
}

/** @deprecated Static-only path; use enrichFromFetchedHtml. Kept for tests importing the name. */
export function parseLegacyColorArticleFromHtml(
  html: string,
  colorToken: string,
  productSkuHint: string
): {
  article: string | null
  name: string | null
  confidence: "high" | "medium" | "low"
  source_method: LegacyArticleSourceMethod | null
  reasons: string[]
} {
  const r = enrichFromFetchedHtml({
    html,
    colorToken,
    productSkuHint,
    filenameToken: null,
    candidateMapSku: null,
    sourceUrl: "",
    urlsChecked: [],
    triedUrls: [],
  })
  const res = r.result
  return {
    article: res.legacy_color_article,
    name: res.legacy_color_name,
    confidence: res.confidence,
    source_method: res.legacy_article_source_method,
    reasons: res.reasons,
  }
}

export const LEGACY_FETCH_TIMEOUT_MS = 10_000
export const LEGACY_MAX_HTML_BYTES = 1_500_000
