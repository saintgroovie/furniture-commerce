#!/usr/bin/env node
/**
 * Catalog mutation dry-run (AZ) - fail-closed, no writes.
 */
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

function fingerprint(obj) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex")
}

function dryRun(input) {
  const errors = []
  const conflicts = []
  const proposed = []
  const unchanged = []
  if (!input || typeof input !== "object" || Object.keys(input).length === 0) {
    return { ok: false, errors: ["empty dry-run input"], conflicts: [], proposed_mutations: [], unchanged_rows: [], executed: false, applied: false }
  }
  if (!input.expected_bundle_id) {
    errors.push("expected_bundle_id required")
  }
  const snapshot = input.source_snapshot || {}
  if (!snapshot.bundle_id) errors.push("source_snapshot.bundle_id required")
  if (!Array.isArray(snapshot.products)) errors.push("source_snapshot.products required")
  const decisions = input.approved_decisions
  if (!Array.isArray(decisions) || decisions.length < 1) {
    errors.push("approved_decisions required")
  }
  if (!input.owner_review_packet_id) {
    errors.push("owner_review_packet_id required")
  }
  if (!input.owner_review_packet_checksum_sha256) {
    errors.push("owner_review_packet_checksum_sha256 required")
  }
  const byId = new Map((snapshot.products || []).map((p) => [p.id, p]))
  if (
    input.expected_bundle_id &&
    snapshot.bundle_id &&
    input.expected_bundle_id !== snapshot.bundle_id
  ) {
    conflicts.push({ reason: "bundle mismatch" })
    errors.push("bundle mismatch")
  }
  for (const d of decisions || []) {
    if (!d.product_id) {
      conflicts.push({ reason: "missing product" })
      errors.push("missing product")
      continue
    }
    if (!d.before_fingerprint) {
      errors.push("before_fingerprint required")
      conflicts.push({ product_id: d.product_id, reason: "before_fingerprint required" })
      continue
    }
    if (d.owner_decision === "defer" || d.owner_decision === "reject") {
      conflicts.push({ product_id: d.product_id, reason: "deferred/rejected" })
      errors.push("deferred/rejected")
      continue
    }
    if (d.owner_decision !== "approve_proposal" && d.owner_decision !== "intentionally_unassigned") {
      conflicts.push({ product_id: d.product_id, reason: "owner decision missing" })
      errors.push("owner decision missing")
      continue
    }
    if (!d.reviewed_by || !d.reviewed_at || !d.authorization_evidence) {
      errors.push("owner approval evidence missing")
      conflicts.push({ product_id: d.product_id, reason: "owner approval evidence missing" })
      continue
    }
    if (d.owner_review_packet_id && input.owner_review_packet_id && d.owner_review_packet_id !== input.owner_review_packet_id) {
      errors.push("owner_review_packet_id mismatch")
      conflicts.push({ product_id: d.product_id, reason: "owner_review_packet_id mismatch" })
      continue
    }
    const prod = byId.get(d.product_id)
    if (!prod) {
      conflicts.push({ product_id: d.product_id, reason: "missing product" })
      errors.push("missing product")
      continue
    }
    const before = {
      category_handle: prod.metadata?.category_handle ?? null,
      collection: prod.metadata?.collection ?? null,
    }
    const fp = fingerprint(before)
    if (d.before_fingerprint !== fp) {
      conflicts.push({ product_id: d.product_id, reason: "before fingerprint mismatch" })
      errors.push("before fingerprint mismatch")
      continue
    }
    if (d.expected_before && JSON.stringify(d.expected_before) !== JSON.stringify(before)) {
      conflicts.push({ product_id: d.product_id, reason: "before value changed" })
      errors.push("before value changed")
      continue
    }
    if (d.target_by_title) {
      errors.push("title-only target")
      continue
    }
    const after = { ...before, ...(d.proposed || {}) }
    if (JSON.stringify(before) === JSON.stringify(after)) {
      unchanged.push(d.product_id)
      continue
    }
    proposed.push({
      product_id: d.product_id,
      before,
      after,
      rollback_value: before,
      mutation_types: Object.keys(d.proposed || {}).map((k) =>
        k === "collection" && after.collection == null ? "clear_collection" : `set_${k}`
      ),
    })
  }
  return {
    ok: errors.length === 0,
    errors,
    conflicts,
    proposed_mutations: proposed,
    unchanged_rows: unchanged,
    no_op_count: unchanged.length,
    executed: false,
    applied: false,
  }
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--fixture-dir") {
    const dir = args[1]
    let failed = 0
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))
      const r = dryRun(doc)
      const shouldFail = f.startsWith("neg-")
      const pass = shouldFail ? !r.ok : r.ok
      console.log(`${pass ? "PASS" : "FAIL"} ${f} ${r.errors.join("; ")}`)
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  if (args[0] === "--input") {
    const r = dryRun(JSON.parse(fs.readFileSync(args[1], "utf8")))
    console.log(JSON.stringify(r, null, 2))
    process.exit(r.ok ? 0 : 1)
  }
  console.error("usage: dry-run-catalog-mutations.cjs --fixture-dir <d> | --input <file>")
  process.exit(2)
}

module.exports = { dryRun, fingerprint }
if (require.main === module) main()
