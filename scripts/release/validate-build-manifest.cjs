#!/usr/bin/env node
/**
 * Validate Woodright build manifest (build ≠ release).
 */
const fs = require("fs")
const path = require("path")
const { uniqueBuildTag } = require("./build-identity.cjs")

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/
const SHA_RE = /^[0-9a-f]{40}$/
const SECRETISH = /(password|secret|token|api[_-]?key|private[_-]?key|BEGIN )/i

const ALLOWED_ROOT = new Set([
  "schema_version",
  "source_sha",
  "source_branch",
  "workflow_name",
  "workflow_run_id",
  "workflow_run_attempt",
  "event_name",
  "actor",
  "build_started_at",
  "build_completed_at",
  "backend",
  "storefront",
  "convenience_aliases",
  "build_argument_names",
  "build_config_fingerprint",
  "tests_summary",
  "release_authorized",
  "notes",
])
const ALLOWED_IMG = new Set(["repository", "unique_tag", "digest", "oci_revision"])

function fail(msg, errors) {
  errors.push(msg)
}

function rejectExtra(obj, allowed, prefix, errors) {
  for (const k of Object.keys(obj || {})) {
    if (!allowed.has(k)) fail(`${prefix}: additional property ${k}`, errors)
  }
}

function scanSecrets(doc, errors) {
  const s = JSON.stringify(doc)
  if (SECRETISH.test(s)) fail("secret-looking values forbidden in build manifest", errors)
}

function validateImage(side, img, sourceSha, errors) {
  if (!img || typeof img !== "object") {
    fail(`${side} required`, errors)
    return
  }
  rejectExtra(img, ALLOWED_IMG, side, errors)
  if (!img.repository) fail(`${side}.repository required`, errors)
  if (!DIGEST_RE.test(img.digest || "")) fail(`${side}.digest required`, errors)
  if (!SHA_RE.test(img.oci_revision || "")) fail(`${side}.oci_revision required`, errors)
  if (img.oci_revision !== sourceSha) fail(`${side}.oci_revision must equal source_sha`, errors)
  if (!img.unique_tag || !String(img.unique_tag).startsWith("build-")) {
    fail(`${side}.unique_tag must start with build-`, errors)
  }
}

function validate(doc, errors) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    fail("manifest must be object", errors)
    return
  }
  rejectExtra(doc, ALLOWED_ROOT, "root", errors)
  scanSecrets(doc, errors)
  if (doc.schema_version !== "1") fail('schema_version must be "1"', errors)
  if (!SHA_RE.test(doc.source_sha || "")) fail("source_sha invalid", errors)
  if (!doc.source_branch) fail("source_branch required", errors)
  if (!doc.workflow_name) fail("workflow_name required", errors)
  if (doc.workflow_run_id == null || doc.workflow_run_id === "") fail("workflow_run_id required", errors)
  if (!Number.isInteger(doc.workflow_run_attempt) || doc.workflow_run_attempt < 1) {
    fail("workflow_run_attempt required integer >= 1", errors)
  }
  if (!doc.event_name) fail("event_name required", errors)
  if (!doc.build_started_at || !doc.build_completed_at) fail("build timestamps required", errors)
  if (!Array.isArray(doc.convenience_aliases)) fail("convenience_aliases must be array", errors)
  else {
    for (const a of doc.convenience_aliases) {
      if (!a || a.mutable !== true) fail("convenience aliases must set mutable=true", errors)
    }
  }
  if (!Array.isArray(doc.build_argument_names)) fail("build_argument_names must be array", errors)
  if (!doc.build_config_fingerprint) fail("build_config_fingerprint required", errors)
  if (doc.release_authorized !== false) fail("release_authorized must be false on build manifest", errors)

  validateImage("backend", doc.backend, doc.source_sha, errors)
  validateImage("storefront", doc.storefront, doc.source_sha, errors)
  if (doc.backend?.oci_revision && doc.storefront?.oci_revision) {
    if (doc.backend.oci_revision !== doc.storefront.oci_revision) {
      fail("backend/storefront oci_revision mismatch", errors)
    }
  }
  if (!doc.backend?.digest || !doc.storefront?.digest) {
    fail("partial image pair not releasable", errors)
  } else if (doc.backend.digest === doc.storefront.digest) {
    fail("backend and storefront digests must differ", errors)
  }

  try {
    const expected = uniqueBuildTag({
      sourceSha: doc.source_sha,
      runId: doc.workflow_run_id,
      attempt: doc.workflow_run_attempt,
    })
    if (doc.backend?.unique_tag && doc.backend.unique_tag !== expected) {
      fail(`backend.unique_tag must equal ${expected}`, errors)
    }
    if (doc.storefront?.unique_tag && doc.storefront.unique_tag !== expected) {
      fail(`storefront.unique_tag must equal ${expected}`, errors)
    }
  } catch (e) {
    fail(String(e.message || e), errors)
  }
}

function runOne(file) {
  const errors = []
  let doc
  try {
    doc = JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (e) {
    return { file, ok: false, errors: [`parse: ${e.message}`] }
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
    console.error("usage: validate-build-manifest.cjs <file> | --fixture-dir <dir>")
    process.exit(2)
  }
  const r = runOne(args[0])
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK", args[0])
}

main()
