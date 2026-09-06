#!/usr/bin/env node
/** Intent registry (BD/BH) - active vs intent separation + lifecycle. */
const fs = require("fs")
const path = require("path")

const STATUSES = new Set([
  "planned",
  "prepared",
  "approved",
  "activating",
  "activated",
  "partially_activated",
  "superseded",
  "abandoned_before_cutover",
  "aborted_conflict",
  "failed",
  "unknown_pending_forensics",
])

function evaluate(doc) {
  const errors = []
  if (!doc || typeof doc !== "object" || Object.keys(doc).length === 0) {
    errors.push("empty intent registry")
    return { ok: false, errors }
  }
  if (!doc.schema_version) errors.push("schema_version required")
  if (!Array.isArray(doc.intents)) errors.push("intents array required")
  if (doc.active_state_contains_pending_intent === true) {
    errors.push("active state contains pending intent")
  }
  if (doc.intent_registry_separate === false) {
    errors.push("intent registry must be separate")
  }
  if (doc.intent_registry_separate == null) {
    errors.push("intent_registry_separate required")
  }
  const intents = Array.isArray(doc.intents) ? doc.intents : []
  const ids = new Set()
  for (const it of intents) {
    if (!it.intent_id) errors.push("intent_id required")
    if (ids.has(it.intent_id)) errors.push("duplicate intent_id")
    ids.add(it.intent_id)
    if (!STATUSES.has(it.status)) errors.push("invalid intent status")
    if (
      ["superseded", "abandoned_before_cutover", "partially_activated", "activated", "aborted_conflict", "failed"].includes(
        it.status
      ) &&
      !it.status_reason &&
      !(it.evidence_paths && it.evidence_paths.length)
    ) {
      errors.push("superseded/abandoned status requires evidence")
    }
    if (!it.created_at) errors.push("created_at required")
    if (!it.target_environment && !it.target_digests) errors.push("target environment/digests required")
    if (it.status === "planned" && it.must_have_final_status_after_supersession === true) {
      errors.push("planned intent without status after supersession")
    }
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
    console.error("usage: validate-intent-registry.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = evaluate(JSON.parse(fs.readFileSync(args[0], "utf8")))
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK intent registry")
}

module.exports = { evaluate }
if (require.main === module) main()
