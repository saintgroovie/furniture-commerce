#!/usr/bin/env node
/**
 * Read-only live drift monitor (fixture + JSON compare).
 * Never mutates owner/manifest/containers.
 */
const fs = require("fs")
const path = require("path")

const SHA_RE = /^[0-9a-f]{40}$/
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/

const RESULTS = new Set([
  "consistent",
  "metadata_stale",
  "containers_drifted",
  "owner_conflict",
  "public_behavior_drifted",
  "unknown_images",
  "critical",
])

function evaluate(doc) {
  const reasons = []
  let result = "consistent"
  const a = doc.active_release || {}
  const o = doc.active_owner || {}
  const c = doc.containers || {}
  const p = doc.public || {}

  if (!SHA_RE.test(a.release_sha || "")) {
    reasons.push("invalid active release_sha")
    result = "critical"
  }
  if (!DIGEST_RE.test(a.backend_digest || "") || !DIGEST_RE.test(a.storefront_digest || "")) {
    reasons.push("invalid active digests")
    result = "critical"
  }
  if (doc.unknown_images === true) {
    reasons.push("unknown live images")
    result = "unknown_images"
  }
  if (o.release_sha && a.release_sha && o.release_sha !== a.release_sha) {
    reasons.push("ACTIVE_OWNER SHA ≠ ACTIVE_RELEASE")
    result = "owner_conflict"
  }
  if (c.backend_digest && a.backend_digest && c.backend_digest !== a.backend_digest) {
    reasons.push("backend container digest drift")
    result = "containers_drifted"
  }
  if (c.storefront_digest && a.storefront_digest && c.storefront_digest !== a.storefront_digest) {
    reasons.push("storefront container digest drift")
    result = "containers_drifted"
  }
  if (doc.metadata_stale === true || (c.release_sha && a.release_sha && c.release_sha !== a.release_sha)) {
    reasons.push("ACTIVE_RELEASE stale vs containers")
    if (result === "consistent") result = "metadata_stale"
  }
  if (p.behavior_ok === false) {
    reasons.push("public behavior drifted")
    result = "public_behavior_drifted"
  }
  if (doc.force_result && RESULTS.has(doc.force_result)) result = doc.force_result
  return { result, reasons, read_only: true, mutated: false }
}

function runOne(file) {
  const doc = JSON.parse(fs.readFileSync(file, "utf8"))
  const out = evaluate(doc)
  const expected = doc.expect_result
  const errors = []
  if (expected && out.result !== expected) {
    errors.push(`expected ${expected} got ${out.result}`)
  }
  if (out.mutated !== false || out.read_only !== true) errors.push("monitor must be read-only")
  return { ok: errors.length === 0, errors, out }
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--fixture-dir") {
    const dir = args[1]
    let failed = 0
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const full = path.join(dir, f)
      const doc = JSON.parse(fs.readFileSync(full, "utf8"))
      const r = runOne(full)
      const expected = doc.expect_result || (f.startsWith("neg-") ? null : "consistent")
      const pass = r.ok && expected != null && r.out.result === expected
      console.log(`${pass ? "PASS" : "FAIL"} ${f} result=${r.out.result} expected=${expected} ${r.errors.join("; ")}`)
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  if (args[0] === "--check") {
    const r = runOne(args[1])
    console.log(JSON.stringify(r.out, null, 2))
    process.exit(r.out.result === "consistent" ? 0 : 2)
  }
  console.error("usage: monitor-live-drift.cjs --fixture-dir d | --check snapshot.json")
  process.exit(2)
}

module.exports = { evaluate }
if (require.main === module) main()
