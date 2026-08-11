#!/usr/bin/env node
/** Owner-review decision schema (AW/AX). */
const fs = require("fs")
const path = require("path")

const DECISIONS = new Set([
  "approve_proposal",
  "choose_other",
  "intentionally_unassigned",
  "defer",
  "reject",
  "needs_more_evidence",
  "pending",
])

function evaluate(doc) {
  const errors = []
  if (!doc.packet_id) errors.push("packet_id required")
  if (!doc.source_bundle_id) errors.push("source bundle required")
  if (!doc.source_checksum_sha256 || !/^[0-9a-f]{64}$/.test(doc.source_checksum_sha256)) {
    errors.push("missing source checksum")
  }
  if (doc.rejects_store_products_as_completeness !== true) {
    errors.push("must reject /store/products as completeness source")
  }
  const rows = doc.rows || []
  for (const row of rows) {
    if (!row.product_id) errors.push("missing product ID")
    if (row.bucket === "engineering_dto_gap") {
      errors.push("DTO gaps never enter owner decision queue")
    }
    if (row.automatic_apply_allowed === true && row.owner_decision !== "approve_proposal") {
      errors.push("automatic apply true before approval")
    }
    if (row.owner_decision && !DECISIONS.has(row.owner_decision)) {
      errors.push("invalid owner decision")
    }
    if (row.owner_decision === "approve_proposal") {
      if (!row.reviewed_by || !row.reviewed_at) {
        errors.push("owner approval evidence missing")
      }
      if (!row.authorization_evidence) {
        errors.push("owner approval evidence missing")
      }
    }
    if (row.implicit_linked_category_collection === true && !row.link_evidence) {
      errors.push("implicit linked mutation without evidence")
    }
    if (row.agent_proposal_called_approved === true) {
      errors.push("proposal called approved")
    }
  }
  if (doc.mutations !== false) errors.push("mutations must be false for review packet")
  if (doc.automatic_apply === true) errors.push("automatic apply true before approval")
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
    console.error("usage: validate-owner-review-decisions.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = evaluate(JSON.parse(fs.readFileSync(args[0], "utf8")))
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK owner-review decisions")
}

main()
