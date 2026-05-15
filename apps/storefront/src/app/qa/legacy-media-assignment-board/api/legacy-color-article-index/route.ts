import { NextResponse } from "next/server"
import { getFurnitureRepoDataResolution, legacyMediaQaRepoRootFailurePayload } from "@/lib/qa/furniture-repo-data-root"
import {
  buildLegacyPageRegistry,
  indexStats,
  buildLegacyColorArticleIndex,
  matchIndexedColorArticle,
  scanIndexedArticlesForSuggestions,
  type ScanSuggestionInput,
} from "@/lib/qa/legacy-color-article-index"

export const dynamic = "force-dynamic"

function prodBlocked(): boolean {
  return process.env.NODE_ENV === "production" && process.env.LEGACY_MEDIA_QA_BOARD_ALLOW_PROD !== "1"
}

type ScanBody = {
  action?: "scan" | "match" | "registry"
  suggestions?: ScanSuggestionInput[]
  product_handle?: string
  product_sku_hint?: string
  color_token?: string
  filename_color_token?: string
  candidate_map_sku?: string
  candidate_urls?: Array<string | { url: string; source?: string }>
}

export async function GET(): Promise<Response> {
  if (prodBlocked()) return new NextResponse("Not found", { status: 404 })
  const resolution = getFurnitureRepoDataResolution()
  if (!resolution.repoRoot) {
    return NextResponse.json(legacyMediaQaRepoRootFailurePayload(resolution), { status: 500 })
  }
  const registry = buildLegacyPageRegistry(resolution.repoRoot)
  const index = buildLegacyColorArticleIndex(resolution.repoRoot)
  const stats = indexStats(registry, index)
  return NextResponse.json({
    ok: true,
    scope: "legacy_color_article_index",
    stats,
    sample_pdps: registry.filter((p) => p.page_kind === "pdp_with_swatches").slice(0, 12),
  })
}

export async function POST(req: Request): Promise<Response> {
  if (prodBlocked()) return new NextResponse("Not found", { status: 404 })
  const resolution = getFurnitureRepoDataResolution()
  if (!resolution.repoRoot) {
    return NextResponse.json(legacyMediaQaRepoRootFailurePayload(resolution), { status: 500 })
  }

  let body: ScanBody = {}
  try {
    body = (await req.json()) as ScanBody
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const action = body.action || "scan"

  if (action === "registry") {
    const registry = buildLegacyPageRegistry(resolution.repoRoot)
    return NextResponse.json({ registry, stats: indexStats(registry, buildLegacyColorArticleIndex(resolution.repoRoot)) })
  }

  if (action === "match") {
    const productSkuHint = String(body.product_sku_hint ?? "").trim()
    const colorToken = String(body.color_token ?? "").trim()
    if (!productSkuHint || !colorToken) {
      return NextResponse.json({ error: "missing_product_sku_hint_or_color_token" }, { status: 400 })
    }
    const candidate_urls = (body.candidate_urls ?? []).map((item) =>
      typeof item === "string"
        ? { url: item.trim(), source: "client" }
        : { url: String(item.url || "").trim(), source: String(item.source || "client") }
    )
    const match = matchIndexedColorArticle(resolution.repoRoot, {
      product_handle: String(body.product_handle ?? "").trim(),
      product_sku_hint: productSkuHint,
      color_token: colorToken,
      filename_color_token: body.filename_color_token,
      candidate_map_sku: body.candidate_map_sku,
      candidate_urls,
    })
    return NextResponse.json({ match }, { status: 200 })
  }

  const suggestions = Array.isArray(body.suggestions) ? body.suggestions : []
  const { results, progress } = scanIndexedArticlesForSuggestions(resolution.repoRoot, suggestions)
  const byKey: Record<string, (typeof results)[0]["enrichment"]> = {}
  for (const r of results) byKey[r.key] = r.enrichment
  return NextResponse.json({ progress, results: byKey, matches: results.map((r) => ({ key: r.key, match: r.match })) })
}
