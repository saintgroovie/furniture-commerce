#!/usr/bin/env node
/** Public route uniqueness (AU). */
const fs = require("fs")
const path = require("path")

function evaluate(doc) {
  const errors = []
  const domains = doc.domains || []
  if (!Array.isArray(domains) || domains.length < 1) {
    errors.push("domains required")
  }
  for (const d of domains) {
    const targets = d.storefront_targets || []
    const backends = d.backend_targets || []
    if (targets.length !== 1) errors.push("duplicate conflicting domain")
    if (d.name === "woodright-demo.ru" || d.name === "api.woodright-demo.ru") {
      if (backends.length !== 1 && d.require_backend !== false) {
        // for woodright-demo.ru site, backend may be on api subdomain; allow if documented
        if (d.name === "api.woodright-demo.ru" && backends.length !== 1) {
          errors.push("duplicate conflicting domain")
        }
      }
    }
    if (d.candidate_has_public_route === true) errors.push("candidate with public route")
  }
  if (doc.public_storefront_count != null && doc.public_storefront_count !== 1) {
    errors.push("duplicate conflicting domain")
  }
  if (doc.ambiguous_route === true) errors.push("duplicate conflicting domain")
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
    console.error("usage: validate-public-route-uniqueness.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = evaluate(JSON.parse(fs.readFileSync(args[0], "utf8")))
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK public route uniqueness")
}

main()
