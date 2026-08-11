#!/usr/bin/env node
/**
 * Verify live-mutating scripts declare the canonical global cutover lock.
 */
const fs = require("fs")
const path = require("path")

const CANONICAL = "/srv/woodright/locks/live-cutover.lock"

function scanFile(file, errors, warnings) {
  const text = fs.readFileSync(file, "utf8")
  const base = path.basename(file)
  // Only scripts that explicitly opt into live mutation (not validators documenting policy).
  const mutates = /^#?\s*LIVE_MUTATING\s*=\s*true/m.test(text) || /LIVE_MUTATING=true/.test(text)
  if (!mutates) return

  if (!text.includes(CANONICAL) && !text.includes("live-cutover.lock")) {
    errors.push(`${base}: live-mutating script missing canonical lock path`)
  }
  // Reject assigning flock lock under /tmp (not mentions inside regex source of this checker).
  if (/flock[^\n]{0,80}\/tmp\//i.test(text) && !/test\(text\)/.test(text)) {
    errors.push(`${base}: alternative /tmp lock path rejected`)
  }
  if (/LOCK_PATH\s*=\s*["']\/tmp\//.test(text)) {
    errors.push(`${base}: LOCK_PATH under /tmp rejected`)
  }
  if (!/flock/i.test(text) && /requires_global_lock/i.test(text)) {
    warnings.push(`${base}: declares requires_global_lock but no flock mention`)
  }
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--fixture-dir") {
    const dir = args[1]
    let failed = 0
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sh") || x.endsWith(".cjs") || x.endsWith(".txt"))) {
      const errors = []
      const warnings = []
      scanFile(path.join(dir, f), errors, warnings)
      const shouldFail = f.startsWith("neg-")
      const ok = errors.length === 0
      const pass = shouldFail ? !ok : ok
      console.log(`${pass ? "PASS" : "FAIL"} ${f} ${errors.join("; ")}`)
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  const roots = args.length ? args : ["scripts/release", "ops/release", "ops/lib", "apps/backend/scripts"]
  const errors = []
  const warnings = []
  function walk(d) {
    if (!fs.existsSync(d)) return
    for (const name of fs.readdirSync(d)) {
      if (name === "fixtures" || name === "node_modules") continue
      const p = path.join(d, name)
      const st = fs.statSync(p)
      if (st.isDirectory()) walk(p)
      else if (/\.(cjs|sh|py)$/.test(name)) scanFile(p, errors, warnings)
    }
  }
  for (const root of roots) walk(root)
  // Always require policy file declaring canonical lock
  const policy = path.join("scripts/release", "LIVE_MUTATION_LOCK_POLICY.txt")
  if (fs.existsSync(policy)) {
    const t = fs.readFileSync(policy, "utf8")
    if (!t.includes(CANONICAL)) errors.push("LIVE_MUTATION_LOCK_POLICY.txt missing canonical path")
  } else {
    errors.push("LIVE_MUTATION_LOCK_POLICY.txt missing")
  }
  for (const w of warnings) console.warn("WARN", w)
  if (errors.length) {
    console.error("FAIL\n" + errors.join("\n"))
    process.exit(1)
  }
  console.log("OK global lock policy")
}

main()
