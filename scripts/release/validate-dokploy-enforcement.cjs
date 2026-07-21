#!/usr/bin/env node
/**
 * Dokploy enforcement gate.
 * Decorative wrappers without closing direct mutation → fail.
 */
const fs = require("fs")
const path = require("path")

function evaluate(doc) {
  const errors = []
  const mode = doc.enforcement_mode
  const allowed = new Set(["wrapper_mandatory", "dokploy_sole_owner", "lease_enforced", "hard_blocker"])
  if (!allowed.has(mode)) errors.push("unknown enforcement_mode")

  if (doc.direct_mutation_path_open === true && doc.claim_bypass_closed === true) {
    errors.push("direct mutation path detected without policy")
  }
  if (doc.wrapper_decorative === true && doc.claim_bypass_closed === true) {
    errors.push("wrapper bypass")
  }
  if (mode === "dokploy_sole_owner") {
    if (doc.sole_owner !== "Dokploy") errors.push("sole-owner machine state invalid")
    if (doc.manual_mutation_allowed === true) {
      errors.push("manual mutation enabled under Dokploy sole-owner")
    }
    if (doc.allowed_controller && /manual/i.test(doc.allowed_controller) && doc.manual_mutation_allowed !== false) {
      errors.push("manual mutation enabled under Dokploy sole-owner")
    }
  }
  if (mode === "hard_blocker" && doc.public_cutover_allowed === true) {
    errors.push("hard blocker forbids public cutover")
  }
  // Residual UI bypass may exist but must be explicit and claim_bypass_closed=false
  if (doc.dokploy_ui_residual === true && doc.claim_bypass_closed === true) {
    errors.push("cannot claim bypass closed while Dokploy UI residual open")
  }
  const ok = errors.length === 0
  return {
    ok,
    errors,
    dokploy_bypass_closed: ok && doc.claim_bypass_closed === true && doc.direct_mutation_path_open !== true,
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

main()
