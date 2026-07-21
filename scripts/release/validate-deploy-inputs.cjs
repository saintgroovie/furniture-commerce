#!/usr/bin/env node
/**
 * Validate deploy inputs before cutover (dry-run safe).
 */
const fs = require("fs")
const path = require("path")

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/
const SHA_RE = /^[0-9a-f]{40}$/

function validate(input, errors) {
  if (!input || typeof input !== "object") {
    errors.push("input must be object")
    return
  }
  if (!SHA_RE.test(input.release_sha || "")) errors.push("release_sha invalid")
  for (const side of ["backend", "storefront"]) {
    const d = input[side]
    if (!d) {
      errors.push(`${side} missing`)
      continue
    }
    if (!d.digest || !DIGEST_RE.test(d.digest)) {
      errors.push(`${side}: exact digest required (not tag alone)`)
    }
    if (!d.oci_revision || !SHA_RE.test(d.oci_revision)) {
      errors.push(`${side}: oci_revision (40-char SHA) required`)
    }
    if (d.oci_revision && d.oci_revision !== input.release_sha) {
      errors.push(`${side}: oci_revision != release_sha`)
    }
    const ref = typeof d.ref === "string" ? d.ref : ""
    if (ref) {
      if (/:(latest|stable|prod|staging)(@|$)/i.test(ref) || /\/latest(@|$)/i.test(ref)) {
        errors.push(`${side}: floating tag in ref rejected (latest/stable/…)`)
      }
      if (!ref.includes("@sha256:")) {
        errors.push(`${side}: ref must be digest-pinned (image@sha256:…)`)
      }
    }
  }
  if (
    input.backend?.oci_revision &&
    input.storefront?.oci_revision &&
    input.backend.oci_revision !== input.storefront.oci_revision
  ) {
    errors.push("backend/storefront SHA mismatch")
  }
  if (input.tag_drift === true) {
    errors.push("mutable tag drift detected — pin digest; do not deploy from tag")
  }
  if (!input.rollback?.backend_keeper || !input.rollback?.storefront_keeper) {
    errors.push("missing rollback keepers")
  }
  if (!input.rollback?.commands_path) errors.push("missing rollback commands_path")
  if (input.owner_files_agree !== true) errors.push("owner_files_agree must be true")
  if (input.competing_controller === true) errors.push("competing controller active")
  if (input.dirty_source === true) errors.push("dirty release source")
}

function runOne(file) {
  const errors = []
  let doc
  try {
    doc = JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (e) {
    return { file, ok: false, errors: [e.message] }
  }
  validate(doc, errors)
  return { file, ok: errors.length === 0, errors }
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
    console.error("usage: validate-deploy-inputs.cjs <file> | --fixture-dir <dir>")
    process.exit(2)
  }
  const r = runOne(args[0])
  if (!r.ok) {
    console.error("REJECT", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK deploy inputs")
}

main()
