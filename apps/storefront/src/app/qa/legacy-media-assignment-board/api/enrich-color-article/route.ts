import { NextResponse } from "next/server"
import { getFurnitureRepoDataResolution, legacyMediaQaRepoRootFailurePayload } from "@/lib/qa/furniture-repo-data-root"
import {
  buildEnrichmentFound,
  buildEnrichmentNotFound,
  buildEnrichmentUnavailable,
  looksLikeDirectMediaUrl,
  parseLegacyColorArticleFromHtml,
  pickHtmlCandidateUrls,
  type LegacyColorEnrichmentResult,
} from "@/lib/qa/legacy-color-article-enrichment"

export const dynamic = "force-dynamic"

const MAX_HTML_BYTES = 1_500_000
const FETCH_TIMEOUT_MS = 12_000

function prodBlocked(): boolean {
  return process.env.NODE_ENV === "production" && process.env.LEGACY_MEDIA_QA_BOARD_ALLOW_PROD !== "1"
}

type Body = {
  product_handle?: string
  variant_key?: string
  color_token?: string
  product_sku_hint?: string
  candidate_urls?: string[]
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
  const rawList = Array.isArray(body.candidate_urls) ? body.candidate_urls.map((u) => String(u ?? "").trim()).filter(Boolean) : []
  const htmlUrls = pickHtmlCandidateUrls(rawList)

  if (!productSkuHint) {
    return NextResponse.json({ error: "missing_product_sku_hint" }, { status: 400 })
  }
  if (!colorToken) {
    return NextResponse.json({ error: "missing_color_token" }, { status: 400 })
  }

  if (htmlUrls.length === 0) {
    const r: LegacyColorEnrichmentResult = buildEnrichmentUnavailable(
      productSkuHint,
      "no_urls",
      rawList.length ? ["only_non_html_candidate_urls", "skipped_image_or_binary_urls"] : ["no_candidate_urls"],
      rawList.slice(0, 20)
    )
    return NextResponse.json(r, { status: 200 })
  }

  const tried: string[] = []
  let lastNonHtml = false
  let lastHttpError = false
  let lastHtmlUrl: string | null = null
  let lastNotFoundReasons: string[] = []

  for (const url of htmlUrls.slice(0, 8)) {
    tried.push(url)
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        redirect: "follow",
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "User-Agent": "furniture-commerce-legacy-qa-board/1.0 (+dev-only)",
        },
      })
      if (!res.ok) {
        lastHttpError = true
        continue
      }
      const ct = (res.headers.get("content-type") || "").toLowerCase()
      if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
        if (looksLikeDirectMediaUrl(url)) lastNonHtml = true
        lastNonHtml = true
        continue
      }
      const buf = await res.arrayBuffer()
      if (buf.byteLength > MAX_HTML_BYTES) {
        continue
      }
      const html = new TextDecoder("utf-8", { fatal: false }).decode(buf)
      lastHtmlUrl = url
      let parsed: ReturnType<typeof parseLegacyColorArticleFromHtml>
      try {
        parsed = parseLegacyColorArticleFromHtml(html, colorToken, productSkuHint)
      } catch (e) {
        const r: LegacyColorEnrichmentResult = buildEnrichmentUnavailable(productSkuHint, "parse_exception", [
          e instanceof Error ? e.message : "parse_throw",
        ], tried)
        r.source_url = url
        return NextResponse.json(r, { status: 200 })
      }
      lastNotFoundReasons = parsed.reasons
      if (parsed.article) {
        const norm = (s: string) => s.replace(/\s+/g, "").replace(/_/g, "-").toLowerCase()
        if (norm(parsed.article) === norm(productSkuHint)) {
          continue
        }
        return NextResponse.json(
          buildEnrichmentFound(productSkuHint, parsed.article, parsed.name, url, tried, parsed.reasons, parsed.confidence),
          { status: 200 }
        )
      }
      /* try next URL — another legacy page may expose the color article */
      continue
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        const r = buildEnrichmentUnavailable(productSkuHint, "timeout", ["fetch_aborted_timeout"], tried)
        return NextResponse.json(r, { status: 200 })
      }
      lastHttpError = true
    } finally {
      clearTimeout(timer)
    }
  }

  if (lastHtmlUrl) {
    return NextResponse.json(buildEnrichmentNotFound(productSkuHint, lastHtmlUrl, tried, lastNotFoundReasons), { status: 200 })
  }

  const reasons: string[] = []
  if (lastHttpError) reasons.push("all_fetch_attempts_failed_or_http_error")
  if (lastNonHtml) reasons.push("non_html_responses_only")
  if (!reasons.length) reasons.push("no_successful_html_response")

  const r = buildEnrichmentUnavailable(productSkuHint, "http_error", reasons, tried)
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
    post_hint: "POST JSON { product_sku_hint, color_token, candidate_urls[] }",
  })
}
