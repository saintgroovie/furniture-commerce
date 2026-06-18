#!/usr/bin/env node
/**
 * Cross-stats: legacy site vs Yandex disk (front-manifest) vs price list (workbook).
 * Output: tmp/media-ops-codex-review/legacy-yandex-pricelist-cross-stats.json
 */
const fs = require("fs")
const path = require("path")

const out = { generated_at: new Date().toISOString(), sources: {}, cross: {}, gaps: [] }

const inv = JSON.parse(fs.readFileSync("data/normalized/legacy-media-inventory.json", "utf8"))
out.sources.legacy_media_inventory = {
  ...inv.summary,
  constraints: inv.audit_meta?.constraints,
  note: "legacy_site_public=0 — inventory scans repo-local paths, not live site URLs",
}

const wb = JSON.parse(fs.readFileSync("data/raw/workbook/parsed-sheets.json", "utf8"))
function collectRows(obj, depth = 0) {
  if (depth > 4) return []
  if (
    Array.isArray(obj) &&
    obj.length &&
    typeof obj[0] === "object" &&
    (obj[0].product_code_normalized || obj[0].product_code_raw)
  ) {
    return obj
  }
  if (obj && typeof obj === "object") {
    for (const v of Object.values(obj)) {
      const r = collectRows(v, depth + 1)
      if (r.length > 50) return r
    }
  }
  return []
}
const wbRows = collectRows(wb)
const collections = {}
for (const r of wbRows) {
  const c = r.collection_name_normalized || r.collection_name_raw || "unknown"
  collections[c] = (collections[c] || 0) + 1
}
out.sources.price_list_workbook = {
  row_count: wbRows.length,
  with_product_code: wbRows.filter((r) => r.product_code_normalized).length,
  collections_top: Object.entries(collections)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12),
}

const seed = JSON.parse(fs.readFileSync("data/normalized/seed-products.json", "utf8"))
const products = seed.products || seed
out.sources.seed_products = {
  count: products.length,
  with_workbook_row_key: products.filter((p) => p.workbook_row_key).length,
  collections: [...new Set(products.map((p) => p.medusa_collection_handle).filter(Boolean))].sort(),
}

const leg = JSON.parse(fs.readFileSync("data/raw/legacy/legacy-products.json", "utf8"))
const legRows = Array.isArray(leg) ? leg : leg.products || []
out.sources.legacy_site_scrape = {
  count: legRows.length,
  with_main_image: legRows.filter((r) => r.main_image_url || r.image_url).length,
  with_page_url: legRows.filter((r) => r.page_url).length,
}

const fmPath = "data/raw/front/front-manifest.json"
if (fs.existsSync(fmPath)) {
  const fm = JSON.parse(fs.readFileSync(fmPath, "utf8"))
  const arr = Array.isArray(fm) ? fm : fm.assets || fm.items || fm.files || []
  const list = Array.isArray(arr) ? arr : Object.values(arr)
  out.sources.yandex_disk_front_manifest = {
    asset_count: list.length,
    with_product_code_hint: list.filter((a) => a.product_code_hint).length,
    white_bg_count: list.filter((a) => a.source_type === "white_bg").length,
    collections: [...new Set(list.map((a) => a.collection_hint || a.collection).filter(Boolean))].sort(),
  }
} else {
  out.sources.yandex_disk_front_manifest = { missing: true }
  out.gaps.push("data/raw/front/front-manifest.json not found")
}

const cat = JSON.parse(
  fs.readFileSync("tmp/legacy-site-media-catalog-ingestion-plan/catalog-source-audit.json", "utf8")
)
out.sources.prior_catalog_audit = {
  governance: cat.governance,
  workbook_direct_handle_matches_among_28:
    cat.sources?.["data/raw/workbook/parsed-sheets.json"]?.direct_handle_matches_among_28,
  legacy_scrape_status: cat.sources?.["data/raw/legacy/legacy-products.json"]?.scrape_status,
}

if (!fs.existsSync("tmp/source-media-completeness-audit-full-legacy-cache")) {
  out.gaps.push(
    "tmp/source-media-completeness-audit-full-legacy-cache MISSING — orphan Inbox bootstrap 404"
  )
}

const seedHandles = new Set(
  products.map((p) => (p.medusa_product_handle || "").toLowerCase()).filter(Boolean)
)
const legHandles = new Set(
  legRows
    .map((r) => (r.handle || r.medusa_product_handle || r.product_code_from_image || "").toLowerCase())
    .filter(Boolean)
)
let overlap = 0
for (const h of seedHandles) if (legHandles.has(h)) overlap++
out.cross.seed_vs_legacy_scrape_handle_overlap = {
  seed: seedHandles.size,
  legacy: legHandles.size,
  overlap,
}

const wbCodes = new Set(wbRows.map((r) => (r.product_code_normalized || "").toLowerCase()).filter(Boolean))
const seedCodes = new Set(
  products.map((p) => (p.product_code_normalized || "").toLowerCase()).filter(Boolean)
)
let codeOverlap = 0
for (const c of wbCodes) if (seedCodes.has(c)) codeOverlap++
out.cross.workbook_vs_seed_code_overlap = {
  workbook_codes: wbCodes.size,
  seed_codes: seedCodes.size,
  overlap: codeOverlap,
}

const outDir = "tmp/media-ops-codex-review"
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, "legacy-yandex-pricelist-cross-stats.json")
fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
console.log("Wrote", outPath)
console.log(JSON.stringify(out, null, 2))
