#!/usr/bin/env node
/** Stack registry validator (AT/AV). */
const fs = require("fs")
const path = require("path")

const ROLES = new Set([
  "public_demo",
  "staging",
  "non_public_candidate",
  "production_candidate", // legacy alias; prefer non_public_candidate
  "rehearsal",
  "rollback_keeper",
  "owner_review",
  "abandoned_unknown",
  "preserved_candidate",
])
const SHA_RE = /^[0-9a-f]{40}$/
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/

function evaluate(doc) {
  const errors = []
  const stacks = doc.stacks || doc.entries || []
  if (!Array.isArray(stacks) || stacks.length < 1) errors.push("stacks required")
  const ids = new Set()
  let publicCount = 0
  for (const s of stacks) {
    if (!s.stack_id) errors.push("missing stack_id")
    if (ids.has(s.stack_id)) errors.push("duplicate stack ID")
    ids.add(s.stack_id)
    if (!s.owner) errors.push("missing owner")
    if (!ROLES.has(s.actual_role)) errors.push("missing role")
    if (s.public_route == null) errors.push("public_route required")
    if (!s.environment_identity) errors.push("environment_identity required")
    if (s.cleanup_requires_owner_approval !== true) errors.push("cleanup_requires_owner_approval required")
    if (s.public_route === true) publicCount++
    if (s.public_route === true && s.actual_role === "preserved_candidate") {
      errors.push("candidate with public route")
    }
    // Name alone cannot set production status
    if (s.claimed_production_from_name === true) {
      errors.push("name alone cannot set production status")
    }
    if (/production/i.test(s.display_name || s.stack_id || "") && !s.actual_role) {
      errors.push("misleading container name requires explicit actual_role")
    }
    if (s.backend_revision && !SHA_RE.test(s.backend_revision)) errors.push("malformed revision")
    if (s.storefront_revision && !SHA_RE.test(s.storefront_revision)) errors.push("malformed revision")
    if (s.backend_digest && !DIGEST_RE.test(s.backend_digest)) errors.push("malformed revision")
    if (s.storefront_digest && !DIGEST_RE.test(s.storefront_digest)) errors.push("malformed revision")
    if (s.review_after && s.cleanup_authorized_by_review_date === true) {
      errors.push("review date is not cleanup approval")
    }
  }
  // Always require named production candidate + public when registry claims completeness
  if (doc.schema_complete !== false) {
    const pub = stacks.filter((s) => s.public_route === true)
    if (pub.length < 1) errors.push("public stack registered missing")
    const pc = stacks.find((s) => /woodright-production/i.test(s.display_name || s.stack_id || ""))
    if (!pc) errors.push("non-public stack registered missing")
    else {
      if (
        pc.actual_role !== "production_candidate" &&
        pc.actual_role !== "non_public_candidate" &&
        pc.actual_role !== "rehearsal"
      ) {
        errors.push("production named stack role unresolved")
      }
      if (pc.public_route !== false) errors.push("production named stack must not be public")
    }
  }
  if (publicCount > 1 && doc.allow_multiple_public !== true) {
    // informational for registry; route uniqueness is separate gate
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
    console.error("usage: validate-stack-registry.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = evaluate(JSON.parse(fs.readFileSync(args[0], "utf8")))
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK stack registry")
}

main()
