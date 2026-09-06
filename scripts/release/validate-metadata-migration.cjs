#!/usr/bin/env node
/** Manifest metadata migration must not change runtime (Gate AO). */
const fs = require("fs")
const path = require("path")

function evaluate(doc) {
  const errors = []
  const before = doc.before || {}
  const after = doc.after || {}
  for (const k of ["backend_container_id", "storefront_container_id", "backend_digest", "storefront_digest"]) {
    if (!before[k]) errors.push(`before ${k} missing`)
    if (!after[k]) errors.push(`after ${k} missing`)
    if (before[k] && after[k] && before[k] !== after[k]) {
      errors.push(`runtime changed: ${k}`)
    }
  }
  if (doc.deploy_performed === true) errors.push("metadata migration must not deploy")
  if (doc.restart_performed === true) errors.push("metadata migration must not restart")
  if (doc.runtime_unchanged !== true && errors.every((e) => !e.startsWith("runtime changed"))) {
    errors.push("runtime_unchanged must be proven true")
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
    console.error("usage: validate-metadata-migration.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = evaluate(JSON.parse(fs.readFileSync(args[0], "utf8")))
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK metadata migration invariants")
}

main()
