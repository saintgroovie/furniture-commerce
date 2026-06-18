/**
 * Read-only analysis: colors / materials / execution selectors for all published SKUs
 * (main /catalog + /kids/catalog), including kids (Willie Winkie, Oliver kids, room sets).
 *
 * Usage (from apps/storefront):
 *   npx tsx scripts/analyze-color-material-coverage.ts
 *
 * Writes: ../../tmp/color-material-analysis/analysis.json
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

import { getProducts } from "../src/lib/api/products"
import { BESPOKE_PRODUCT_TYPE } from "../src/lib/bespoke"
import {
  buildIntraProductExecutionSelectors,
  cardThumbnailSrcFromProduct,
  finishLabelForProduct,
} from "../src/lib/card-color-media"
import {
  isMedusaCanonicalSeedDemoProduct,
  isProductInActiveCatalogScope,
} from "../src/lib/catalog-scope"
import { resolveKidsProducts } from "../src/lib/kids"

const __dirname = dirname(fileURLToPath(import.meta.url))
const STOREFRONT_ROOT = join(__dirname, "..")
const OUT_DIR = join(STOREFRONT_ROOT, "..", "..", "tmp", "color-material-analysis")

function loadEnvLocal() {
  const p = join(STOREFRONT_ROOT, ".env.local")
  const text = readFileSync(p, "utf8")
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    let val = m[2].trim().replace(/^["']|["']$/g, "")
    if (process.env[m[1]] === undefined) process.env[m[1]] = val
  }
}

type Segment = "main_catalog" | "kids" | "bespoke" | "demo_seed" | "paused_or_unknown"

type DimensionRow = {
  type: "headboard" | "upholstery" | "wood" | "finish"
  label?: "Цвет" | "Отделка"
  count: number
  source: string
  keys?: string[]
}

type ProductRow = {
  handle: string | null
  title: string | null
  status: string | null
  collection: string | null
  display_group: string | null
  segment: Segment
  thumbnail: boolean
  image_count: number
  finish_color_executions_count: number
  finish_color_keys: string[]
  headboard_model_executions_count: number
  headboard_keys: string[]
  material_tier_keys: string[]
  material_tiers: Array<{ tier: string; price_known: boolean | null }>
  card_confidence: string
  card_dimensions: DimensionRow[]
  has_card_swatches: boolean
  painting_name: string | null
  motif: string | null
  launch_mode: string | null
  storefront_section: string | null
}

function segmentFor(
  p: Record<string, unknown>,
  kidsIds: Set<string>
): Segment {
  const cls = (p.product_classification as { product_type?: string } | undefined)?.product_type
  if (cls === BESPOKE_PRODUCT_TYPE) return "bespoke"
  if (isMedusaCanonicalSeedDemoProduct(p)) return "demo_seed"
  if (!isProductInActiveCatalogScope(p)) return "paused_or_unknown"
  if (kidsIds.has(p.id as string)) return "kids"
  return "main_catalog"
}

function analyzeProduct(
  p: Record<string, unknown>,
  kidsIds: Set<string>
): ProductRow {
  const meta = (p.metadata as Record<string, unknown> | undefined) ?? {}
  const thumb = cardThumbnailSrcFromProduct(p)
  const selectors = buildIntraProductExecutionSelectors(p, thumb || "")

  const finishExec = Array.isArray(meta.finish_color_executions)
    ? (meta.finish_color_executions as Array<{ key?: string }>)
    : []
  const headboardExec = Array.isArray(meta.headboard_model_executions)
    ? (meta.headboard_model_executions as Array<{ key?: string }>)
    : []
  const materialTiers =
    meta.material_tiers && typeof meta.material_tiers === "object"
      ? (meta.material_tiers as Record<string, { price_known?: boolean }>)
      : null
  const tierKeys = materialTiers ? Object.keys(materialTiers) : []

  const dims: DimensionRow[] = []
  if (selectors.headboard && selectors.headboard.length > 1) {
    dims.push({
      type: "headboard",
      count: selectors.headboard.length,
      source: selectors.confidence,
      keys: selectors.headboard.map((v) => v.key),
    })
  }
  if (selectors.upholstery && selectors.upholstery.length > 1) {
    dims.push({
      type: "upholstery",
      count: selectors.upholstery.length,
      source: selectors.confidence,
      keys: selectors.upholstery.map((v) => v.key),
    })
  }
  if (selectors.wood && selectors.wood.length > 1) {
    dims.push({
      type: "wood",
      count: selectors.wood.length,
      source: selectors.confidence,
      keys: selectors.wood.map((v) => v.key),
    })
  }
  if (selectors.finish && selectors.finish.length > 1) {
    dims.push({
      type: "finish",
      label: finishLabelForProduct(p),
      count: selectors.finish.length,
      source: selectors.confidence,
      keys: selectors.finish.map((v) => v.key),
    })
  }

  return {
    handle: typeof p.handle === "string" ? p.handle : null,
    title: typeof p.title === "string" ? p.title : null,
    status: typeof p.status === "string" ? p.status : null,
    collection: typeof meta.collection === "string" ? meta.collection : null,
    display_group: typeof meta.display_group === "string" ? meta.display_group : null,
    segment: segmentFor(p, kidsIds),
    thumbnail: Boolean(thumb),
    image_count: Array.isArray(p.images) ? p.images.length : 0,
    finish_color_executions_count: finishExec.length,
    finish_color_keys: finishExec
      .map((e) => (typeof e.key === "string" ? e.key : null))
      .filter((k): k is string => Boolean(k)),
    headboard_model_executions_count: headboardExec.length,
    headboard_keys: headboardExec
      .map((e) => (typeof e.key === "string" ? e.key : null))
      .filter((k): k is string => Boolean(k)),
    material_tier_keys: tierKeys,
    material_tiers: tierKeys.map((tier) => ({
      tier,
      price_known: materialTiers?.[tier]?.price_known ?? null,
    })),
    card_confidence: selectors.confidence,
    card_dimensions: dims,
    has_card_swatches: dims.length > 0,
    painting_name: typeof meta.painting_name === "string" ? meta.painting_name : null,
    motif: typeof meta.motif === "string" ? meta.motif : null,
    launch_mode: typeof meta.launch_mode === "string" ? meta.launch_mode : null,
    storefront_section:
      typeof meta.storefront_section === "string" ? meta.storefront_section : null,
  }
}

async function main() {
  loadEnvLocal()

  const data = await getProducts()
  const products = (Array.isArray(data.products) ? data.products : []) as Record<
    string,
    unknown
  >[]
  const kids = await resolveKidsProducts({ storeProducts: products })
  const kidsIds = kids.ids

  const rows = products.map((p) => analyzeProduct(p, kidsIds))
  const published = rows.filter(
    (r) => r.segment === "main_catalog" || r.segment === "kids"
  )

  type CollBucket = {
    total: number
    with_swatches: number
    canonical: number
    heuristic: number
    blocked: number
    no_media: number
    no_swatches: number
    with_material_tiers: number
    with_finish_metadata: number
    with_headboard_metadata: number
    handles_no_swatches: string[]
  }

  const byCollection: Record<string, CollBucket> = {}
  for (const r of published) {
    const k = r.collection ?? "(none)"
    if (!byCollection[k]) {
      byCollection[k] = {
        total: 0,
        with_swatches: 0,
        canonical: 0,
        heuristic: 0,
        blocked: 0,
        no_media: 0,
        no_swatches: 0,
        with_material_tiers: 0,
        with_finish_metadata: 0,
        with_headboard_metadata: 0,
        handles_no_swatches: [],
      }
    }
    const b = byCollection[k]
    b.total++
    if (r.has_card_swatches) b.with_swatches++
    if (r.card_confidence === "canonical") b.canonical++
    if (r.card_confidence === "heuristic") b.heuristic++
    if (r.card_confidence === "metadata_blocked") b.blocked++
    if (!r.thumbnail && r.image_count === 0) b.no_media++
    if (r.material_tier_keys.length > 0) b.with_material_tiers++
    if (r.finish_color_executions_count >= 2) b.with_finish_metadata++
    if (r.headboard_model_executions_count >= 2) b.with_headboard_metadata++
    if (!r.has_card_swatches) {
      b.no_swatches++
      if (r.handle) b.handles_no_swatches.push(r.handle)
    }
  }

  const greenwichFinishPalette = new Set<string>()
  for (const r of published.filter((x) => x.collection === "greenwich")) {
    for (const k of r.finish_color_keys) greenwichFinishPalette.add(k)
  }

  const summary = {
    generated_at: new Date().toISOString(),
    store_products_total: products.length,
    kids_resolver_count: kids.products.length,
    published_main_plus_kids: published.length,
    published_with_card_swatches: published.filter((r) => r.has_card_swatches).length,
    published_without_card_swatches: published.filter((r) => !r.has_card_swatches).length,
    by_segment: Object.fromEntries(
      [...new Set(rows.map((r) => r.segment))].map((s) => [
        s,
        rows.filter((r) => r.segment === s).length,
      ])
    ) as Record<string, number>,
    by_collection_published: byCollection,
    greenwich_unified_finish_palette: [...greenwichFinishPalette].sort(),
    kids_breakdown: {
      main_segment_kids: published.filter((r) => r.segment === "kids").length,
      willie_winkie: published.filter((r) => r.collection === "willie-winkie").length,
      oliver_kids: published.filter((r) => r.collection === "oliver-kids").length,
      kids_room_set_only: published.filter(
        (r) =>
          r.segment === "kids" &&
          r.collection !== "willie-winkie" &&
          r.collection !== "oliver-kids"
      ).length,
    },
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const outPath = join(OUT_DIR, "analysis.json")
  writeFileSync(outPath, JSON.stringify({ summary, products: rows }, null, 2), "utf8")
  console.log("Wrote", outPath)
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
