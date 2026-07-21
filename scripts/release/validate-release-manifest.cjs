#!/usr/bin/env node
/**
 * Validate Woodright release manifest (schema-shaped checks + SHA parity).
 */
const fs = require("fs")
const path = require("path")

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/
const SHA_RE = /^[0-9a-f]{40}$/
const ALLOWED_ROOT = new Set([
  "schema_version",
  "release_sha",
  "branch",
  "pr_number",
  "workflow_run_id",
  "build_timestamp",
  "backend",
  "storefront",
  "catalog_order_version",
  "database_migrations",
  "deployment_owner",
  "target_environment",
  "previous",
  "rollback",
  "public_urls",
  "verification",
  "notes",
])
const ALLOWED_PREVIOUS = new Set(["release_sha", "backend_digest", "storefront_digest"])
const ALLOWED_ROLLBACK = new Set([
  "backend_keeper",
  "storefront_keeper",
  "backup_directory",
  "commands_path",
])
const ALLOWED_PUBLIC_URLS = new Set(["site", "catalog", "kids_catalog", "api"])
const ALLOWED_VERIFICATION = new Set([
  "verified_at",
  "marker",
  "product_count",
  "first_catalog_title",
  "notes",
])
const ALLOWED_IMAGE = new Set(["repository", "tag", "digest", "oci_revision", "oci_source"])

function isHttpUrl(s) {
  return typeof s === "string" && /^https?:\/\/.+/i.test(s)
}

function fail(msg, errors) {
  errors.push(msg)
}

function rejectExtra(obj, allowed, prefix, errors) {
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) fail(`${prefix}: additional property ${k}`, errors)
  }
}

function validateImage(side, img, releaseSha, errors) {
  if (!img || typeof img !== "object") {
    fail(`${side} required`, errors)
    return
  }
  rejectExtra(img, ALLOWED_IMAGE, side, errors)
  if (!img.repository) fail(`${side}.repository required`, errors)
  if (!DIGEST_RE.test(img.digest || "")) fail(`${side}.digest must be sha256:…`, errors)
  if (!SHA_RE.test(img.oci_revision || "")) fail(`${side}.oci_revision must be 40-char hex`, errors)
  if (img.tag != null && typeof img.tag !== "string") fail(`${side}.tag must be string|null`, errors)
  if (img.tag && String(img.tag).includes("@")) fail(`${side}.tag must not embed digest`, errors)
  if (img.oci_source != null && img.oci_source !== "" && !isHttpUrl(img.oci_source)) {
    fail(`${side}.oci_source must be http(s) URL`, errors)
  }
  if (releaseSha && img.oci_revision && img.oci_revision !== releaseSha) {
    fail(`${side}.oci_revision must equal release_sha`, errors)
  }
}

function validateManifest(doc, errors) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    fail("manifest must be an object", errors)
    return
  }
  for (const k of Object.keys(doc)) {
    if (!ALLOWED_ROOT.has(k)) fail(`additional property ${k}`, errors)
  }
  if (doc.schema_version !== "1") fail('schema_version must be "1"', errors)
  if (!SHA_RE.test(doc.release_sha || "")) fail("release_sha must be 40-char hex", errors)
  if (typeof doc.branch !== "string" || !doc.branch) fail("branch required string", errors)
  if (doc.pr_number != null && !Number.isInteger(doc.pr_number)) fail("pr_number must be int|null", errors)
  if (doc.workflow_run_id == null || doc.workflow_run_id === "") fail("workflow_run_id required", errors)
  if (typeof doc.build_timestamp !== "string" || !doc.build_timestamp) fail("build_timestamp required", errors)
  if (typeof doc.catalog_order_version !== "string" || !doc.catalog_order_version) {
    fail("catalog_order_version required", errors)
  }
  if (!Array.isArray(doc.database_migrations)) fail("database_migrations must be array", errors)
  else if (doc.database_migrations.some((x) => typeof x !== "string")) {
    fail("database_migrations items must be strings", errors)
  }
  if (typeof doc.deployment_owner !== "string" || !doc.deployment_owner) fail("deployment_owner required", errors)
  const envs = ["staging", "production", "candidate", "local-canonical"]
  if (!envs.includes(doc.target_environment)) fail("target_environment invalid", errors)

  validateImage("backend", doc.backend, doc.release_sha, errors)
  validateImage("storefront", doc.storefront, doc.release_sha, errors)
  if (doc.backend?.oci_revision && doc.storefront?.oci_revision) {
    if (doc.backend.oci_revision !== doc.storefront.oci_revision) {
      fail("backend/storefront oci_revision SHA mismatch", errors)
    }
  }

  const prev = doc.previous
  if (!prev || typeof prev !== "object" || Array.isArray(prev)) fail("previous required", errors)
  else {
    rejectExtra(prev, ALLOWED_PREVIOUS, "previous", errors)
    if (prev.release_sha != null && prev.release_sha !== "" && !SHA_RE.test(prev.release_sha)) {
      fail("previous.release_sha invalid", errors)
    }
    if (!DIGEST_RE.test(prev.backend_digest || "")) fail("previous.backend_digest invalid", errors)
    if (!DIGEST_RE.test(prev.storefront_digest || "")) fail("previous.storefront_digest invalid", errors)
  }

  const rb = doc.rollback
  if (!rb || typeof rb !== "object" || Array.isArray(rb)) fail("rollback required", errors)
  else {
    rejectExtra(rb, ALLOWED_ROLLBACK, "rollback", errors)
    for (const k of ["backend_keeper", "storefront_keeper", "backup_directory", "commands_path"]) {
      if (typeof rb[k] !== "string" || !rb[k]) fail(`rollback.${k} required string`, errors)
    }
  }

  const urls = doc.public_urls
  if (!urls || typeof urls !== "object" || Array.isArray(urls)) fail("public_urls required", errors)
  else {
    rejectExtra(urls, ALLOWED_PUBLIC_URLS, "public_urls", errors)
    if (!isHttpUrl(urls.site)) fail("public_urls.site must be http(s) URL", errors)
    if (!isHttpUrl(urls.catalog)) fail("public_urls.catalog must be http(s) URL", errors)
    if (urls.kids_catalog != null && urls.kids_catalog !== "" && !isHttpUrl(urls.kids_catalog)) {
      fail("public_urls.kids_catalog must be http(s) URL", errors)
    }
    if (urls.api != null && urls.api !== "" && !isHttpUrl(urls.api)) {
      fail("public_urls.api must be http(s) URL", errors)
    }
  }

  const ver = doc.verification
  if (!ver || typeof ver !== "object" || Array.isArray(ver)) fail("verification required", errors)
  else {
    rejectExtra(ver, ALLOWED_VERIFICATION, "verification", errors)
    if (!("verified_at" in ver)) fail("verification.verified_at required (may be null)", errors)
    if (ver.product_count != null && !Number.isInteger(ver.product_count)) {
      fail("verification.product_count must be integer|null", errors)
    }
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
  validateManifest(doc, errors)
  return { file, ok: errors.length === 0, errors }
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--fixture-dir") {
    const dir = args[1]
    const expectFail = new Set(
      fs.readdirSync(dir).filter((f) => f.startsWith("neg-") && f.endsWith(".json"))
    )
    let failed = 0
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const r = runOne(path.join(dir, f))
      const shouldFail = expectFail.has(f)
      const pass = shouldFail ? !r.ok : r.ok
      console.log(
        `${pass ? "PASS" : "FAIL"} ${f} (expect_${shouldFail ? "fail" : "ok"}) ${r.errors.join("; ")}`
      )
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  if (!args[0]) {
    console.error("usage: validate-release-manifest.cjs <manifest.json> | --fixture-dir <dir>")
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
