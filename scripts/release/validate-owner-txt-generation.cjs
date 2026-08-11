#!/usr/bin/env node
/** Owner TXT generation consistency (BE/BF/BI). */
const fs = require("fs")
const path = require("path")

function evaluate(doc) {
  const errors = []
  const active = doc.active || {}
  const txt = doc.owner_txt || {}
  if (doc.hand_edited_inconsistent === true) {
    errors.push("TXT hand-edited inconsistent with active JSON")
  }
  if (txt.desired_git_sha && active.component_revisions) {
    const revs = [active.component_revisions.backend, active.component_revisions.storefront]
    if (!revs.includes(txt.desired_git_sha) && txt.presents_as_active === true) {
      errors.push("active view must not contain stale intent SHA")
    }
  }
  if (doc.generated_consistent === false) {
    errors.push("TXT hand-edited inconsistent with active JSON")
  }
  if (doc.keeper_referenced_as_active === true) {
    errors.push("exited rollback keeper referenced as active container")
  }
  const requiredPairs = [
    ["backend_container_id", "live_backend_container_id"],
    ["storefront_container_id", "live_storefront_container_id"],
    ["backend_digest", "live_backend_digest"],
    ["storefront_digest", "live_storefront_digest"],
  ]
  for (const [ak, lk] of requiredPairs) {
    if (doc.require_complete_observations !== false) {
      if (!active[ak] || !doc[lk]) {
        errors.push("ACTIVE_RELEASE container/digest mismatch")
        continue
      }
    }
    if (active[ak] && doc[lk] && active[ak] !== doc[lk]) {
      errors.push("ACTIVE_RELEASE container/digest mismatch")
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    reconciliation_required: errors.some((e) => e.includes("mismatch")),
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
    console.error("usage: validate-owner-txt-generation.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = evaluate(JSON.parse(fs.readFileSync(args[0], "utf8")))
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK owner txt generation")
}

module.exports = { evaluate }
if (require.main === module) main()
