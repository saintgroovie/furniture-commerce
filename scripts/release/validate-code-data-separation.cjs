#!/usr/bin/env node
/** Code/data separation + report correctness helpers (BB/BC). */
const fs = require("fs")
const path = require("path")

function evaluateReport(text) {
  const errors = []
  if (/proposal\s+approved|agent\s+proposal\s+is\s+owner\s+approval/i.test(text) && !/not\s+approved/i.test(text)) {
    errors.push("proposal called approved")
  }
  if (/dry-run\s+(was\s+)?applied|dry-run\s+executed\s+mutation/i.test(text)) {
    errors.push("dry-run called applied")
  }
  if (/dto\s+gap[s]?\s+(are|is|=)\s+owner\s+data\s+gap/i.test(text)) {
    errors.push("DTO gap called owner data gap")
  }
  if (/review\s+date\s+(is|=)\s+cleanup\s+permission/i.test(text)) {
    errors.push("review date called cleanup permission")
  }
  if (/container\s+name\s+(is|=)\s+environment\s+proof/i.test(text)) {
    errors.push("container name called environment proof")
  }
  if (/bypass\s+closed\s+without\s+negative\s+test|claim_bypass_closed\s*=\s*true.*without\s+negative/i.test(text)) {
    errors.push("Dokploy bypass called closed without negative test")
  }
  return { ok: errors.length === 0, errors }
}

function evaluateSeparation(doc) {
  const errors = []
  if (doc.deploy_script_contains_unapproved_catalog_mutation === true) {
    errors.push("application deploy script containing unapproved catalog mutation")
  }
  if (doc.mutation_manifest_contains_image_cutover === true) {
    errors.push("catalog mutation manifest containing image cutover")
  }
  return { ok: errors.length === 0, errors }
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--fixture-dir") {
    const dir = args[1]
    let failed = 0
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f)
      let r
      if (f.endsWith(".md")) r = evaluateReport(fs.readFileSync(p, "utf8"))
      else if (f.endsWith(".json")) r = evaluateSeparation(JSON.parse(fs.readFileSync(p, "utf8")))
      else continue
      const shouldFail = f.startsWith("neg-")
      const pass = shouldFail ? !r.ok : r.ok
      console.log(`${pass ? "PASS" : "FAIL"} ${f} ${r.errors.join("; ")}`)
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  console.error("usage: validate-code-data-separation.cjs --fixture-dir <d>")
  process.exit(2)
}

main()
