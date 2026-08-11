#!/usr/bin/env node
/**
 * Validate ACTIVE_RELEASE vs ACTIVE_OWNER (+ optional TXT + container digests).
 * Positive fixtures require checksum file. Owner TXT must agree when provided.
 */
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/
const SHA_RE = /^[0-9a-f]{40}$/

function parseTxt(text) {
  const out = {}
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

function check({ release, owner, txt, containerBackendDigest, containerStorefrontDigest, errors }) {
  if (!release || typeof release !== "object") {
    errors.push("release missing")
    return
  }
  if (!owner || typeof owner !== "object") {
    errors.push("owner missing")
    return
  }
  if (!SHA_RE.test(release.release_sha || "")) errors.push("release.release_sha invalid")
  if (!DIGEST_RE.test(release.backend?.digest || "")) errors.push("release.backend.digest invalid")
  if (!DIGEST_RE.test(release.storefront?.digest || "")) errors.push("release.storefront.digest invalid")

  const oSha = owner.desired_git_sha || owner.release_sha
  if (oSha !== release.release_sha) {
    errors.push(`owner/release SHA mismatch owner=${oSha} release=${release.release_sha}`)
  }

  const oBe = owner.running_backend_digest || owner.backend_desired_registry_digest
  const oSf = owner.running_storefront_digest || owner.desired_registry_digest
  if (oBe !== release.backend.digest) errors.push("owner/release backend digest mismatch")
  if (oSf !== release.storefront.digest) errors.push("owner/release storefront digest mismatch")

  if (txt) {
    if (!txt.desired_git_sha) errors.push("owner TXT desired_git_sha missing")
    else if (txt.desired_git_sha !== release.release_sha) {
      errors.push("owner TXT/release SHA mismatch")
    }
    if (!txt.desired_registry_digest || txt.desired_registry_digest !== release.storefront.digest) {
      errors.push("owner TXT/release storefront digest mismatch")
    }
    if (
      !txt.backend_desired_registry_digest ||
      txt.backend_desired_registry_digest !== release.backend.digest
    ) {
      errors.push("owner TXT/release backend digest mismatch")
    }
  }

  if (containerBackendDigest && containerBackendDigest !== release.backend.digest) {
    errors.push("container/release backend digest mismatch")
  }
  if (containerStorefrontDigest && containerStorefrontDigest !== release.storefront.digest) {
    errors.push("container/release storefront digest mismatch")
  }

  if (release.deploy_image_ref && !String(release.deploy_image_ref).includes("@sha256:")) {
    errors.push("active manifest must not reference mutable tag as deploy identity")
  }
  if (!release.rollback?.backend_keeper || !release.rollback?.storefront_keeper) {
    errors.push("missing rollback keepers")
  }
}

function checkWithPaths({
  releasePath,
  ownerPath,
  txtPath,
  checksumPath,
  requireChecksum,
  containerBackendDigest,
  containerStorefrontDigest,
}) {
  const errors = []
  const release = JSON.parse(fs.readFileSync(releasePath, "utf8"))
  const owner = JSON.parse(fs.readFileSync(ownerPath, "utf8"))
  const txt = txtPath && fs.existsSync(txtPath) ? parseTxt(fs.readFileSync(txtPath, "utf8")) : null
  if (requireChecksum || checksumPath) {
    if (!checksumPath || !fs.existsSync(checksumPath)) errors.push("checksum file missing")
    else {
      const expected = fs.readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0]
      const actual = crypto.createHash("sha256").update(fs.readFileSync(releasePath)).digest("hex")
      if (expected !== actual) errors.push("active manifest checksum mismatch")
    }
  }
  check({
    release,
    owner,
    txt,
    containerBackendDigest,
    containerStorefrontDigest,
    errors,
  })
  return { ok: errors.length === 0, errors }
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--fixture-dir") {
    const dir = args[1]
    let failed = 0
    for (const name of fs.readdirSync(dir)) {
      const sub = path.join(dir, name)
      if (!fs.statSync(sub).isDirectory()) continue
      const releasePath = path.join(sub, "release-manifest.json")
      const ownerPath = path.join(sub, "ACTIVE_OWNER.json")
      const txtPath = path.join(sub, "ACTIVE-RUNTIME-OWNER.txt")
      const checksumPath = path.join(sub, "release-manifest.json.sha256")
      const metaPath = path.join(sub, "meta.json")
      const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : {}
      const requireChecksum = !name.startsWith("neg-") || name === "neg-missing-checksum" || name === "neg-bad-checksum"
      const r = checkWithPaths({
        releasePath,
        ownerPath,
        txtPath: fs.existsSync(txtPath) ? txtPath : null,
        checksumPath: fs.existsSync(checksumPath) ? checksumPath : null,
        requireChecksum,
        containerBackendDigest: meta.container_backend_digest || null,
        containerStorefrontDigest: meta.container_storefront_digest || null,
      })
      // Positive fixtures must include TXT
      if (name.startsWith("ok-") && !fs.existsSync(txtPath)) {
        r.ok = false
        r.errors.push("positive fixture missing ACTIVE-RUNTIME-OWNER.txt")
      }
      const shouldFail = name.startsWith("neg-")
      const pass = shouldFail ? !r.ok : r.ok
      console.log(`${pass ? "PASS" : "FAIL"} ${name} ${r.errors.join("; ")}`)
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }

  let releasePath, ownerPath, txtPath, checksumPath, be, sf
  let requireChecksum = true
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--release") releasePath = args[++i]
    if (args[i] === "--owner") ownerPath = args[++i]
    if (args[i] === "--txt") txtPath = args[++i]
    if (args[i] === "--checksum") checksumPath = args[++i]
    if (args[i] === "--container-backend-digest") be = args[++i]
    if (args[i] === "--container-storefront-digest") sf = args[++i]
    if (args[i] === "--allow-missing-checksum") requireChecksum = false
  }
  if (!releasePath || !ownerPath) {
    console.error(
      "usage: check-active-release.cjs --release <f> --owner <f> [--txt <f>] [--checksum <f>] [--container-backend-digest d] [--container-storefront-digest d] | --fixture-dir <d>"
    )
    process.exit(2)
  }
  const r = checkWithPaths({
    releasePath,
    ownerPath,
    txtPath,
    checksumPath,
    requireChecksum,
    containerBackendDigest: be,
    containerStorefrontDigest: sf,
  })
  if (!r.ok) {
    console.error("INCONSISTENT", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK active release consistent")
}

main()
