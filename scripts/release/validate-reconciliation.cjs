#!/usr/bin/env node
/**
 * Reconciliation gate: metadata write only with full provenance (not a deploy).
 */
const fs = require("fs")
const path = require("path")

function evaluate(doc) {
  const errors = []
  const event = doc.event_kind
  if (event === "deploy" || doc.claim_deploy === true) {
    errors.push("reconciliation must not claim deploy")
  }
  if (!doc.provenance || doc.provenance.complete !== true) {
    errors.push("provenance.complete required")
  }
  if (!doc.provenance?.workflow_run_id) errors.push("missing workflow_run_id")
  if (!doc.provenance?.git_sha) errors.push("missing git_sha")
  if (doc.unknown_image === true) errors.push("unknown image rejected")
  if (doc.revision_mismatch === true) errors.push("revision mismatch rejected")
  if (doc.public_dom_ok !== true) errors.push("public DOM failure rejected")
  if (doc.health_ok !== true) errors.push("health failure rejected")
  if (event !== "reconciled_external_cutover" && doc.allow_metadata_write) {
    errors.push("metadata write requires event_kind=reconciled_external_cutover")
  }
  const allowed = errors.length === 0 && doc.allow_metadata_write === true
  return { allowed, errors, status: allowed ? "reconciliation_allowed" : "rejected" }
}

function runOne(file) {
  const doc = JSON.parse(fs.readFileSync(file, "utf8"))
  return evaluate(doc)
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--fixture-dir") {
    const dir = args[1]
    let failed = 0
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const r = runOne(path.join(dir, f))
      const shouldFail = f.startsWith("neg-")
      const pass = shouldFail ? !r.allowed : r.allowed
      console.log(`${pass ? "PASS" : "FAIL"} ${f} [${r.status}] ${r.errors.join("; ")}`)
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  if (!args[0]) {
    console.error("usage: validate-reconciliation.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = runOne(args[0])
  if (!r.allowed) {
    console.error("REJECTED", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK reconciliation allowed (not a deploy)")
}

main()
