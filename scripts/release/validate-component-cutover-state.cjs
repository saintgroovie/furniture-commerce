#!/usr/bin/env node
/** SF-only/BE-only cutover must produce new bundle metadata (Gate AP). */
const fs = require("fs")
const path = require("path")

function evaluate(doc) {
  const errors = []
  const mode = doc.activation_mode
  if (mode === "storefront_only_cutover" || mode === "backend_only_cutover") {
    if (!doc.new_bundle_id) errors.push("component cutover must produce new bundle metadata")
    if (doc.previous_bundle_id && doc.new_bundle_id === doc.previous_bundle_id) {
      errors.push("component cutover must produce new bundle metadata")
    }
    if (doc.reused_old_release_sha_as_pair_identity === true) {
      errors.push("must not keep old single release sha as pair identity after component cutover")
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
    console.error("usage: validate-component-cutover-state.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = evaluate(JSON.parse(fs.readFileSync(args[0], "utf8")))
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK component cutover state")
}

main()
