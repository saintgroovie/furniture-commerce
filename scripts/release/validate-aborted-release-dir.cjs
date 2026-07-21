#!/usr/bin/env node
/**
 * Aborted release directory cleanup gate (empty + unreferenced only).
 */
const fs = require("fs")
const path = require("path")

function evaluate(doc) {
  const errors = []
  if (doc.empty !== true) errors.push("directory not empty")
  if (doc.referenced_by_active === true) errors.push("referenced by ACTIVE_RELEASE")
  if (doc.referenced_by_prepared === true) errors.push("referenced by PREPARED_RELEASE")
  if (doc.referenced_by_transaction === true) errors.push("referenced by cutover transaction")
  if (doc.referenced_by_audit === true) errors.push("referenced by audit log")
  if (doc.referenced_by_rollback === true) errors.push("referenced by rollback")
  if (doc.contains_manifest === true) errors.push("contains manifest")
  if (doc.is_backup === true) errors.push("is backup")
  if (doc.codex_safe_to_remove !== true) errors.push("Codex safe_to_remove_empty_release_dir required")
  return { allowed: errors.length === 0, errors }
}

function runOne(file) {
  return evaluate(JSON.parse(fs.readFileSync(file, "utf8")))
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--fixture-dir") {
    const dir = args[1]
    let failed = 0
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const r = runOne(path.join(dir, f))
      const shouldFail = f.startsWith("neg-")
      const pass = shouldFail ? !r.allowed : r.allowed
      console.log(`${pass ? "PASS" : "FAIL"} ${f} ${r.errors.join("; ")}`)
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  if (!args[0]) {
    console.error("usage: validate-aborted-release-dir.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = runOne(args[0])
  if (!r.allowed) {
    console.error("PRESERVE", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK removable empty aborted release dir")
}

main()
