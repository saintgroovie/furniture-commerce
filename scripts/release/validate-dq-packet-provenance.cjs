#!/usr/bin/env node
/**
 * DQ packet provenance (Gate AN + legacy Gate for S–AC).
 * Authoritative packets require bundle_id + BE/SF revisions + digests.
 * Legacy fixtures may use source_release_sha only when require_bundle is not set.
 */
const fs = require("fs")
const path = require("path")

const SHA_RE = /^[0-9a-f]{40}$/
const BUNDLE_RE = /^wrb-[0-9]{8}T[0-9]{6}Z-be[0-9a-f]{7,40}-sf[0-9a-f]{7,40}$/
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/

function evaluate(doc) {
  const errors = []
  const requireBundle = doc.require_bundle === true || doc.require_split_identity === true
  const hasBundle = BUNDLE_RE.test(doc.bundle_id || "")

  if (requireBundle || hasBundle) {
    if (!hasBundle) errors.push("bundle_id required")
    if (!SHA_RE.test(doc.backend_revision || "")) errors.push("backend_revision required")
    if (!SHA_RE.test(doc.storefront_revision || "")) errors.push("storefront_revision required")
    if (!DIGEST_RE.test(doc.backend_digest || "")) errors.push("backend_digest required")
    if (!DIGEST_RE.test(doc.storefront_digest || "")) errors.push("storefront_digest required")
    if (!Array.isArray(doc.field_source_matrix) || doc.field_source_matrix.length < 1) {
      errors.push("field-source matrix required")
    }
  } else if (!SHA_RE.test(doc.source_release_sha || "")) {
    errors.push("source_release_sha invalid")
  }

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
