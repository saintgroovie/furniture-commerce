#!/usr/bin/env node
/**
 * Compare-and-swap: expected active identity vs observed (fail-closed).
 * Requires explicit authority checks for ACTIVE_RELEASE, ACTIVE_OWNER, containers.
 */
const fs = require("fs")
const path = require("path")

const SHA_RE = /^[0-9a-f]{40}$/
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/

function casCheck(expected, observed, errors) {
  if (!expected || !observed) {
    errors.push("expected and observed required")
    return
  }
  for (const k of ["release_sha", "backend_digest", "storefront_digest"]) {
    if (expected[k] == null) errors.push(`expected.${k} missing`)
    if (observed[k] == null) errors.push(`observed.${k} missing`)
  }
  if (expected.release_sha && !SHA_RE.test(expected.release_sha)) errors.push("expected.release_sha invalid")
  if (expected.backend_digest && !DIGEST_RE.test(expected.backend_digest)) errors.push("expected.backend_digest invalid")
  if (expected.storefront_digest && !DIGEST_RE.test(expected.storefront_digest)) {
    errors.push("expected.storefront_digest invalid")
  }

  // Fail-closed: each authority must be explicitly asserted true.
  if (observed.active_release_match !== true) errors.push("ACTIVE_RELEASE authority not confirmed")
  if (observed.active_owner_match !== true) errors.push("ACTIVE_OWNER authority not confirmed")
  if (observed.containers_match !== true) errors.push("live containers authority not confirmed")

  if (expected.release_sha !== observed.release_sha) {
    errors.push(`SHA mismatch expected=${expected.release_sha} observed=${observed.release_sha}`)
  }
  if (expected.backend_digest !== observed.backend_digest) {
    errors.push("backend digest mismatch")
  }
  if (expected.storefront_digest !== observed.storefront_digest) {
    errors.push("storefront digest mismatch")
  }
  if (observed.active_release_stale === true) errors.push("ACTIVE_RELEASE stale")
}

function runOne(file) {
  const errors = []
  const doc = JSON.parse(fs.readFileSync(file, "utf8"))
  casCheck(doc.expected, doc.observed, errors)
  return { ok: errors.length === 0, errors, status: errors.length ? "conflict" : "allowed" }
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--fixture-dir") {
    const dir = args[1]
    let failed = 0
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const r = runOne(path.join(dir, f))
      const shouldFail = f.startsWith("neg-")
      const pass = shouldFail ? !r.ok : r.ok
      console.log(`${pass ? "PASS" : "FAIL"} ${f} [${r.status}] ${r.errors.join("; ")}`)
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  if (!args[0]) {
    console.error("usage: validate-compare-and-swap.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = runOne(args[0])
  if (!r.ok) {
    console.error("CONFLICT", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK cas allowed")
}

main()
