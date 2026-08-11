#!/usr/bin/env node
/** External cutover reconciliation (BG/BJ/BK/BQ). */
const fs = require("fs")
const path = require("path")

function evaluate(doc) {
  const errors = []
  if (doc.called_deploy === true || doc.event_name === "deploy") {
    errors.push("external reconciliation called deploy")
  }
  if (doc.event_name && doc.event_name !== "reconciled_external_security_cutover") {
    if (doc.require_security_event !== false) {
      errors.push("incorrect external cutover event name")
    }
  }
  const prov = doc.component_provenance || {}
  for (const side of ["backend", "storefront"]) {
    if (!prov[`${side}_revision`] || !prov[`${side}_workflow_run_id`]) {
      errors.push("digest without OCI revision/workflow run")
    }
  }
  if (!doc.divergence_window || !doc.divergence_cause) {
    errors.push("reconciliation lacks divergence window/cause")
  }
  const proof = doc.runtime_unchanged_proof || {}
  for (const k of [
    "before_backend_container_id",
    "after_backend_container_id",
    "before_storefront_container_id",
    "after_storefront_container_id",
    "before_backend_digest",
    "after_backend_digest",
    "before_storefront_digest",
    "after_storefront_digest",
    "before_routes",
    "after_routes",
  ]) {
    if (proof[k] == null) errors.push("reconciliation report missing before/after container IDs/digests/routes")
  }
  const pairs = [
    ["before_backend_container_id", "after_backend_container_id"],
    ["before_storefront_container_id", "after_storefront_container_id"],
    ["before_backend_digest", "after_backend_digest"],
    ["before_storefront_digest", "after_storefront_digest"],
  ]
  for (const [b, a] of pairs) {
    if (proof[b] != null && proof[a] != null && proof[b] !== proof[a]) {
      errors.push("runtime changed during reconciliation")
    }
  }
  if (
    proof.before_routes != null &&
    proof.after_routes != null &&
    JSON.stringify(proof.before_routes) !== JSON.stringify(proof.after_routes)
  ) {
    errors.push("runtime changed during reconciliation")
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
    console.error("usage: validate-external-cutover-reconciliation.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = evaluate(JSON.parse(fs.readFileSync(args[0], "utf8")))
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK external cutover reconciliation")
}

module.exports = { evaluate }
if (require.main === module) main()
