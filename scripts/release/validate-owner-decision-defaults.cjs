#!/usr/bin/env node
/** Owner decision defaults (BO/BP/BQ). */
const fs = require("fs")
const path = require("path")

const NULL_TAX = new Set([
  "intentionally_unassigned",
  "missing",
  "unknown",
  "legacy",
  "likely_intentionally_unassigned",
  "likely_missing_collection",
  "legacy_paused",
  "insufficient_evidence",
])

function evaluate(doc) {
  const errors = []
  if (doc.blank_interpreted_as_approve === true) {
    errors.push("blank cell interpreted approve")
  }
  const rows = doc.rows || []
  for (const r of rows) {
    if (!r.owner_decision || r.owner_decision === "" || r.owner_decision === "pending") {
      if (r.treated_as_approved === true) errors.push("blank cell interpreted approve")
    }
    if (r.bucket === "collection_null") {
      if (doc.all_null_called_missing === true) errors.push("all null rows automatically called missing")
      if (r.proposal_taxonomy && !NULL_TAX.has(r.proposal_taxonomy)) {
        errors.push("collection null taxonomy unsupported")
      }
    }
    if (r.bucket === "engineering_dto") {
      errors.push("engineering gaps in owner approval queue")
    }
  }
  if (doc.supports_null_taxonomy === false) {
    errors.push("intentional/missing/unknown/legacy supported")
  }
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
    console.error("usage: validate-owner-decision-defaults.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = evaluate(JSON.parse(fs.readFileSync(args[0], "utf8")))
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK owner decision defaults")
}

module.exports = { evaluate }
if (require.main === module) main()
