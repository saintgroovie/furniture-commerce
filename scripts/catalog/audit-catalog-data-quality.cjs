#!/usr/bin/env node
/**
 * Read-only catalog data quality audit (buyer Store API / public JSON when available).
 * Does not mutate catalog. Exit non-zero only on technical failure.
 */
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const https = require("https")
const http = require("http")

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const lib = u.protocol === "https:" ? https : http
    const req = lib.request(
      u,
      { method: "GET", headers: { Accept: "application/json", ...headers }, timeout: 60000 },
      (res) => {
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8")
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} for ${url}`))
            return
          }
          try {
            resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(body) })
          } catch (e) {
            reject(new Error(`JSON parse failed for ${url}: ${e.message}`))
          }
        })
      }
    )
    req.on("error", reject)
    req.on("timeout", () => {
      req.destroy()
      reject(new Error("timeout"))
    })
    req.end()
  })
}

function inferClass(p) {
  const title = String(p.title || "").toLowerCase()
  const handle = String(p.handle || "").toLowerCase()
  const md = p.metadata && typeof p.metadata === "object" ? p.metadata : {}
  // Prefer structured metadata (catalog-products projection) before title fallback.
  const category =
    p.category_handle ||
    md.category_handle ||
    p.categories?.[0]?.handle ||
    p.collection?.metadata?.category_handle ||
    null
  const category_source = p.category_handle
    ? "top.category_handle"
    : md.category_handle
      ? "metadata.category_handle"
      : p.categories?.[0]?.handle
        ? "categories[].handle"
        : null
  const collection =
    (typeof p.collection === "object" && p.collection?.handle) ||
    (typeof p.collection === "string" ? p.collection : null) ||
    md.collection ||
    md.collection_label ||
    null
  const collection_source =
    typeof p.collection === "object" && p.collection?.handle
      ? "collection.handle"
      : md.collection
        ? "metadata.collection"
        : md.collection_label
          ? "metadata.collection_label"
          : null
  let inferred = "unknown"
  let confidence = "low"
  let reason = "insufficient signals"
  const isMirror = /зеркал/.test(title) || /mirror/.test(handle)
  const isClock = /час/.test(title) || /clock/.test(handle)
  const isFurnitureWord = /(кровать|шкаф|стол|стул|комод|тумб|диван|кресл|стеллаж|банкетк|письмен)/.test(
    title
  )
  if (isFurnitureWord && isMirror) {
    inferred = "furniture_with_mirror"
    confidence = "medium"
    reason = "furniture title contains mirror keyword"
  } else if (isMirror && !isFurnitureWord) {
    inferred = "pure_mirror"
    confidence = "medium"
    reason = "mirror without furniture keywords"
  } else if (isClock) {
    inferred = "clock"
    confidence = "medium"
    reason = "clock title"
  } else if (category) {
    inferred = "categorized"
    confidence = "high"
    reason = `category_handle=${category} via ${category_source}`
  } else if (isFurnitureWord) {
    inferred = "furniture_title_fallback"
    confidence = "low"
    reason = "title fallback without category_handle"
  }
  return { category, collection, category_source, collection_source, inferred, confidence, reason }
}

function analyzeProducts(products, marker) {
  const rows = []
  const counts = {
    total: products.length,
    missing_category_handle: 0,
    missing_collection: 0,
    title_fallback: 0,
    unknown_tier: 0,
    ambiguous_mirror: 0,
    pure_mirrors: 0,
    clocks: 0,
    missing_primary_media: 0,
  }
  for (const p of products) {
    const info = inferClass(p)
    const missingCat = !info.category
    const missingCol = !info.collection
    if (missingCat) counts.missing_category_handle++
    if (missingCol) counts.missing_collection++
    if (info.inferred === "furniture_title_fallback") counts.title_fallback++
    if (info.inferred === "unknown") counts.unknown_tier++
    if (info.inferred === "furniture_with_mirror") counts.ambiguous_mirror++
    if (info.inferred === "pure_mirror") counts.pure_mirrors++
    if (info.inferred === "clock") counts.clocks++
    const thumb = p.thumbnail || p.images?.[0]?.url
    if (!thumb) counts.missing_primary_media++
    rows.push({
      id: p.id,
      handle: p.handle,
      title: p.title,
      collection: info.collection,
      category: info.category,
      category_source: info.category_source,
      collection_source: info.collection_source,
      type: p.type?.value || p.type || null,
      inferred_class: info.inferred,
      confidence: info.confidence,
      reason: info.reason,
      buyer_visible_impact:
        missingCat || info.inferred === "furniture_title_fallback"
          ? "merchandising may use title fallback"
          : "none_or_low",
      recommended_owner_action: missingCat
        ? "Catalog Owner Review: confirm category_handle"
        : "none",
      auto_mutation_allowed: false,
      marker,
    })
  }
  return { counts, rows }
}

function writeOutputs(outDir, payload) {
  fs.mkdirSync(outDir, { recursive: true })
  const inventoryPath = path.join(outDir, "catalog-data-quality-inventory.json")
  const csvPath = path.join(outDir, "catalog-owner-review.csv")
  const summaryPath = path.join(outDir, "catalog-data-quality-summary.md")
  const baselinePath = path.join(outDir, "catalog-data-quality-baseline.json")
  fs.writeFileSync(inventoryPath, JSON.stringify(payload, null, 2) + "\n")
  const header = [
    "id",
    "handle",
    "title",
    "collection",
    "category",
    "inferred_class",
    "confidence",
    "reason",
    "buyer_visible_impact",
    "recommended_owner_action",
    "auto_mutation_allowed",
  ]
  const lines = [header.join(",")]
  for (const r of payload.rows) {
    lines.push(
      header
        .map((h) => {
          const v = r[h]
          const s = v == null ? "" : String(v)
          return `"${s.replace(/"/g, '""')}"`
        })
        .join(",")
    )
  }
  fs.writeFileSync(csvPath, lines.join("\n") + "\n")
  const c = payload.counts
  fs.writeFileSync(
    summaryPath,
    [
      `# Catalog data quality summary`,
      ``,
      `- generated_at: ${payload.generated_at}`,
      `- source: ${payload.source_url}`,
      `- release_marker: ${payload.marker || "unknown"}`,
      `- product_count: ${c.total}`,
      `- missing_category_handle: ${c.missing_category_handle}`,
      `- missing_collection: ${c.missing_collection}`,
      `- title_fallback: ${c.title_fallback}`,
      `- unknown_tier: ${c.unknown_tier}`,
      `- ambiguous_mirror: ${c.ambiguous_mirror}`,
      `- pure_mirrors: ${c.pure_mirrors}`,
      `- clocks: ${c.clocks}`,
      `- missing_primary_media: ${c.missing_primary_media}`,
      `- mutations: none`,
      `- durable_note: regenerate via scripts/catalog/audit-catalog-data-quality.cjs`,
      ``,
    ].join("\n")
  )
  const baseline = {
    timestamp: payload.generated_at,
    release_sha: payload.release_sha || null,
    marker: payload.marker,
    total_published: c.total,
    missing_category_count: c.missing_category_handle,
    missing_collection_count: c.missing_collection,
    title_fallback_count: c.title_fallback,
    unknown_tier_count: c.unknown_tier,
    ambiguous_classification_count: c.ambiguous_mirror,
    missing_media_count: c.missing_primary_media,
  }
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n")
  const checksums = {}
  for (const f of [inventoryPath, csvPath, summaryPath, baselinePath]) {
    checksums[path.basename(f)] = crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex")
  }
  fs.writeFileSync(path.join(outDir, "SHA256SUMS"), Object.entries(checksums).map(([k, v]) => `${v}  ${k}`).join("\n") + "\n")
  return { inventoryPath, csvPath, summaryPath, baselinePath, checksums }
}

function assertReadOnlySource() {
  const src = fs.readFileSync(__filename, "utf8")
  // Strip line comments before scanning so documentation cannot false-positive.
  const code = src.replace(/^\s*\/\/.*$/gm, "")
  for (const m of MUTATION_METHODS) {
    if (new RegExp(`method:\\s*['"]${m}['"]`).test(code)) {
      throw new Error(`catalog audit must not use ${m}`)
    }
  }
}

async function main() {
  assertReadOnlySource()
  const args = process.argv.slice(2)
  if (args[0] === "--self-test-readonly") {
    assertReadOnlySource()
    console.log("PASS catalog audit is GET-only")
    process.exit(0)
  }
  let api = null
  let outDir = null
  let releaseSha = null
  let fixture = null
  let mode = "store-list"
  let headers = {}
  let bundleId = null
  let backendRevision = null
  let storefrontRevision = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--api") api = args[++i]
    if (args[i] === "--out") outDir = args[++i]
    if (args[i] === "--release-sha") releaseSha = args[++i]
    if (args[i] === "--fixture") fixture = args[++i]
    if (args[i] === "--mode") mode = args[++i]
    if (args[i] === "--bundle-id") bundleId = args[++i]
    if (args[i] === "--backend-revision") backendRevision = args[++i]
    if (args[i] === "--storefront-revision") storefrontRevision = args[++i]
    if (args[i] === "--publishable-key-env") {
      const envName = args[++i]
      const v = process.env[envName]
      if (v) headers["x-publishable-api-key"] = v
    }
  }
  if (!outDir) {
    console.error(
      "usage: audit-catalog-data-quality.cjs --out <dir> [--mode store-list|catalog-projection|backend-readonly] [--api <url>] [--fixture <products.json>] [--bundle-id id] [--backend-revision sha] [--storefront-revision sha]"
    )
    process.exit(2)
  }
  let products = []
  let marker = null
  let source_url = fixture || api
  if (fixture) {
    const doc = JSON.parse(fs.readFileSync(fixture, "utf8"))
    products = doc.products || doc
    marker = doc.marker || null
    mode = doc.mode || mode
  } else if (api) {
    const res = await getJson(api, headers)
    marker = res.headers["x-woodright-catalog-order"] || null
    products = res.json.products || res.json.items || res.json || []
    if (!Array.isArray(products)) throw new Error("unexpected API shape")
  } else {
    throw new Error("provide --api or --fixture")
  }
  const { counts, rows } = analyzeProducts(products, marker)
  const payload = {
    generated_at: new Date().toISOString(),
    source_url,
    mode,
    release_sha: releaseSha,
    bundle_id: bundleId,
    backend_revision: backendRevision,
    storefront_revision: storefrontRevision,
    marker,
    counts,
    rows,
    field_sources: {
      category_handle: ["metadata.category_handle", "top.category_handle", "categories[].handle"],
      collection: ["collection.handle", "metadata.collection", "metadata.collection_label"],
    },
    regeneration_command: `node scripts/catalog/audit-catalog-data-quality.cjs --out <dir> --mode ${mode} --api '<url>' --bundle-id ${bundleId || ""}`,
  }
  const paths = writeOutputs(outDir, payload)
  console.log(JSON.stringify({ ok: true, counts, paths, mode }, null, 2))
}

main().catch((e) => {
  console.error("FAIL", e.message || e)
  process.exit(1)
})
