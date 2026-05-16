#!/usr/bin/env node
/**
 * Read-only audit: legacy media sources, price-list match, Yandex roots, duplicate groups.
 * Writes:
 *   data/normalized/legacy-media-source-dedupe-audit.json
 *   docs/storefront/legacy-media-source-dedupe-audit.md
 *
 * No Medusa/seed/catalog mutations. No file copies.
 */

import crypto from "crypto"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, "..")

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"])

const DEFAULT_WHITE_BG_CANDIDATES = [
  "/WOODRIGHT/Контент /Фото на белом фоне",
  "/Users/leonidmbp/Yandex.Disk/WOODRIGHT/Контент /Фото на белом фоне",
  "/Users/leonidmbp/Yandex Disk/WOODRIGHT/Контент /Фото на белом фоне",
]

function readJson(rel) {
  const abs = path.join(REPO, rel)
  if (!fs.existsSync(abs)) return null
  return JSON.parse(fs.readFileSync(abs, "utf8"))
}

function normSku(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "-")
}

function isDir(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function countImagesUnder(root, maxFiles = 5000) {
  let count = 0
  const walk = (dir, depth) => {
    if (count >= maxFiles || depth > 8) return
    let ents
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of ents) {
      if (count >= maxFiles) return
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git") continue
        walk(full, depth + 1)
      } else if (ent.isFile() && IMAGE_EXT.has(path.extname(ent.name).toLowerCase())) {
        count++
      }
    }
  }
  if (isDir(root)) walk(root, 0)
  return count
}

function normalizeBasename(filename) {
  let b = String(filename || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .toLowerCase()
  b = b.replace(/\.(jpe?g|png|webp|gif|avif)$/i, "")
  b = b.replace(/(\s*\(\d+\)|[-_\s]+(copy|копия)(?=$|[-_.\s])|[-_](\d+)(?=\.))/gi, "")
  b = b.replace(/[-_]+/g, "-").replace(/^-+|-+$/g, "")
  return b
}

function resolveWhiteBgRoots() {
  const fromEnv = []
  if (process.env.WOODRIGHT_WHITE_BG_ROOT?.trim()) fromEnv.push(process.env.WOODRIGHT_WHITE_BG_ROOT.trim())
  if (process.env.WOODRIGHT_WHITE_BG_ROOTS?.trim()) {
    for (const p of process.env.WOODRIGHT_WHITE_BG_ROOTS.split(":")) {
      if (p.trim()) fromEnv.push(p.trim())
    }
  }
  const candidates = [...fromEnv, ...DEFAULT_WHITE_BG_CANDIDATES]
  const seen = new Set()
  const out = []
  for (const p of candidates) {
    const abs = path.resolve(p)
    if (seen.has(abs)) continue
    seen.add(abs)
    out.push({
      path: abs,
      mounted: isDir(abs),
      image_count_estimate: isDir(abs) ? countImagesUnder(abs, 8000) : 0,
    })
  }
  return out
}

function skuSetFromWorkbook() {
  const map = readJson("data/normalized/product-workbook-asset-map.json")
  const parsed = readJson("data/raw/workbook/parsed-sheets.json")
  const skus = new Set()
  if (map?.rows) {
    for (const row of map.rows) {
      const c = row.product_code_normalized || row.medusa_handle_candidate
      if (c) skus.add(normSku(c))
    }
  }
  if (parsed?.sheets) {
    for (const sheet of Object.values(parsed.sheets)) {
      const rows = sheet?.rows ?? sheet
      if (!Array.isArray(rows)) continue
      for (const row of rows) {
        const code = row.product_code || row.code || row.sku || row.article
        if (code) skus.add(normSku(code))
      }
    }
  }
  return skus
}

function duplicateStatsForInventory(items) {
  const byDg = new Map()
  const byHash = new Map()
  const byBn = new Map()
  for (const it of items) {
    if (it.duplicate_group_key) {
      const list = byDg.get(it.duplicate_group_key) ?? []
      list.push(it.id)
      byDg.set(it.duplicate_group_key, list)
    }
    if (it.content_quick_hash) {
      const k = `${it.content_quick_hash}|${normalizeBasename(it.filename)}`
      const list = byHash.get(k) ?? []
      list.push(it.id)
      byHash.set(k, list)
    }
    const bn = normalizeBasename(it.filename)
    if (bn) {
      const list = byBn.get(bn) ?? []
      list.push(it.id)
      byBn.set(bn, list)
    }
  }
  const dgMulti = [...byDg.values()].filter((l) => l.length > 1).length
  const hashMulti = [...byHash.values()].filter((l) => l.length > 1).length
  const bnMulti = [...byBn.values()].filter((l) => l.length > 1).length
  return { duplicate_group_multi: dgMulti, hash_basename_multi: hashMulti, basename_multi: bnMulti }
}

function skusFromInventory(items) {
  const s = new Set()
  for (const it of items) {
    if (it.sku_hint) s.add(normSku(it.sku_hint))
    if (it.handle_hint) s.add(normSku(it.handle_hint))
  }
  return s
}

function topDuplicateHeavySkus(items, limit = 12) {
  const bySku = new Map()
  for (const it of items) {
    const sku = normSku(it.sku_hint || it.handle_hint || "")
    if (!sku) continue
    const dg = it.duplicate_group_key
    if (!dg) continue
    const acc = bySku.get(sku) ?? { sku, groups: new Map(), items: 0 }
    acc.items++
    const g = acc.groups.get(dg) ?? []
    g.push(it.filename)
    acc.groups.set(dg, g)
    bySku.set(sku, acc)
  }
  return [...bySku.values()]
    .map((x) => ({
      sku: x.sku,
      inventory_items: x.items,
      duplicate_groups_with_2plus: [...x.groups.values()].filter((l) => l.length > 1).length,
      example_filenames: [...x.groups.values()].flat().slice(0, 6),
    }))
    .sort((a, b) => b.duplicate_groups_with_2plus - a.duplicate_groups_with_2plus)
    .slice(0, limit)
}

function main() {
  const invDoc = readJson("data/normalized/legacy-media-inventory.json")
  const boardProducts = readJson("data/normalized/legacy-media-board-products.json")
  const seedProducts = readJson("data/normalized/seed-products.json")
  const candMap = readJson("data/normalized/legacy-media-product-candidate-map.json")
  const entityMapping = readJson("data/normalized/entity-mapping.json")

  const items = invDoc?.items ?? []
  const boardList = boardProducts?.products ?? seedProducts?.products ?? []
  const boardSkus = new Set(boardList.map((p) => normSku(p.sku || p.handle)))
  const priceSkus = skuSetFromWorkbook()
  const invSkus = skusFromInventory(items)
  const whiteBgRoots = resolveWhiteBgRoots()

  const inAllThree = [...boardSkus].filter((s) => priceSkus.has(s) && invSkus.has(s))
  const mediaNotPrice = [...invSkus].filter((s) => !priceSkus.has(s))
  const priceNotMedia = [...priceSkus].filter((s) => !invSkus.has(s))
  const boardNotPrice = [...boardSkus].filter((s) => !priceSkus.has(s))

  const dupStats = duplicateStatsForInventory(items)
  const heavy = topDuplicateHeavySkus(items)

  const exampleGroups = []
  const seenDg = new Set()
  for (const it of items) {
    const dg = it.duplicate_group_key
    if (!dg || seenDg.has(dg)) continue
    const siblings = items.filter((x) => x.duplicate_group_key === dg)
    if (siblings.length < 2) continue
    seenDg.add(dg)
    exampleGroups.push({
      duplicate_group_key: dg,
      sku_hint: siblings[0].sku_hint,
      filenames: siblings.map((x) => x.filename),
      paths: siblings.map((x) => x.repo_relative_path || x.source_path).slice(0, 4),
    })
    if (exampleGroups.length >= 8) break
  }

  const audit = {
    audit_meta: {
      pass_name: "legacy_media_source_dedupe_audit",
      pass_kind: "read_only_no_apply",
      generated_at: new Date().toISOString(),
      generated_by: "scripts/build-legacy-media-source-dedupe-audit.mjs",
      constraints: [
        "No Medusa/seed/catalog-scope/production apply.",
        "Yandex roots scanned read-only when mounted; no asset copy into repo.",
        "Board suggestions use legacy-media-dedupe.ts client-side grouping.",
      ],
    },
    source_availability: {
      legacy_inventory: Boolean(invDoc),
      legacy_inventory_items: items.length,
      candidate_map: Boolean(candMap),
      candidate_map_rows: candMap?.entries?.length ?? candMap?.rows?.length ?? null,
      board_products_index: Boolean(boardProducts),
      board_product_count: boardList.length,
      seed_products: Boolean(seedProducts),
      entity_mapping: Boolean(entityMapping),
      product_workbook_map: Boolean(readJson("data/normalized/product-workbook-asset-map.json")),
      parsed_workbook_sheets: Boolean(readJson("data/raw/workbook/parsed-sheets.json")),
      retail_price_xlsx: fs.existsSync(path.join(REPO, "data/raw/workbook/source/retail-price-current.xlsx")),
    },
    yandex_white_bg_roots: whiteBgRoots,
    yandex_mounted_count: whiteBgRoots.filter((r) => r.mounted).length,
    yandex_image_estimate_total: whiteBgRoots.reduce((n, r) => n + (r.image_count_estimate || 0), 0),
    sku_match_summary: {
      board_skus: boardSkus.size,
      price_list_skus: priceSkus.size,
      inventory_skus: invSkus.size,
      matched_board_price_inventory: inAllThree.length,
      inventory_skus_not_in_price_list: mediaNotPrice.length,
      price_list_skus_without_inventory_media: priceNotMedia.length,
      board_skus_without_price_list_match: boardNotPrice.length,
      sample_inventory_not_in_price: mediaNotPrice.slice(0, 20),
      sample_price_without_media: priceNotMedia.slice(0, 20),
      sample_board_without_price: boardNotPrice.slice(0, 20),
    },
    duplicate_summary: {
      ...dupStats,
      inventory_items_total: items.length,
      top_duplicate_heavy_skus: heavy,
      example_exact_duplicate_groups: exampleGroups,
    },
    board_suggestion_changes: {
      description:
        "Legacy Media Assignment Board groups suggestions per SKU+color, dedupes exact/near duplicates via duplicate_group_key/content_quick_hash/basename, picks canonical white-bg/previewable primary, hides duplicates from card strip (Details only).",
      confirm_all_uses_deduped_gallery: true,
      color_needs_review_bucket: "color_needs_review when filename has no color token",
    },
    manual_followups: [
      "SKUs in inventory but not in price list need workbook row or naming fix.",
      "Mounted Yandex roots: verify white-bg files are linked in inventory on next inventory rebuild (out of scope here).",
      "possible_duplicate near-matches still require human review in Details.",
    ],
  }

  const jsonPath = path.join(REPO, "data/normalized/legacy-media-source-dedupe-audit.json")
  fs.writeFileSync(jsonPath, `${JSON.stringify(audit, null, 2)}\n`)

  const md = `# Legacy media source dedupe audit

Generated: ${audit.audit_meta.generated_at}

## Source availability

| Source | Available |
|--------|-----------|
| legacy-media-inventory.json | ${audit.source_availability.legacy_inventory} (${audit.source_availability.legacy_inventory_items} items) |
| legacy-media-board-products.json | ${audit.source_availability.board_products_index} (${audit.source_availability.board_product_count} products) |
| product-workbook-asset-map | ${audit.source_availability.product_workbook_map} |
| retail-price-current.xlsx | ${audit.source_availability.retail_price_xlsx} |

## Yandex white-background roots

${whiteBgRoots
  .map(
    (r) =>
      `- \`${r.path}\` — ${r.mounted ? `mounted, ~${r.image_count_estimate} images (cap 8k scan)` : "not mounted"}`
  )
  .join("\n")}

## SKU crosswalk

- Board SKUs: **${audit.sku_match_summary.board_skus}**
- Price list / workbook SKUs: **${audit.sku_match_summary.price_list_skus}**
- Inventory SKUs: **${audit.sku_match_summary.inventory_skus}**
- Matched (board ∩ price ∩ inventory): **${audit.sku_match_summary.matched_board_price_inventory}**
- Inventory not in price list: **${audit.sku_match_summary.inventory_skus_not_in_price_list}**
- Price list without inventory media: **${audit.sku_match_summary.price_list_skus_without_inventory_media}**
- Board without price list: **${audit.sku_match_summary.board_skus_without_price_list_match}**

## Duplicate summary

- duplicate_group_key groups with 2+ items: **${dupStats.duplicate_group_multi}**
- content_quick_hash+basename groups with 2+: **${dupStats.hash_basename_multi}**
- normalized basename groups with 2+: **${dupStats.basename_multi}**

### Top duplicate-heavy SKUs

${heavy.map((h) => `- \`${h.sku}\`: ${h.duplicate_groups_with_2plus} multi-item groups (${h.inventory_items} inventory rows)`).join("\n") || "(none)"}

## Board changes

${audit.board_suggestion_changes.description}

## Manual follow-ups

${audit.manual_followups.map((x) => `- ${x}`).join("\n")}

Full JSON: \`data/normalized/legacy-media-source-dedupe-audit.json\`
`

  const mdPath = path.join(REPO, "docs/storefront/legacy-media-source-dedupe-audit.md")
  fs.writeFileSync(mdPath, md)

  console.log("wrote", jsonPath)
  console.log("wrote", mdPath)
  console.log(
    JSON.stringify({
      yandex_mounted: audit.yandex_mounted_count,
      dup_groups: dupStats.duplicate_group_multi,
      matched_skus: inAllThree.length,
    })
  )
}

main()
