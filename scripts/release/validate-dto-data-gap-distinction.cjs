#!/usr/bin/env node
/**
 * Distinguish DTO/projection gaps from source-data gaps.
 */
const fs = require("fs")
const path = require("path")

const STATES = new Set([
  "present_structured",
  "null_in_source",
  "missing_in_source",
  "not_exposed_by_endpoint",
  "lost_in_projection",
  "derived_from_metadata",
  "derived_from_title",
  "ambiguous",
  "unknown",
])

function classify(row) {
  const endpointHas = row.endpoint_has_field === true
  const sourceHas = row.source_has_field === true
  const sourceNull = row.source_null === true
  const titleOnly = row.title_only_inference === true
  if (titleOnly && !sourceHas) return "derived_from_title"
  if (!endpointHas && sourceHas) return "lost_in_projection"
  if (!endpointHas && !sourceHas && row.endpoint_declares_absence === true) return "not_exposed_by_endpoint"
  if (sourceNull) return "null_in_source"
  if (!sourceHas && endpointHas === false && row.checked_source === true) return "missing_in_source"
  if (sourceHas && endpointHas) return "present_structured"
  return "unknown"
}

function evaluate(doc) {
  const errors = []
  if (!Array.isArray(doc.field_source_matrix) || doc.field_source_matrix.length < 1) {
    errors.push("field-source matrix required")
  }
  const rows = doc.rows || []
  let misclassified = 0
  for (const row of rows) {
    const got = row.audit_state || classify(row)
    const expected = classify(row)
    if (!STATES.has(got)) errors.push(`invalid state ${got}`)
    if (row.counts_as_source_gap === true && expected === "not_exposed_by_endpoint") {
      errors.push("audit must not count endpoint absence as source gap")
      misclassified++
    }
    if (row.counts_as_source_gap === true && expected === "lost_in_projection") {
      errors.push("projection gap counted as source gap")
      misclassified++
    }
    if (doc.expect_classifications) {
      const key = row.field || row.id
      if (doc.expect_classifications[key] && doc.expect_classifications[key] !== expected) {
        errors.push(`expected ${doc.expect_classifications[key]} got ${expected} for ${key}`)
      }
    }
    row._classified = expected
  }
  return { ok: errors.length === 0, errors, rows }
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
    console.error("usage: validate-dto-data-gap-distinction.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = evaluate(JSON.parse(fs.readFileSync(args[0], "utf8")))
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK dto/data gap distinction")
}

module.exports = { classify, evaluate }
if (require.main === module) main()
