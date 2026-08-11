#!/usr/bin/env node
/**
 * Validate release bundle manifest v2 (split-pair aware).
 */
const fs = require("fs")
const path = require("path")

const BUNDLE_RE = /^wrb-([0-9]{8}T[0-9]{6}Z)-be([0-9a-f]{7,40})-sf([0-9a-f]{7,40})$/
const SHA_RE = /^[0-9a-f]{40}$/
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/

function fail(errors, msg) {
  errors.push(msg)
}

function validateComponent(label, c, errors) {
  if (!c || typeof c !== "object") {
    fail(errors, `${label} required`)
    return
  }
  if (c.component !== label) fail(errors, `${label}.component must be ${label}`)
  if (!c.repository) fail(errors, `${label}.repository missing`)
  if (!SHA_RE.test(c.source_sha || "")) fail(errors, `${label}.source_sha invalid`)
  if (c.workflow_run_id == null || c.workflow_run_id === "") fail(errors, `${label}.workflow_run_id missing`)
  if (!Number.isInteger(c.workflow_run_attempt) || c.workflow_run_attempt < 1) {
    fail(errors, `${label}.workflow_run_attempt missing`)
  }
  if (!c.unique_build_tag) fail(errors, `${label}.unique_build_tag missing`)
  if (c.pr_number == null && c.pr == null) fail(errors, `${label}.pr missing`)
  if (!DIGEST_RE.test(c.digest || "")) fail(errors, `${label}.digest invalid`)
  if (!SHA_RE.test(c.oci_revision || "")) fail(errors, `${label}.oci_revision invalid`)
  if (c.oci_revision && c.source_sha && c.oci_revision !== c.source_sha) {
    fail(errors, `${label} OCI revision mismatch source_sha`)
  }
}

function validateBundle(doc, errors) {
  if (!doc || typeof doc !== "object") {
    fail(errors, "bundle must be object")
    return
  }
  if (doc.schema_version !== "2") fail(errors, 'schema_version must be "2"')
  const m = BUNDLE_RE.exec(doc.bundle_id || "")
  if (!m) fail(errors, "bundle_id invalid format")
  if (/^[0-9a-f]{40}$/.test(doc.bundle_id || "")) fail(errors, "bundle_id must not be a bare Git SHA")
  validateComponent("backend", doc.backend, errors)
  validateComponent("storefront", doc.storefront, errors)
  if (!doc.backend?.source_sha) fail(errors, "missing backend revision")
  if (!doc.storefront?.source_sha) fail(errors, "missing storefront revision")
  if (!doc.backend?.digest) fail(errors, "one digest missing (backend)")
  if (!doc.storefront?.digest) fail(errors, "one digest missing (storefront)")

  if (m && doc.backend?.source_sha && doc.storefront?.source_sha) {
    const beShort = m[2]
    const sfShort = m[3]
    if (!doc.backend.source_sha.startsWith(beShort)) {
      fail(errors, "bundle_id be suffix mismatch backend.source_sha")
    }
    if (!doc.storefront.source_sha.startsWith(sfShort)) {
      fail(errors, "bundle_id sf suffix mismatch storefront.source_sha")
    }
  }

  const cc = doc.compatibility_contract
  if (!cc || cc.status !== "compatible") {
    if (doc.backend?.source_sha !== doc.storefront?.source_sha) {
      fail(errors, "split pair without compatibility evidence")
    }
  }
  if (doc.backend?.source_sha !== doc.storefront?.source_sha) {
    if (!cc?.evidence_path) fail(errors, "split pair requires compatibility evidence_path")
    if (doc.verification?.public_passed !== true) fail(errors, "split pair missing public QA")
    const req = cc?.required_store_api_contract
    const prov = cc?.provided_store_api_contract
    if (!req || !prov) fail(errors, "incompatible API contract")
    else if (req !== prov) fail(errors, "incompatible API contract")
    if (cc?.migrations_compatible !== true) fail(errors, "migrations mismatch")
  }
  if (Array.isArray(doc.migrations) === false) fail(errors, "migrations must be array")
  if (doc.rollback?.mode === "backend_only" && doc.rollback?.backend_only_allowed !== true) {
    fail(errors, "invalid BE-only rollback rejected if contract disallows it")
  }
}

function runOne(file) {
  const errors = []
  let doc
  try {
    doc = JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (e) {
    return { ok: false, errors: [e.message] }
  }
  validateBundle(doc, errors)
  return { ok: errors.length === 0, errors }
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
    console.error("usage: validate-release-bundle-manifest.cjs <file>|--fixture-dir <d>")
    process.exit(2)
  }
  const r = runOne(args[0])
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK bundle manifest v2")
}

module.exports = { validateBundle, BUNDLE_RE }
if (require.main === module) main()
