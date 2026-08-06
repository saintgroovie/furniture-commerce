#!/usr/bin/env node
/** Mutation lease validator (single-use, lock-bound, fail-closed). */
const fs = require("fs")
const path = require("path")

const LOCK = "/srv/woodright/locks/live-cutover.lock"
const LEASE_RE = /^lease-[0-9]{8}T[0-9]{6}Z-[a-z0-9-]{4,32}$/
const TX_RE = /^ctx-[0-9]{8}T[0-9]{6}Z-[a-z0-9-]{4,32}$/
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/
const ACTIONS = new Set([
  "pair_cutover",
  "storefront_only_cutover",
  "restart",
  "rollback",
  "metadata_reconciliation",
])
const ENVS = new Set(["staging", "production", "local-canonical"])

function evaluate(doc, nowIso) {
  const errors = []
  if (doc.schema_version !== "1") errors.push("schema_version must be 1")
  if (!LEASE_RE.test(doc.lease_id || "")) errors.push("lease_id invalid")
  if (!ENVS.has(doc.environment)) errors.push("environment invalid")
  if (!doc.actor) errors.push("actor missing")
  if (!doc.controller) errors.push("controller missing")
  if (!ACTIONS.has(doc.action)) errors.push("action invalid")
  if (doc.single_use !== true) errors.push("single_use must be true")
  if (doc.lock_path !== LOCK) errors.push("missing global lock path")
  if (!TX_RE.test(doc.transaction_id || "")) errors.push("wrong transaction")
  if (!DIGEST_RE.test(doc.expected_backend_digest || "")) errors.push("expected backend digest invalid")
  if (!DIGEST_RE.test(doc.expected_storefront_digest || "")) errors.push("expected storefront digest invalid")
  if (!doc.expected_bundle_id) errors.push("expected_bundle_id missing")
  if (!doc.target_bundle_id) errors.push("target_bundle_id missing")
  const issued = Date.parse(doc.issued_at || "")
  const exp = Date.parse(doc.expires_at || "")
  if (!Number.isFinite(issued)) errors.push("issued_at invalid")
  if (!Number.isFinite(exp)) errors.push("expires_at invalid")
  if (doc.status === "consumed") errors.push("consumed")
  if (doc.status === "expired") errors.push("expired")
  if (doc.status === "aborted") errors.push("aborted")
  const now = Date.parse(nowIso || doc.now_iso || new Date().toISOString())
  if (Number.isFinite(exp) && Number.isFinite(now) && now > exp && doc.status === "issued") {
    errors.push("expired")
  }
  if (doc.observed_bundle_id == null || doc.observed_bundle_id === "") {
    errors.push("observed_bundle_id required")
  } else if (doc.observed_bundle_id !== doc.expected_bundle_id) {
    errors.push("wrong expected bundle")
  }
  if (!DIGEST_RE.test(doc.observed_backend_digest || "")) {
    errors.push("observed_backend_digest required")
  } else if (doc.observed_backend_digest !== doc.expected_backend_digest) {
    errors.push("wrong expected backend digest")
  }
  if (!DIGEST_RE.test(doc.observed_storefront_digest || "")) {
    errors.push("observed_storefront_digest required")
  } else if (doc.observed_storefront_digest !== doc.expected_storefront_digest) {
    errors.push("wrong expected storefront digest")
  }
  return { ok: errors.length === 0 && doc.status === "issued", errors }
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--fixture-dir") {
    const dir = args[1]
    let failed = 0
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))
      const r = evaluate(doc)
      const shouldFail = f.startsWith("neg-")
      const pass = shouldFail ? !r.ok : r.ok
      console.log(`${pass ? "PASS" : "FAIL"} ${f} ${r.errors.join("; ")}`)
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  if (!args[0]) {
    console.error("usage: validate-mutation-lease.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = evaluate(JSON.parse(fs.readFileSync(args[0], "utf8")))
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK mutation lease")
}

main()
