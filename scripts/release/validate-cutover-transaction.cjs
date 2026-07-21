#!/usr/bin/env node
/**
 * Cutover transaction state machine + identity validators.
 */
const fs = require("fs")
const path = require("path")

const TX_ID_RE = /^ctx-[0-9]{8}T[0-9]{6}Z-[a-z0-9-]{4,32}$/
const SHA_RE = /^[0-9a-f]{40}$/
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/
const LOCK = "/srv/woodright/locks/live-cutover.lock"

const STATES = new Set([
  "planned",
  "locked",
  "preflight_passed",
  "prepared",
  "backend_switching",
  "backend_healthy",
  "storefront_switching",
  "storefront_healthy",
  "public_verifying",
  "active",
  "rolling_back",
  "rolled_back",
  "failed",
  "aborted_conflict",
])

const ALLOWED = {
  planned: ["locked", "aborted_conflict", "failed"],
  locked: ["preflight_passed", "aborted_conflict", "failed"],
  preflight_passed: ["prepared", "aborted_conflict", "failed"],
  prepared: ["backend_switching", "aborted_conflict", "failed"],
  backend_switching: ["backend_healthy", "rolling_back", "failed"],
  backend_healthy: ["storefront_switching", "rolling_back", "failed"],
  storefront_switching: ["storefront_healthy", "rolling_back", "failed"],
  storefront_healthy: ["public_verifying", "rolling_back", "failed"],
  public_verifying: ["active", "rolling_back", "failed"],
  active: ["rolling_back"],
  rolling_back: ["rolled_back", "failed"],
  rolled_back: [],
  failed: [],
  aborted_conflict: [],
}

function fail(msg, errors) {
  errors.push(msg)
}

function validateIdentity(label, id, errors) {
  if (!id || typeof id !== "object") {
    fail(`${label} required`, errors)
    return
  }
  if (!SHA_RE.test(id.release_sha || "")) fail(`${label}.release_sha invalid`, errors)
  if (!DIGEST_RE.test(id.backend_digest || "")) fail(`${label}.backend_digest invalid`, errors)
  if (!DIGEST_RE.test(id.storefront_digest || "")) fail(`${label}.storefront_digest invalid`, errors)
}

function canTransition(from, to) {
  return (ALLOWED[from] || []).includes(to)
}

function validateTransaction(doc, errors) {
  if (!doc || typeof doc !== "object") {
    fail("transaction must be object", errors)
    return
  }
  if (doc.schema_version !== "1") fail('schema_version must be "1"', errors)
  if (!TX_ID_RE.test(doc.transaction_id || "")) fail("transaction_id invalid format", errors)
  if (!doc.operator) fail("operator required", errors)
  if (!doc.controller) fail("controller required", errors)
  if (!doc.host) fail("host required", errors)
  if (!STATES.has(doc.state)) fail(`invalid state ${doc.state}`, errors)
  if (doc.lock_path !== LOCK) fail(`lock_path must be ${LOCK}`, errors)
  validateIdentity("expected", doc.expected, errors)
  validateIdentity("target", doc.target, errors)

  if (doc.state === "active") {
    if (!doc.public_verification || doc.public_verification.passed !== true) {
      fail("active requires public_verification.passed=true", errors)
    }
    if (!doc.health || doc.health.backend !== "healthy" || doc.health.storefront !== "healthy") {
      fail("active requires backend+storefront healthy", errors)
    }
    if (!doc.release_manifest_draft_ref && !doc.notes?.includes("reconciled")) {
      if (doc.event_kind !== "reconciled_external_cutover") {
        fail("active requires release_manifest_draft_ref (or reconciled event_kind)", errors)
      }
    }
    if (!Array.isArray(doc.transition_history) || doc.transition_history.length < 2) {
      fail("active requires transition_history reaching active", errors)
    } else {
      const hist = doc.transition_history
      for (let i = 1; i < hist.length; i++) {
        if (!canTransition(hist[i - 1], hist[i])) {
          fail(`transition_history invalid ${hist[i - 1]}→${hist[i]}`, errors)
        }
      }
      if (hist[0] !== "planned") fail("transition_history must start at planned", errors)
      if (hist[hist.length - 1] !== "active") fail("transition_history must end at active", errors)
      if (!hist.includes("public_verifying")) fail("transition_history missing public_verifying", errors)
    }
  }
}

function validateTransitionFixture(doc, errors) {
  const tx = doc.transaction || doc
  validateTransaction(tx, errors)
  if (doc.from_state && doc.to_state) {
    if (!canTransition(doc.from_state, doc.to_state)) {
      fail(`invalid transition ${doc.from_state}→${doc.to_state}`, errors)
    }
    if (tx.state !== doc.to_state) {
      fail(`transaction.state must equal to_state (${doc.to_state})`, errors)
    }
  }
  if (doc.require_history === true) {
    if (!Array.isArray(doc.history) || doc.history.length < 1) {
      fail("history required for active promotion", errors)
    } else {
      for (let i = 1; i < doc.history.length; i++) {
        if (!canTransition(doc.history[i - 1], doc.history[i])) {
          fail(`history invalid ${doc.history[i - 1]}→${doc.history[i]}`, errors)
        }
      }
      if (doc.history[doc.history.length - 1] !== tx.state) {
        fail("history must end at transaction.state", errors)
      }
    }
  }
}

function runOne(file) {
  const errors = []
  let doc
  try {
    doc = JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (e) {
    return { ok: false, errors: [e.message] }
  }
  if (doc.from_state != null) validateTransitionFixture(doc, errors)
  else validateTransaction(doc, errors)
  return { ok: errors.length === 0, errors }
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
      console.log(`${pass ? "PASS" : "FAIL"} ${f} ${r.errors.join("; ")}`)
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  if (args[0] === "--can-transition") {
    const ok = canTransition(args[1], args[2])
    console.log(ok ? "ALLOWED" : "DENIED")
    process.exit(ok ? 0 : 1)
  }
  if (!args[0]) {
    console.error("usage: validate-cutover-transaction.cjs <file>|--fixture-dir <d>|--can-transition from to")
    process.exit(2)
  }
  const r = runOne(args[0])
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK transaction")
}

module.exports = { canTransition, validateTransaction, LOCK }
if (require.main === module) main()
