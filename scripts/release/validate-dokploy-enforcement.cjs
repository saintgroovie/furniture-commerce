#!/usr/bin/env node
/**
 * Dokploy enforcement gate (AR).
 * Never infer bypass closed from missing fields.
 * Closure requires explicit successful negative_ui_test.
 */
const fs = require("fs")
const path = require("path")

const MODES = new Set([
  "wrapper_mandatory",
  "dokploy_sole_owner",
  "sole_owner_with_known_ui_bypass",
  "lease_enforced",
  "hard_blocker",
])

function evaluate(doc) {
  const errors = []
  const mode = doc.enforcement_mode
  if (!MODES.has(mode)) errors.push("unknown enforcement_mode")

  // Residual / direct path must be explicit
  if (doc.direct_mutation_path_open == null) {
    errors.push("direct_mutation_path_open required (true|false|unknown)")
  }
  if (doc.claim_bypass_closed === true) {
    if (doc.negative_ui_test_status !== "passed") {
      errors.push("bypass closed without negative test")
    }
    if (!doc.negative_ui_test_evidence) {
      errors.push("bypass closed without negative test evidence")
    }
    if (doc.direct_mutation_path_open === true || doc.direct_mutation_path_open === "unknown") {
      errors.push("cannot claim bypass closed while direct path open/unknown")
    }
    if (doc.dokploy_ui_residual === true) {
      errors.push("cannot claim bypass closed while Dokploy UI residual open")
    }
  }

  if (doc.wrapper_decorative === true && doc.claim_bypass_closed === true) {
    errors.push("wrapper bypass")
  }

  if (mode === "dokploy_sole_owner" || mode === "sole_owner_with_known_ui_bypass") {
    if (doc.sole_owner !== "Dokploy") errors.push("sole-owner machine state invalid")
    if (doc.manual_mutation_allowed === true) {
      errors.push("manual mutation enabled under Dokploy sole-owner")
    }
  }

  if (mode === "sole_owner_with_known_ui_bypass") {
    if (doc.claim_bypass_closed === true) {
      errors.push("sole_owner_with_known_ui_bypass cannot claim bypass closed")
    }
    if (doc.dokploy_ui_residual !== true) {
      errors.push("known UI bypass mode requires dokploy_ui_residual=true")
    }
  }

  if (mode === "hard_blocker" && doc.public_cutover_allowed === true) {
    errors.push("hard blocker forbids public cutover")
  }

  // Break-glass required for any enforcement that restricts access
  if (doc.break_glass_required !== false) {
    if (!doc.break_glass || !doc.break_glass.recovery_reference) {
      errors.push("missing break-glass")
    }
    if (doc.break_glass && doc.break_glass.contains_secrets === true) {
      errors.push("secrets in policy")
    }
  }

  const closed =
    errors.length === 0 &&
    doc.claim_bypass_closed === true &&
    doc.negative_ui_test_status === "passed" &&
    doc.direct_mutation_path_open === false

  return {
    ok: errors.length === 0,
    errors,
    dokploy_bypass_closed: closed,
  }
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
    console.error("usage: validate-dokploy-enforcement.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = evaluate(JSON.parse(fs.readFileSync(args[0], "utf8")))
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK dokploy enforcement", "bypass_closed=" + r.dokploy_bypass_closed)
}

module.exports = { evaluate }
if (require.main === module) main()
