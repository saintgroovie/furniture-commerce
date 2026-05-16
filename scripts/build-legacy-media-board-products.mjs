/**
 * Read-only QA product index for Legacy Media Assignment Board.
 * Merges seed-products.json with governance/workbook rows for paused collections
 * (Oxford, Monchelsea) — does NOT mutate seed-products.json or Medusa.
 *
 * Usage (repo root):
 *   node scripts/build-legacy-media-board-products.mjs
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, "..")

function readJson(rel) {
  const abs = path.join(REPO, rel)
  if (!fs.existsSync(abs)) return null
  return JSON.parse(fs.readFileSync(abs, "utf8"))
}

function normSku(s) {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
}

function normHandle(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "-")
}

function skuToDefaultHandle(sku) {
  const u = normSku(sku)
  if (!u) return ""
  if (/^OX-/i.test(u)) return u.toLowerCase()
  if (/^S-OX-/i.test(u)) return u.toLowerCase()
  if (/^MN/i.test(u)) return u.toLowerCase().replace(/^mnm-/, "mnm-")
  return u.toLowerCase()
}

function basenameUrl(u) {
  try {
    const s = String(u ?? "").split("?")[0]
    return (s.split("/").pop() || "").toLowerCase()
  } catch {
    return ""
  }
}

function collectUrls(row) {
  const urls = []
  if (row.thumbnail_url) urls.push(String(row.thumbnail_url))
  if (row.main_image_url) urls.push(String(row.main_image_url))
  const imgs = row.images ?? row.image_urls ?? []
  for (const im of imgs) {
    const u = typeof im === "string" ? im : im?.url
    if (u) urls.push(String(u))
  }
  const keys = [
    ...(row.upload_manifest_refs ?? []),
    ...(row.gallery_storage_keys ?? []),
    row.main_image_storage_key,
  ].filter(Boolean)
  for (const k of keys) {
    const name = String(k).split("/").pop()
    if (name) urls.push(`http://localhost:9000/static/${String(k).replace(/^\/+/, "")}`)
  }
  return urls
}

function productRowFromSeed(row, source) {
  const handle = normHandle(row.medusa_product_handle)
  if (!handle) return null
  const urls = collectUrls(row)
  return {
    handle,
    sku: normSku(row.medusa_variant_sku ?? row.product_code_normalized),
    collection: normHandle(row.medusa_collection_handle ?? ""),
    title: row.medusa_product_title != null ? String(row.medusa_product_title) : row.canonical_name != null ? String(row.canonical_name) : null,
    image_urls: urls,
    image_basenames: urls.map(basenameUrl).filter(Boolean),
    qa_product_source: source,
    governance_status: null,
  }
}

function addProduct(map, row) {
  if (!row?.handle) return
  const key = row.handle
  const prev = map.get(key)
  if (!prev || (prev.qa_product_source === "seed-products.json" && row.qa_product_source !== "seed-products.json")) {
    map.set(key, row)
    return
  }
  if (prev) {
    const basenames = new Set([...(prev.image_basenames ?? []), ...(row.image_basenames ?? [])])
    const urls = [...new Set([...(prev.image_urls ?? []), ...(row.image_urls ?? [])])]
    map.set(key, {
      ...prev,
      title: prev.title || row.title,
      sku: prev.sku || row.sku,
      image_urls: urls,
      image_basenames: [...basenames],
      qa_product_source: prev.qa_product_source,
      alt_sources: [...new Set([...(prev.alt_sources ?? []), row.qa_product_source])],
    })
  }
}

function fromWorkbookRow(wb) {
  const coll = normHandle(wb.collection_name_normalized)
  if (coll !== "oxford" && coll !== "monchelsea") return null
  const sku = normSku(wb.product_code_normalized)
  const handle = normHandle(wb.medusa_handle_candidate || wb.medusa_product_handle || skuToDefaultHandle(sku))
  if (!handle && !sku) return null
  const urls = collectUrls(wb)
  return {
    handle: handle || skuToDefaultHandle(sku),
    sku: sku || normSku(wb.monchelsea_join_key),
    collection: coll,
    title: wb.canonical_name != null ? String(wb.canonical_name) : null,
    image_urls: urls,
    image_basenames: urls.map(basenameUrl).filter(Boolean),
    qa_product_source: "product-workbook-asset-map.json",
    governance_status: wb.classification ?? null,
    workbook_row_key: wb.workbook_row_key ?? null,
    monchelsea_join_key: wb.monchelsea_join_key ?? null,
  }
}

function fromEntityMapping(row) {
  const coll = normHandle(row.medusa_collection_handle ?? row.collection_name_normalized)
  if (coll !== "oxford" && coll !== "monchelsea") return null
  return productRowFromSeed(row, "entity-mapping.json")
}

function main() {
  const generatedAt = new Date().toISOString()
  const map = new Map()

  const seed = readJson("data/normalized/seed-products.json")
  if (Array.isArray(seed)) {
    for (const r of seed) {
      const p = productRowFromSeed(r, "seed-products.json")
      if (p) addProduct(map, p)
    }
  }

  const pilot = readJson("data/normalized/seed-products.oxford-pilot-four.json")
  if (Array.isArray(pilot)) {
    for (const r of pilot) {
      const p = productRowFromSeed(r, "seed-products.oxford-pilot-four.json")
      if (p) addProduct(map, p)
    }
  }

  const em = readJson("data/normalized/entity-mapping.json")
  if (Array.isArray(em)) {
    for (const r of em) {
      const p = fromEntityMapping(r)
      if (p) addProduct(map, p)
    }
  }

  const wbDoc = readJson("data/normalized/product-workbook-asset-map.json")
  const wbRows = wbDoc?.rows ?? []
  for (const r of wbRows) {
    const p = fromWorkbookRow(r)
    if (p) addProduct(map, p)
  }

  const products = [...map.values()].sort((a, b) => {
    const c = (a.collection || "").localeCompare(b.collection || "")
    if (c !== 0) return c
    return a.handle.localeCompare(b.handle)
  })

  const byCollection = {}
  for (const p of products) {
    const c = p.collection || "(none)"
    byCollection[c] = (byCollection[c] || 0) + 1
  }

  const out = {
    audit_meta: {
      pass_name: "legacy_media_board_products",
      pass_kind: "read_only_qa_index_no_seed_mutation",
      generated_at: generatedAt,
      generated_by: "scripts/build-legacy-media-board-products.mjs",
      sources: [
        "data/normalized/seed-products.json",
        "data/normalized/seed-products.oxford-pilot-four.json",
        "data/normalized/entity-mapping.json (oxford/monchelsea only)",
        "data/normalized/product-workbook-asset-map.json (oxford/monchelsea only)",
      ],
      constraints: [
        "Does not modify seed-products.json or Medusa DB.",
        "Oxford/Monchelsea rows are QA review targets; paused rollout unchanged.",
      ],
    },
    summary: {
      total_products: products.length,
      by_collection: byCollection,
      oxford_count: byCollection.oxford ?? 0,
      monchelsea_count: byCollection.monchelsea ?? 0,
    },
    products,
  }

  const outPath = path.join(REPO, "data/normalized/legacy-media-board-products.json")
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n")
  console.log("Wrote", outPath)
  console.log("summary", out.summary)
}

main()
