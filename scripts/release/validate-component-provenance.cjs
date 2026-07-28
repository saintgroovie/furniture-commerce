#!/usr/bin/env node
/** Component provenance completeness (Gate AE). */
const fs = require("fs")
const path = require("path")

const SHA_RE = /^[0-9a-f]{40}$/
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/

function checkComponent(label, c, expected, errors) {
  if (!c) {
    errors.push(`${label} run missing`)
    return
  }
  if (c.workflow_run_id == null || c.workflow_run_id === "") errors.push(`${label} run missing`)
  const pr = c.pr_number != null ? c.pr_number : c.pr
  if (expected?.pr != null && String(pr) !== String(expected.pr)) errors.push(`${label} wrong PR`)
  if (expected?.digest && c.digest !== expected.digest) errors.push(`${label} wrong digest`)
  if (expected?.source_sha && c.source_sha !== expected.source_sha) {
    errors.push(`${label} wrong source revision`)
  }
  if (!SHA_RE.test(c.source_sha || "")) errors.push(`${label} wrong source revision`)
  if (!DIGEST_RE.test(c.digest || "")) errors.push(`${label} wrong digest`)
  if (!Number.isInteger(c.workflow_run_attempt) || c.workflow_run_attempt < 1) {
    errors.push(`partial component provenance (${label} attempt)`)
  }
  if (!c.unique_build_tag) errors.push(`partial component provenance (${label} build tag)`)
}

function evaluate(doc) {
  const errors = []
  checkComponent("BE", doc.backend, doc.expect?.backend, errors)
  checkComponent("SF", doc.storefront, doc.expect?.storefront, errors)
  if (doc.partial === true) errors.push("partial component provenance")
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
    console.error("usage: validate-component-provenance.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = evaluate(JSON.parse(fs.readFileSync(args[0], "utf8")))
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK component provenance")
}

main()
