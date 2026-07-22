#!/usr/bin/env node
/** Catalog mutation manifest (AY/BA/BB). */
const fs = require("fs")
const path = require("path")

const TYPES = new Set([
  "set_category_handle",
  "set_collection",
  "clear_collection",
  "mark_intentionally_unassigned",
  "metadata_normalization",
])

function evaluate(doc) {
  const errors = []
  if (!doc.mutation_id) errors.push("mutation_id required")
  if (!doc.owner_review_packet_id) errors.push("approval reference required")
  if (!doc.owner_approval_evidence || !doc.owner_approval_evidence.reviewed_by) {
    errors.push("owner approval evidence missing")
  }
  if (!doc.source_bundle_id) errors.push("expected source bundle required")
  if (doc.contains_image_cutover === true) errors.push("catalog mutation must not include image cutover")
  const rows = doc.mutations || doc.rows || []
  if (!rows.length) errors.push("mutations required")
  for (const m of rows) {
    if (!m.product_id) errors.push("exact product ID required")
    if (m.target_by_title || m.title_only_target) errors.push("title-only target")
    if (m.target_by_position || m.position_based_target) errors.push("position-based target")
    if (!TYPES.has(m.mutation_type)) errors.push("invalid mutation type")
    if (!m.before || !m.after) errors.push("before/after required")
    if (m.rollback_value === undefined) errors.push("rollback required")
    if (!m.before_fingerprint) errors.push("before fingerprint required")
  }
  if (doc.reversible !== true && rows.length) errors.push("manifest must be reversible")
  return { ok: errors.length === 0, errors }
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--fixture-dir") {
    const dir = args[1]
    let failed = 0
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const r = evaluate(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
      const shouldFail = f.startsWith("neg-")
      const pass = shouldFail ? !r.ok : r.ok
      console.log(`${pass ? "PASS" : "FAIL"} ${f} ${r.errors.join("; ")}`)
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  if (!args[0]) {
    console.error("usage: validate-catalog-mutation-manifest.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = evaluate(JSON.parse(fs.readFileSync(args[0], "utf8")))
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK catalog mutation manifest")
}

main()
