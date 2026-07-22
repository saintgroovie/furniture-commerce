#!/usr/bin/env node
/** Non-public stack recreate attribution (BL/BM). */
const fs = require("fs")
const path = require("path")

const ATTR = new Set([
  "attributed_complete",
  "attributed_controller_actor_unknown",
  "external_unattributed",
  "unsafe_unknown_mutation",
  "unchanged",
])

function evaluate(doc) {
  const errors = []
  const stacks = doc.stacks || [doc]
  for (const s of stacks) {
    if (s.container_id_changed === true && !ATTR.has(s.attribution_status)) {
      errors.push("changed container ID without attribution status")
    }
    if (s.container_id_changed === true && s.attribution_status === "unchanged") {
      errors.push("changed container ID without attribution status")
    }
    if (s.public_role_from_name_alone === true) {
      errors.push("container name used as sole public-role evidence")
    }
    if (s.attribution_status && !ATTR.has(s.attribution_status)) {
      errors.push("invalid attribution status")
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
    console.error("usage: validate-stack-mutation-attribution.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = evaluate(JSON.parse(fs.readFileSync(args[0], "utf8")))
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK stack mutation attribution")
}

module.exports = { evaluate }
if (require.main === module) main()
