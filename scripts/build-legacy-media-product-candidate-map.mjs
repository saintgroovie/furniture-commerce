/**
 * Read-only matcher: legacy-media-inventory → seed-products (no DB, no apply).
 *
 * Usage (repo root):
 *   node scripts/build-legacy-media-product-candidate-map.mjs
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, "..")

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"))
}

function normSku(s) {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
}

function basenameUrl(u) {
  try {
    const s = String(u ?? "").split("?")[0]
    const parts = s.split("/")
    return parts[parts.length - 1] || ""
  } catch {
    return ""
  }
}

function buildProducts(seedPath) {
  const rows = readJson(seedPath)
  if (!Array.isArray(rows)) return []
  const out = []
  for (const r of rows) {
    const handle = String(r.medusa_product_handle ?? "").trim().toLowerCase()
    if (!handle) continue
    const sku = normSku(r.medusa_variant_sku ?? r.product_code_normalized)
    const coll = String(r.medusa_collection_handle ?? "").trim().toLowerCase()
    const title = r.medusa_product_title != null ? String(r.medusa_product_title) : null
    const imageBasenames = new Set()
    const urls = []
    if (r.thumbnail_url) urls.push(String(r.thumbnail_url))
    const imgs = r.images ?? r.image_urls ?? []
    for (const im of imgs) {
      const u = typeof im === "string" ? im : im?.url
      if (u) urls.push(String(u))
    }
    for (const u of urls) {
      const b = basenameUrl(u).toLowerCase()
      if (b) imageBasenames.add(b)
    }
    out.push({ handle, sku, collection: coll, title, imageBasenames })
  }
  return out
}

function scoreRow(inv, products) {
  const hay = `${inv.source_path ?? ""} ${inv.repo_relative_path ?? ""} ${inv.filename ?? ""} ${inv.sku_hint ?? ""} ${inv.handle_hint ?? ""}`
    .toUpperCase()
    .replace(/\\/g, "/")
  const fnLower = String(inv.filename ?? "").toLowerCase()
  const collHint = String(inv.collection_hint ?? "").trim().toLowerCase()

  const scored = []
  for (const p of products) {
    let score = 0
    const basis = []
    const skuH = inv.sku_hint != null ? normSku(inv.sku_hint) : ""
    if (skuH && skuH === p.sku) {
      score += 120
      basis.push("exact_sku_hint")
    }
    if (p.sku && (hay.includes(p.sku) || fnLower.includes(p.sku.toLowerCase().replace(/-/g, "")))) {
      if (!basis.includes("exact_sku_hint")) {
        score += 95
        basis.push("sku_in_filename_or_path")
      }
    }
    if (p.handle && hay.includes(p.handle.toUpperCase())) {
      score += 70
      basis.push("handle_token_in_haystack")
    }
    if (p.handle && fnLower.includes(p.handle.toLowerCase())) {
      score += 55
      basis.push("handle_in_filename")
    }
    if (collHint && collHint === p.collection) {
      score += 15
      basis.push("collection_hint_match")
    }
    if (fnLower && p.imageBasenames.has(fnLower)) {
      score += 80
      basis.push("basename_matches_existing_product_image")
    }
    if (score > 0) {
      scored.push({ handle: p.handle, sku: p.sku, collection: p.collection, title: p.title, score, basis: [...new Set(basis)] })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  return scored
}

function identityConfidence(scored) {
  if (!scored.length) return { tier: "unmatched", basis: null, top: null, second: null }
  const top = scored[0]
  const second = scored[1] ?? null
  if (top.score >= 120) return { tier: "confirmed", basis: top.basis.join("+"), top, second }
  if (top.score >= 95 && (!second || top.score - second.score >= 25)) {
    return { tier: "confirmed", basis: top.basis.join("+"), top, second }
  }
  if (top.score >= 80 && (!second || top.score - second.score >= 20)) {
    return { tier: "probable", basis: top.basis.join("+"), top, second }
  }
  if (second && top.score - second.score < 15) {
    return { tier: "ambiguous", basis: "multiple_close_scores", top, second }
  }
  if (top.score >= 50) return { tier: "probable", basis: top.basis.join("+"), top, second }
  if (top.score > 0) return { tier: "ambiguous", basis: top.basis.join("+"), top, second }
  return { tier: "unmatched", basis: null, top: null, second: null }
}

function main() {
  const generatedAt = new Date().toISOString()
  const invPath = path.join(REPO, "data/normalized/legacy-media-inventory.json")
  const seedPath = path.join(REPO, "data/normalized/seed-products.json")

  const invDoc = readJson(invPath)
  const items = invDoc.items ?? []
  const products = buildProducts(seedPath)

  const entries = []
  let cConfirmed = 0
  let cProbable = 0
  let cAmbiguous = 0
  let cUnmatched = 0
  let cUnpreviewable = 0
  let cMatchedPreviewable = 0

  for (const inv of items) {
    const scored = scoreRow(inv, products).slice(0, 8)
    const idc = identityConfidence(scored)
    const hasRef = Boolean((inv.source_path && String(inv.source_path).length > 0) || (inv.url && String(inv.url).length > 0))
    const previewable = inv.previewable === true

    let confidence = idc.tier
    if (!previewable && hasRef) {
      confidence = "unpreviewable"
      cUnpreviewable++
    } else {
      if (idc.tier === "confirmed") cConfirmed++
      else if (idc.tier === "probable") cProbable++
      else if (idc.tier === "ambiguous") cAmbiguous++
      else cUnmatched++
    }

    if (previewable && idc.tier !== "unmatched") cMatchedPreviewable++

    const topCandidates = scored.slice(0, 5).map((s) => ({
      medusa_product_handle: s.handle,
      medusa_variant_sku: s.sku,
      medusa_collection_handle: s.collection,
      product_title: s.title,
      score: s.score,
      basis: s.basis,
    }))

    entries.push({
      inventory_id: inv.id,
      confidence,
      identity_confidence: idc.tier,
      identity_match_basis: idc.basis,
      previewable,
      top_candidate: idc.top
        ? {
            medusa_product_handle: idc.top.handle,
            medusa_variant_sku: idc.top.sku,
            medusa_collection_handle: idc.top.collection,
            score: idc.top.score,
            basis: idc.top.basis,
          }
        : null,
      candidates: topCandidates,
      filename: inv.filename,
      source_type: inv.source_type,
      source_path: inv.source_path,
      repo_relative_path: inv.repo_relative_path,
    })
  }

  const summary = {
    inventory_items: items.length,
    products_indexed: products.length,
    by_confidence: {
      confirmed: cConfirmed,
      probable: cProbable,
      ambiguous: cAmbiguous,
      unmatched: cUnmatched,
      unpreviewable: cUnpreviewable,
    },
    note: "confidence uses unpreviewable when previewable=false but a path/url ref exists; identity_confidence holds the SKU/handle heuristic tier.",
  }

  const out = {
    audit_meta: {
      pass_name: "legacy_media_product_candidate_map",
      pass_kind: "read_only_matching_no_db",
      generated_at: generatedAt,
      generated_by: "scripts/build-legacy-media-product-candidate-map.mjs",
      source_products_artifact: "data/normalized/seed-products.json",
      source_inventory_artifact: "data/normalized/legacy-media-inventory.json",
      source_limitation:
        "Matching uses repo-normalized seed-products.json only; no live Store/Admin API. If seed is stale vs Medusa DB, re-export seed before relying on handles/SKUs.",
      constraints: [
        "No automatic confirmed media in production.",
        "Legacy paths are hints; unmatched/orphan rows are preserved.",
      ],
    },
    summary,
    entries,
  }

  const outPath = path.join(REPO, "data/normalized/legacy-media-product-candidate-map.json")
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf-8")

  const template = {
    review_meta: {
      scope: "legacy_media_assignment_board",
      status: "manual_review_pending",
      created_at: generatedAt,
      local_dev_only: true,
      production_rollout: false,
      notes:
        "Export from /qa/legacy-media-assignment-board overwrites-compatible shape: assignments + rejections. No backend apply in-repo.",
    },
    assignments: [],
    rejections: [],
    lane_orders: {},
  }
  const templatePath = path.join(REPO, "data/normalized/legacy-media-assignment-decisions.template.json")
  fs.writeFileSync(templatePath, JSON.stringify(template, null, 2) + "\n", "utf-8")

  const mdPath = path.join(REPO, "docs/storefront/legacy-media-product-candidate-map.md")
  const md = `# Legacy media → product candidate map

Generated **${generatedAt.slice(0, 10)}** by \`scripts/build-legacy-media-product-candidate-map.mjs\`.

## Semantics

| Field | Meaning |
|-------|---------|
| **confirmed** | Exact \`sku_hint\` vs seed SKU, strong deterministic path/filename SKU match, or basename matches an existing product image filename. |
| **probable** | Strong filename/handle/collection alignment to a single product, lower deterministic certainty than confirmed. |
| **ambiguous** | Multiple seed products score similarly for the same asset. |
| **unmatched** | No heuristic candidate above threshold. |
| **unpreviewable** | A reference path/URL exists but **no local preview** in this environment (e.g. \`/WOODRIGHT/...\` not mounted). \`identity_confidence\` still records the SKU guess tier. |

## Source limitation

${out.audit_meta.source_limitation}

## Summary counts

| confidence (display) | count |
|---------------------|------:|
| confirmed | ${summary.by_confidence.confirmed} |
| probable | ${summary.by_confidence.probable} |
| ambiguous | ${summary.by_confidence.ambiguous} |
| unmatched | ${summary.by_confidence.unmatched} |
| unpreviewable | ${summary.by_confidence.unpreviewable} |

- Inventory rows: **${summary.inventory_items}**
- Seed products indexed: **${summary.products_indexed}**

## Artifacts

- \`data/normalized/legacy-media-product-candidate-map.json\`
- \`data/normalized/legacy-media-assignment-decisions.template.json\`
- QA UI: \`/qa/legacy-media-assignment-board\` (see \`docs/storefront/legacy-media-assignment-board.md\`)

## Safety

Read-only JSON; no Medusa DB, no catalog-scope, no seed mutation, no production media assignment.
`
  fs.writeFileSync(mdPath, md, "utf-8")

  console.log("Wrote", outPath)
  console.log("Wrote", templatePath)
  console.log("Wrote", mdPath)
  console.log("Summary", summary.by_confidence)
}

main()
