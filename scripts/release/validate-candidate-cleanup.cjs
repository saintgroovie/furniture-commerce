#!/usr/bin/env node
/**
 * Candidate cleanup gate (review date ≠ permission).
 */
const fs = require("fs")
const path = require("path")

function evaluate(doc) {
  const errors = []
  const now = doc.now_iso ? Date.parse(doc.now_iso) : Date.now()
  const reviewAfter = doc.review_after ? Date.parse(doc.review_after) : NaN
  if (!doc.owner_approval) errors.push("owner_approval required for cleanup")
  if (doc.public_route === true) errors.push("public_route=true blocks cleanup")
  if (doc.active_task === true) errors.push("active_task blocks cleanup")
  if (!doc.owner) errors.push("unknown owner blocks cleanup")
  if (!Number.isFinite(reviewAfter)) errors.push("review_after missing")
  // Even after review date, still need owner_approval (rule 56)
  if (Number.isFinite(reviewAfter) && now < reviewAfter && !doc.owner_approval) {
    errors.push("before review_after without approval")
  }
  if (Number.isFinite(reviewAfter) && now >= reviewAfter && !doc.owner_approval) {
    errors.push("after review_after still requires owner_approval")
  }
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
    console.error("usage: validate-candidate-cleanup.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = runOne(args[0])
  if (!r.allowed) {
    console.error("REJECTED", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK candidate cleanup allowed")
}

main()
