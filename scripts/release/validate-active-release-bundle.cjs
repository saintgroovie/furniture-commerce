#!/usr/bin/env node
/**
 * ACTIVE_RELEASE bundle pointer validator (v2).
 *
 * Production CLI (default): flat ACTIVE_RELEASE.json with manifest_path + checksum_sha256.
 * Checksum = SHA-256 of exact bytes at manifest_path.
 *
 * Fixture mode (--fixture-dir): may use envelope { active_release, manifest, checksum_sha256 }.
 */
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const BUNDLE_RE = /^wrb-[0-9]{8}T[0-9]{6}Z-be[0-9a-f]{7,40}-sf[0-9a-f]{7,40}$/
const SHA_RE = /^[0-9a-f]{40}$/
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/
const ACTIVATION = new Set([
  "pair_cutover",
  "storefront_only_cutover",
  "backend_only_cutover",
  "reconciled_external_cutover",
  "rollback",
])

function sha256Bytes(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex")
}

function bindManifest(active, manifest, errors) {
  const be = active.backend_revision || active.backend_oci_revision
  const sf = active.storefront_revision || active.storefront_oci_revision
  if (!manifest || typeof manifest !== "object") {
    errors.push("missing manifest")
    return
  }
  if (!manifest.bundle_id || !manifest.backend || !manifest.storefront) {
    errors.push("embedded manifest incomplete")
  }
  if (manifest.bundle_id && manifest.bundle_id !== active.bundle_id) {
    errors.push("manifest bundle_id mismatch")
  }
  if (!manifest.backend?.source_sha || manifest.backend.source_sha !== be) {
    errors.push("ACTIVE_RELEASE backend revision mismatch manifest")
  }
  if (!manifest.storefront?.source_sha || manifest.storefront.source_sha !== sf) {
    errors.push("ACTIVE_RELEASE storefront revision mismatch manifest")
  }
  if (!manifest.backend?.digest || manifest.backend.digest !== active.backend_digest) {
    errors.push("ACTIVE_RELEASE backend digest mismatch manifest")
  }
  if (!manifest.storefront?.digest || manifest.storefront.digest !== active.storefront_digest) {
    errors.push("ACTIVE_RELEASE storefront digest mismatch manifest")
  }
}

function evaluate(doc, opts = {}) {
  const errors = []
  const allowEnvelope = opts.allowEnvelope === true
  const isEnvelope = Boolean(doc.active_release)

  if (!allowEnvelope && isEnvelope) {
    errors.push("production mode rejects envelope; use flat ACTIVE_RELEASE with manifest_path")
  }
  if (!allowEnvelope && doc.manifest && !doc.active_release) {
    errors.push("production mode rejects embedded manifest; use manifest_path")
  }

  const active = allowEnvelope && doc.active_release ? doc.active_release : doc
  if (active.schema_version !== "2" && active.schema_version !== 2) {
    errors.push("schema_version must be 2")
  }
  if (!BUNDLE_RE.test(active.bundle_id || "")) errors.push("bundle_id required on ACTIVE_RELEASE")
  if (!ACTIVATION.has(active.activation_mode)) errors.push("activation_mode required")
  if (!SHA_RE.test(active.backend_revision || active.backend_oci_revision || "")) {
    errors.push("backend revision missing")
  }
  if (!SHA_RE.test(active.storefront_revision || active.storefront_oci_revision || "")) {
    errors.push("storefront revision missing")
  }
  if (!DIGEST_RE.test(active.backend_digest || "")) errors.push("backend digest missing")
  if (!DIGEST_RE.test(active.storefront_digest || "")) errors.push("storefront digest missing")

  const be = active.backend_revision || active.backend_oci_revision
  const sf = active.storefront_revision || active.storefront_oci_revision
  if (be && sf && be !== sf) {
    if (!BUNDLE_RE.test(active.bundle_id || "")) {
      errors.push("active pointer only contains one SHA for split pair invalid")
    }
    if (doc.split_described_by_single_sha === true) {
      errors.push("active pointer only contains one SHA for split pair invalid")
    }
  }

  let manifest = null
  let checksumHex = null
  let manifestBytes = null

  if (doc.manifest_missing === true) {
    errors.push("missing manifest")
  } else if (allowEnvelope && isEnvelope && doc.manifest) {
    checksumHex = doc.checksum_sha256
    manifest = doc.manifest
    manifestBytes = Buffer.from(doc.manifest_raw != null ? doc.manifest_raw : JSON.stringify(manifest))
  } else if (active.manifest_path) {
    checksumHex = active.checksum_sha256 || active.manifest_checksum_sha256
    const mp = active.manifest_path
    const candidates = []
    if (opts.cwd) candidates.push(path.resolve(opts.cwd, mp))
    if (path.isAbsolute(mp)) candidates.push(mp)
    if (mp.startsWith("/srv/woodright/releases/")) {
      candidates.push(mp.replace("/srv/woodright/releases/", "/releases/"))
    }
    let found = null
    for (const c of candidates) {
      try {
        if (fs.existsSync(c) && fs.statSync(c).isFile()) {
          found = c
          break
        }
      } catch {
        /* continue */
      }
    }
    if (!found) {
      errors.push("missing manifest")
    } else {
      manifestBytes = fs.readFileSync(found)
      try {
        manifest = JSON.parse(manifestBytes.toString("utf8"))
      } catch {
        errors.push("manifest JSON parse failed")
      }
    }
  } else if (allowEnvelope && doc.manifest) {
    checksumHex = doc.checksum_sha256
    manifest = doc.manifest
    manifestBytes = Buffer.from(JSON.stringify(manifest))
  } else {
    errors.push("missing manifest")
    if (!active.manifest_path && !allowEnvelope) errors.push("manifest_path required")
  }

  if (!checksumHex) {
    errors.push("checksum_sha256 required")
  } else if (manifestBytes) {
    if (sha256Bytes(manifestBytes) !== checksumHex) errors.push("checksum mismatch")
  }

  if (manifest && be && sf) bindManifest(active, manifest, errors)

  return { ok: errors.length === 0, errors }
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--fixture-dir") {
    const dir = args[1]
    let failed = 0
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const r = evaluate(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), {
        cwd: dir,
        allowEnvelope: true,
      })
      const shouldFail = f.startsWith("neg-")
      const pass = shouldFail ? !r.ok : r.ok
      console.log(`${pass ? "PASS" : "FAIL"} ${f} ${r.errors.join("; ")}`)
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  if (!args[0]) {
    console.error(
      "usage: validate-active-release-bundle.cjs <ACTIVE_RELEASE.json>|--fixture-dir <d>\n" +
        "  Production: flat JSON with manifest_path + checksum_sha256 (exact file bytes)."
    )
    process.exit(2)
  }
  const file = args[0]
  const doc = JSON.parse(fs.readFileSync(file, "utf8"))
  const r = evaluate(doc, { cwd: path.dirname(path.resolve(file)), allowEnvelope: false })
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK active release bundle pointer")
}

main()
