#!/usr/bin/env node
/**
 * Active-after-public gate: final active event requires health + public + digests.
 */
const fs = require("fs")
const path = require("path")

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/
const SHA_RE = /^[0-9a-f]{40}$/

function evaluate(doc) {
  const errors = []
  if (doc.state !== "active" && doc.event !== "active") {
    errors.push("fixture must target active")
  }
  if (doc.health?.backend !== "healthy") errors.push("backend not healthy")
  if (doc.health?.storefront !== "healthy") errors.push("storefront not healthy")
  if (doc.public_verification?.passed !== true) errors.push("public verification required")
  if (!doc.release_manifest_ref && !doc.release_manifest) errors.push("release manifest required")
  if (!SHA_RE.test(doc.release_sha || "")) errors.push("release_sha required")
  if (!DIGEST_RE.test(doc.backend_digest || "")) errors.push("backend_digest required")
  if (!DIGEST_RE.test(doc.storefront_digest || "")) errors.push("storefront_digest required")
  return { ok: errors.length === 0, errors }
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
      const pass = shouldFail ? !r.ok : r.ok
      console.log(`${pass ? "PASS" : "FAIL"} ${f} ${r.errors.join("; ")}`)
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  if (!args[0]) {
    console.error("usage: validate-active-after-public.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = runOne(args[0])
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK active-after-public")
}

main()
