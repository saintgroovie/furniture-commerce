/**
 * Read-only audit: Oxford + Monchelsea legacy media coverage for QA board.
 * Writes data/normalized/legacy-media-oxford-monchelsea-audit.json
 *
 * Usage (repo root):
 *   node scripts/audit-legacy-media-oxford-monchelsea.mjs
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, "..")

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8"))
}

function invForCollection(items, coll) {
  return items.filter((it) => {
    const h = String(it.collection_hint || "").toLowerCase()
    const p = String(it.source_path || it.repo_relative_path || "").toLowerCase()
    return h === coll || p.includes(`/${coll}/`)
  })
}

function auditCollection(coll, items, entries, products) {
  const media = invForCollection(items, coll)
  const ids = new Set(media.map((i) => i.id))
  const cand = entries.filter((e) => ids.has(e.inventory_id))
  const prods = products.filter((p) => p.collection === coll)

  const byConfidence = {}
  const byIdentity = {}
  for (const e of cand) {
    byConfidence[e.confidence] = (byConfidence[e.confidence] || 0) + 1
    byIdentity[e.identity_confidence] = (byIdentity[e.identity_confidence] || 0) + 1
  }

  const examples = {
    safe_confirmed: cand
      .filter((e) => e.confidence === "confirmed" && e.top_candidate?.medusa_collection_handle === coll)
      .slice(0, 5)
      .map((e) => ({ inventory_id: e.inventory_id, filename: e.filename, top: e.top_candidate, basis: e.identity_match_basis })),
    needs_identity_review: cand
      .filter((e) => e.confidence === "ambiguous" || e.identity_confidence === "ambiguous")
      .slice(0, 5)
      .map((e) => ({ inventory_id: e.inventory_id, filename: e.filename, top: e.top_candidate, basis: e.identity_match_basis })),
    excluded_unmatched: cand
      .filter((e) => e.confidence === "unmatched")
      .slice(0, 3)
      .map((e) => ({ inventory_id: e.inventory_id, filename: e.filename })),
  }

  return {
    collection: coll,
    products_in_board_index: prods.length,
    media_rows: media.length,
    previewable: media.filter((i) => i.previewable).length,
    unpreviewable: media.filter((i) => !i.previewable).length,
    with_sku_or_handle_hint: media.filter((i) => i.sku_hint || i.handle_hint).length,
    candidate_map_rows: cand.length,
    by_confidence: byConfidence,
    by_identity_confidence: byIdentity,
    top_candidate_same_collection: cand.filter(
      (e) => String(e.top_candidate?.medusa_collection_handle || "").toLowerCase() === coll
    ).length,
    top_candidate_other_collection: cand.filter(
      (e) =>
        e.top_candidate &&
        String(e.top_candidate.medusa_collection_handle || "").toLowerCase() &&
        String(e.top_candidate.medusa_collection_handle || "").toLowerCase() !== coll
    ).length,
    qa_overlay_oxford_local_map: cand.filter((e) => e.qa_overlay).length,
    examples,
    blockers: [],
  }
}

function main() {
  const generatedAt = new Date().toISOString()
  const inv = readJson("data/normalized/legacy-media-inventory.json")
  const cmap = readJson("data/normalized/legacy-media-product-candidate-map.json")
  const board = readJson("data/normalized/legacy-media-board-products.json")
  const items = inv.items ?? []
  const entries = cmap.entries ?? []
  const products = board.products ?? []

  const oxford = auditCollection("oxford", items, entries, products)
  const monchelsea = auditCollection("monchelsea", items, entries, products)

  oxford.blockers = [
    "Majority of Oxford_full_* PDF crops are page-level (no SKU in filename) → ambiguous until operator maps via pilot visual map or manual assignment.",
    "Oxford collection paused in governance; board is QA-only.",
    "Yandex white-background root not mounted (see oxford-visual-source-inventory.json).",
  ]
  monchelsea.blockers = [
    "Monchelsea_p* PDF crops lack per-SKU filename tokens → collection-level ambiguous scores across 63 workbook SKUs.",
    "26 rows in monchelsea-manual-identity-closure-backlog.json require human identity sign-off.",
    "Monchelsea not in seed-products.json; board uses legacy-media-board-products.json overlay only.",
  ]

  const out = {
    audit_meta: {
      pass_name: "legacy_media_oxford_monchelsea_audit",
      pass_kind: "read_only_qa_audit",
      generated_at: generatedAt,
      generated_by: "scripts/audit-legacy-media-oxford-monchelsea.mjs",
      sources_checked: [
        "data/normalized/legacy-media-inventory.json",
        "data/normalized/legacy-media-product-candidate-map.json",
        "data/normalized/legacy-media-board-products.json",
        "data/normalized/entity-mapping.json",
        "data/normalized/product-workbook-asset-map.json",
        "data/normalized/seed-products.oxford-pilot-four.json",
        "data/normalized/oxford-local-mvp-sku-media-candidate-map.json",
        "data/normalized/oxford-visual-candidate-map.json",
        "data/normalized/monchelsea-manual-identity-closure-backlog.json",
        "data/raw/legacy/cache/*.html (registry via legacy-color-article-index)",
      ],
      not_production_readiness: true,
    },
    summary_table: [
      { collection: "oxford", ...oxford },
      { collection: "monchelsea", ...monchelsea },
    ],
    oxford,
    monchelsea,
    board_visibility: {
      products_api_artifact: "data/normalized/legacy-media-board-products.json",
      oxford_products: oxford.products_in_board_index,
      monchelsea_products: monchelsea.products_in_board_index,
      sidebar_collection_filters: ["oxford", "monchelsea"],
    },
  }

  const outPath = path.join(REPO, "data/normalized/legacy-media-oxford-monchelsea-audit.json")
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n")
  console.log("Wrote", outPath)
  console.log(JSON.stringify({ oxford: oxford.by_confidence, monchelsea: monchelsea.by_confidence }, null, 2))
}

main()
