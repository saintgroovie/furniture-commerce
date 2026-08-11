#!/usr/bin/env node
/** Compatibility contract for split BE/SF pairs (Gate AF). */
const fs = require("fs")
const path = require("path")

function evaluate(doc) {
  const errors = []
  if (!doc || typeof doc !== "object" || Object.keys(doc).length === 0) {
    return { ok: false, errors: ["compatibility document empty"] }
  }
  const be = doc.backend_revision || ""
  const sf = doc.storefront_revision || ""
  if (!be || !sf) {
    errors.push("backend_revision and storefront_revision required")
  }
  const split = be && sf && be !== sf
  const cc = doc.compatibility_contract || {}
  if (split) {
    if (!cc || cc.status !== "compatible") errors.push("split pair without compatibility evidence")
    if (!cc.evidence_path) errors.push("missing public QA")
    const req = cc.required_store_api_contract
    const prov = cc.provided_store_api_contract
    if (!req || !prov) errors.push("incompatible API contract")
    else if (req !== prov) errors.push("incompatible API contract")
    if (cc.migrations_compatible !== true) errors.push("migrations mismatch")
    const qaOk = cc.public_qa?.passed === true || doc.verification?.public_passed === true
    if (!qaOk) errors.push("missing public QA")
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
    console.error("usage: validate-compatibility-contract.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = evaluate(JSON.parse(fs.readFileSync(args[0], "utf8")))
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK compatibility contract")
}

main()
