#!/usr/bin/env node
/**
 * DQ packet provenance: source release, count, marker, checksum, mutations=false.
 */
const fs = require("fs")
const path = require("path")

const SHA_RE = /^[0-9a-f]{40}$/

function evaluate(doc) {
  const errors = []
  if (!SHA_RE.test(doc.source_release_sha || "")) errors.push("source_release_sha invalid")
  if (typeof doc.product_count !== "number" || doc.product_count < 0) errors.push("product_count required")
  if (!doc.marker) errors.push("marker required")
  if (!doc.generated_at) errors.push("generated_at required")
  if (!doc.checksum_sha256 || !/^[0-9a-f]{64}$/.test(doc.checksum_sha256)) errors.push("checksum_sha256 required")
  if (doc.mutations !== false) errors.push("mutations must be false")
  if (doc.automatic_apply === true) errors.push("automatic_apply must not be true")
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
    console.error("usage: validate-dq-packet-provenance.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = runOne(args[0])
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK dq packet provenance")
}

main()
