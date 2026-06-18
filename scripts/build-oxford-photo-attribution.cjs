#!/usr/bin/env node
/**
 * Oxford collection photos without product_code_hint → attribution queue for operators.
 * Output: data/normalized/oxford-photo-attribution.json
 */
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")
const frontPath = path.join(ROOT, "data/raw/front/front-manifest.json")
const outPath = path.join(ROOT, "data/normalized/oxford-photo-attribution.json")

const fm = JSON.parse(fs.readFileSync(frontPath, "utf8"))
const list = Array.isArray(fm) ? fm : []

const oxford = list.filter(
  (a) =>
    (a.collection_hint || "").toLowerCase() === "oxford" &&
    !a.product_code_hint
)

const payload = {
  generated_at: new Date().toISOString(),
  source: "data/raw/front/front-manifest.json",
  collection: "oxford",
  status: "needs_manual_attribution",
  count: oxford.length,
  items: oxford.map((a) => ({
    asset_id: a.asset_id,
    filename: a.filename,
    source_ref: a.source_ref,
    source_type: a.source_type,
    likely_asset_kind: a.likely_asset_kind,
    operator_action: "map_photo_to_workbook_sku",
    suggested_workbook_lookup: "oxford rows in parsed-sheets.json",
  })),
}

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2))
console.log("Wrote", outPath, "items:", payload.count)
