import * as crypto from "crypto"
import * as fs from "fs"
import * as path from "path"
import { NextResponse } from "next/server"
import { getFurnitureRepoDataResolution, legacyMediaQaRepoRootFailurePayload } from "@/lib/qa/furniture-repo-data-root"
import {
  buildEnrichmentFound,
  buildEnrichmentUnreachable,
  dedupeUrlCandidates,
  enrichFromFetchedHtml,
  finalizeEnrichmentResult,
  LEGACY_FETCH_TIMEOUT_MS,
  LEGACY_MAX_HTML_BYTES,
  looksLikeDirectMediaUrl,
  pickHtmlCandidateUrls,
  resolveArticleFromHoverEvidence,
  type HoverEvidenceInput,
  type LegacyColorEnrichmentResult,
  type LegacyUrlCandidate,
  type LegacyUrlChecked,
} from "@/lib/qa/legacy-color-article-enrichment"

export const dynamic = "force-dynamic"

function prodBlocked(): boolean {
  return process.env.NODE_ENV === "production" && process.env.LEGACY_MEDIA_QA_BOARD_ALLOW_PROD !== "1"
}

type Body = {
  product_handle?: string
  variant_key?: string
  color_token?: string
  product_sku_hint?: string
  filename_color_token?: string
  candidate_map_sku?: string
  candidate_urls?: Array<string | { url: string; source?: string }>
  hover_evidence?: HoverEvidenceInput[]
}

function legacyCacheHtmlPath(repoRoot: string, url: string): string {
  const hash = crypto.createHash("md5").update(url).digest("hex")
  return path.join(repoRoot, "data", "raw", "legacy", "cache", `${hash}.html`)
}

function readCachedLegacyHtml(repoRoot: string, url: string): string | null {
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

function readLegacyPageUrlFromLegacyProducts(repoRoot: string, productSkuHint: string, productHandle: string): string | null {
  const productsPath = path.join(repoRoot, "data", "raw", "legacy", "legacy-products.json")
  if (!fs.existsSync(productsPath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(productsPath, "utf8")) as unknown
    if (!Array.isArray(raw)) return null
    const skuNorm = productSkuHint.replace(/\s+/g, "").replace(/_/g, "-").toUpperCase()
    const handleNorm = productHandle.toLowerCase()
    for (const row of raw) {
      if (!row || typeof row !== "object") continue
      const o = row as Record<string, unknown>
      const code = String(o.product_code_from_image ?? o.product_code_raw ?? "")
        .replace(/\s+/g, "")
        .replace(/_/g, "-")
        .toUpperCase()
      const pageUrl = String(o.page_url ?? "").trim()
      if (!pageUrl.startsWith("http")) continue
      if (code && code === skuNorm) return pageUrl
      if (handleNorm && pageUrl.toLowerCase().includes(handleNorm.replace(/_/g, "-"))) return pageUrl
    }
  } catch {
    return null
  }
  return null
}

function readLegacyPageUrlFromImageMap(repoRoot: string, productSkuHint: string, productHandle: string): string | null {
  const mapPath = path.join(repoRoot, "data", "normalized", "image-map.after-front.json")
  if (!fs.existsSync(mapPath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(mapPath, "utf8")) as unknown
    if (!Array.isArray(raw)) return null
    const skuNorm = productSkuHint.replace(/\s+/g, "").replace(/_/g, "-").toUpperCase()
    const handleNorm = productHandle.toLowerCase()
    for (const row of raw) {
      if (!row || typeof row !== "object") continue
      const o = row as Record<string, unknown>
      const code = String(o.product_code_normalized ?? "").replace(/\s+/g, "").replace(/_/g, "-").toUpperCase()
      const handle = String(o.medusa_product_handle ?? o.product_handle ?? "").toLowerCase()
      if (code !== skuNorm && handle !== handleNorm) continue
      const u = String(o.legacy_page_url ?? "").trim()
      if (u.startsWith("http")) return u
    }
  } catch {
    return null
  }
  return null
}

function collectUrlCandidates(body: Body, repoRoot: string | null): LegacyUrlCandidate[] {
  const out: LegacyUrlCandidate[] = []
  const rawList = Array.isArray(body.candidate_urls) ? body.candidate_urls : []
  for (const item of rawList) {
    if (typeof item === "string") {
      const u = item.trim()
      if (u) out.push({ url: u, source: "client_candidate_urls" })
    } else if (item && typeof item === "object" && typeof item.url === "string") {
      out.push({ url: item.url.trim(), source: String(item.source || "client_candidate_urls") })
    }
  }
  if (repoRoot) {
    const sku = String(body.product_sku_hint ?? "").trim()
    const handle = String(body.product_handle ?? "").trim()
    const fromMap = readLegacyPageUrlFromImageMap(repoRoot, sku, handle)
    if (fromMap) out.push({ url: fromMap, source: "image_map_legacy_page_url_readonly" })
    const fromProducts = readLegacyPageUrlFromLegacyProducts(repoRoot, sku, handle)
    if (fromProducts) out.push({ url: fromProducts, source: "legacy_products_json_page_url_readonly" })
  }
  return dedupeUrlCandidates(out)
}

async function probeUrl(url: string, source: string): Promise<LegacyUrlChecked> {
  if (looksLikeDirectMediaUrl(url)) {
    return {
      url,
      source,
      fetch_status: "skipped_non_html",
      http_status: null,
      error: "direct_media_url",
      reachable_from_api: false,
    }
  }
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), LEGACY_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": "furniture-commerce-legacy-qa-board/1.0 (+dev-only)",
      },
    })
    const ct = (res.headers.get("content-type") || "").toLowerCase()
    const htmlLike = ct.includes("text/html") || ct.includes("application/xhtml")
    if (!res.ok) {
      return {
        url,
        source,
        fetch_status: "http_error",
        http_status: res.status,
        error: `http_${res.status}`,
        reachable_from_api: false,
      }
    }
    if (!htmlLike) {
      return {
        url,
        source,
        fetch_status: "skipped_non_html",
        http_status: res.status,
        error: ct || "non_html",
        reachable_from_api: true,
      }
    }
    return {
      url,
      source,
      fetch_status: "ok",
      http_status: res.status,
      error: null,
      reachable_from_api: true,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const timeout = e instanceof Error && e.name === "AbortError"
    return {
      url,
      source,
      fetch_status: timeout ? "timeout" : "unreachable",
      http_status: null,
      error: msg,
      reachable_from_api: false,
    }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), LEGACY_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": "furniture-commerce-legacy-qa-board/1.0 (+dev-only)",
      },
    })
    if (!res.ok) return null
    const ct = (res.headers.get("content-type") || "").toLowerCase()
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength > LEGACY_MAX_HTML_BYTES) return null
    return new TextDecoder("utf-8", { fatal: false }).decode(buf)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(req: Request): Promise<Response> {
  if (prodBlocked()) {
    return new NextResponse("Not found", { status: 404 })
  }
  const resolution = getFurnitureRepoDataResolution()
  if (!resolution.repoRoot) {
    return NextResponse.json(legacyMediaQaRepoRootFailurePayload(resolution), { status: 500 })
  }

  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const productSkuHint = String(body.product_sku_hint ?? "").trim()
  const colorToken = String(body.color_token ?? "").trim()
  const filenameToken = String(body.filename_color_token ?? colorToken).trim() || null
  const candidateMapSku = String(body.candidate_map_sku ?? productSkuHint).trim() || null
  const hoverEvidence = Array.isArray(body.hover_evidence) ? body.hover_evidence : []

  if (!productSkuHint) {
    return NextResponse.json({ error: "missing_product_sku_hint" }, { status: 400 })
  }
  if (!colorToken) {
    return NextResponse.json({ error: "missing_color_token" }, { status: 400 })
  }

  const urlCandidates = collectUrlCandidates(body, resolution.repoRoot)
  const htmlUrls = pickHtmlCandidateUrls(urlCandidates.map((c) => c.url))
  const tried = urlCandidates.map((c) => c.url)

  const urlsChecked: LegacyUrlChecked[] = []
  for (const c of urlCandidates.slice(0, 12)) {
    urlsChecked.push(await probeUrl(c.url, c.source))
  }

  if (hoverEvidence.length > 0) {
    const hover = resolveArticleFromHoverEvidence(
      hoverEvidence,
      colorToken,
      productSkuHint,
      filenameToken || "",
      candidateMapSku || ""
    )
    if (hover.article && hover.sourceMethod) {
      const sourceUrl = htmlUrls[0] || urlCandidates.find((u) => !looksLikeDirectMediaUrl(u.url))?.url || null
      return NextResponse.json(
        finalizeEnrichmentResult({
          ...buildEnrichmentFound(
            productSkuHint,
            filenameToken,
            candidateMapSku,
            hover.article,
            hover.colorName,
            sourceUrl || "",
            urlsChecked,
            hover.swatch ? [hover.swatch] : [],
            tried,
            ["hover_evidence_supplied", `method_${hover.sourceMethod}`],
            "high",
            hover.sourceMethod,
            hover.rawSnippet
          ),
          hover_status: "supplied",
        }),
        { status: 200 }
      )
    }
  }

  if (htmlUrls.length === 0) {
    const r = buildEnrichmentUnreachable(
      productSkuHint,
      filenameToken,
      candidateMapSku,
      "no_urls",
      urlCandidates.length
        ? ["only_non_html_candidate_urls", "skipped_image_or_binary_urls"]
        : ["no_html_legacy_page_urls_in_audit"],
      urlsChecked,
      tried.slice(0, 20)
    )
    return NextResponse.json(r, { status: 200 })
  }

  let lastHtmlUrl: string | null = null
  let lastOutcome: LegacyColorEnrichmentResult | null = null
  let anyReachable = false

  for (const url of htmlUrls.slice(0, 8)) {
    let html = await fetchHtml(url)
    let parseReasons: string[] = []
    if (!html && resolution.repoRoot) {
      html = readCachedLegacyHtml(resolution.repoRoot, url)
      if (html) parseReasons = ["legacy_html_from_repo_cache"]
    }
    if (!html) continue
    anyReachable = true
    lastHtmlUrl = url
    try {
      const outcome = enrichFromFetchedHtml({
        html,
        colorToken,
        productSkuHint,
        filenameToken,
        candidateMapSku,
        sourceUrl: url,
        urlsChecked,
        triedUrls: tried,
      })
      lastOutcome = outcome.result
      if (parseReasons.length) {
        lastOutcome = { ...lastOutcome, reasons: [...parseReasons, ...lastOutcome.reasons] }
      }
      if (outcome.kind === "found") {
        return NextResponse.json(lastOutcome, { status: 200 })
      }
    } catch (e) {
      const r = buildEnrichmentUnreachable(
        productSkuHint,
        filenameToken,
        candidateMapSku,
        "parse_exception",
        [e instanceof Error ? e.message : "parse_throw"],
        urlsChecked,
        tried
      )
      r.legacy_article_source_url = url
      r.source_url = url
      return NextResponse.json(r, { status: 200 })
    }
  }

  if (lastOutcome && lastHtmlUrl) {
    if (lastOutcome.legacy_color_article_status === "hover_required") {
      return NextResponse.json(lastOutcome, { status: 200 })
    }
    if (lastOutcome.legacy_color_article_status === "not_found") {
      return NextResponse.json(lastOutcome, { status: 200 })
    }
  }

  if (!anyReachable) {
    const reasons = urlsChecked.some((u) => u.fetch_status === "timeout")
      ? ["all_fetch_attempts_timeout"]
      : ["all_fetch_attempts_failed_or_unreachable"]
    const r = buildEnrichmentUnreachable(
      productSkuHint,
      filenameToken,
      candidateMapSku,
      "legacy_unreachable",
      reasons,
      urlsChecked,
      tried
    )
    return NextResponse.json(r, { status: 200 })
  }

  const r = buildEnrichmentUnreachable(
    productSkuHint,
    filenameToken,
    candidateMapSku,
    "http_error",
    ["no_successful_html_parse"],
    urlsChecked,
    tried
  )
  return NextResponse.json(r, { status: 200 })
}

/** Smoke: GET returns 200 JSON without network fetch. */
export async function GET(): Promise<Response> {
  if (prodBlocked()) {
    return new NextResponse("Not found", { status: 404 })
  }
  const resolution = getFurnitureRepoDataResolution()
  if (!resolution.repoRoot) {
    return NextResponse.json(legacyMediaQaRepoRootFailurePayload(resolution), { status: 500 })
  }
  return NextResponse.json({
    ok: true,
    scope: "legacy_color_article_enrichment",
    post_hint:
      "POST JSON { product_handle, product_sku_hint, color_token, filename_color_token, candidate_map_sku, candidate_urls[], hover_evidence[] }",
    statuses: ["found", "not_found", "legacy_fetch_unreachable", "parse_failed", "hover_required"],
  })
}
