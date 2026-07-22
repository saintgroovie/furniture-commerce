#!/usr/bin/env node
/** Product identity comparison (BN) - title-only invalid. */
const fs = require("fs")
const path = require("path")

function evaluate(doc) {
  const errors = []
  if (doc.title_only_comparison === true) errors.push("title-only comparison")
  const c = doc.current || {}
  const p = doc.previous || {}
  const hasId = !!(c.product_id || c.handle || c.group_id)
  const hasPrev = !!(p.product_id || p.handle || p.group_id || doc.previous_baseline_text_only)
  if (!hasId) errors.push("product ID/handle/group comparison required")
  if (doc.previous_baseline_text_only === true && !p.product_id && !p.handle) {
    // allowed verdict path: baseline_text_mismatch without claiming regression
    if (doc.verdict === "sorting_regression" || doc.verdict === "title_regression") {
      errors.push("title-only comparison")
    }
  }
  const allowed = new Set([
    "expected_group_representation",
    "legitimate_data_change",
    "sorting_regression",
    "title_regression",
    "baseline_text_mismatch",
    "unresolved",
  ])
  if (doc.verdict && !allowed.has(doc.verdict)) errors.push("invalid identity verdict")
  if (!hasPrev && doc.verdict === "sorting_regression") errors.push("title-only comparison")
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
    console.error("usage: validate-product-identity-compare.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = evaluate(JSON.parse(fs.readFileSync(args[0], "utf8")))
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK product identity compare")
}

module.exports = { evaluate }
if (require.main === module) main()
