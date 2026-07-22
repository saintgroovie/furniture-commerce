#!/usr/bin/env node
/**
 * Fail-closed public runtime identity verifier.
 *
 * Rejects localhost / 127.0.0.1 / :9200 / private exposure / wrong role.
 * Headers are required unless --traefik-proof is supplied with identity file
 * (ops bridge before image headers roll out). Soft identity-only mode is gone.
 *
 * Usage:
 *   node scripts/release/verify-public-runtime-identity.cjs --url https://api.woodright-demo.ru/health
 *   node scripts/release/verify-public-runtime-identity.cjs --offline --url https://api.woodright-demo.ru/health --headers-json '{...}'
 *   node scripts/release/verify-public-runtime-identity.cjs --url https://api.woodright-demo.ru/health \
 *     --identity-file ACTIVE_PUBLIC.json --require-digest-match \
 *     --live-backend-digest sha256:... --live-storefront-digest sha256:...
 */
const fs = require("fs")
const {
  classifyEvidenceUrl,
  evaluatePublicHeaders,
  validateRuntimeIdentityDoc,
  digestsMatch,
} = require("./runtime-identity-lib.cjs")

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return fallback
}

function fail(code, message, extra = {}) {
  const out = { ok: false, exit_class: "invalid_public_evidence", message, ...extra }
  console.error(JSON.stringify(out, null, 2))
  process.exit(code)
}

function ok(payload) {
  console.log(JSON.stringify({ ok: true, evidence_class: payload.evidence_class, ...payload }, null, 2))
  process.exit(0)
}

async function fetchHeaders(url, timeoutMs) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { accept: "*/*" },
    })
    const headers = {}
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v
    })
    return { status: res.status, headers, finalUrl: String(res.url || url) }
  } finally {
    clearTimeout(t)
  }
}

async function main() {
  const url = arg("--url", "")
  if (!url) {
    console.error(
      "usage: --url <public-url> [--identity-file f] [--expected-sha sha] [--offline --headers-json '{...}'] [--traefik-proof] [--require-digest-match --live-backend-digest d --live-storefront-digest d]"
    )
    process.exit(2)
  }

  const classified = classifyEvidenceUrl(url)
  if (!classified.ok_for_public) {
    fail(3, `URL rejected as public evidence: ${classified.reasons.join(", ")}`, {
      url,
      evidence_class: classified.class,
      reasons: classified.reasons,
    })
  }

  const identityPath = arg("--identity-file", "")
  let identity = null
  if (identityPath) {
    identity = JSON.parse(fs.readFileSync(identityPath, "utf8"))
    const vr = validateRuntimeIdentityDoc(identity, { expectRole: "public_demo" })
    if (!vr.ok) {
      fail(4, `identity file invalid: ${vr.errors.join("; ")}`, { identity_path: identityPath })
    }
  }

  const offline = process.argv.includes("--offline")
  let headers = {}
  let status = null
  let finalUrl = url
  if (offline) {
    const raw = arg("--headers-json", "{}")
    headers = JSON.parse(raw)
    finalUrl = arg("--final-url", url)
  } else {
    const timeoutMs = Number(arg("--timeout", "15000")) || 15000
    try {
      const r = await fetchHeaders(url, timeoutMs)
      status = r.status
      headers = r.headers
      finalUrl = r.finalUrl
    } catch (e) {
      fail(5, `fetch failed: ${e && e.message ? e.message : e}`, { url })
    }
  }

  const finalClassified = classifyEvidenceUrl(finalUrl)
  if (!finalClassified.ok_for_public) {
    fail(3, `final response URL rejected as public evidence: ${finalClassified.reasons.join(", ")}`, {
      url,
      final_url: finalUrl,
      evidence_class: finalClassified.class,
      reasons: finalClassified.reasons,
    })
  }

  const expectedSha =
    arg("--expected-sha", "") ||
    (identity && (identity.release_sha || identity.backend_revision)) ||
    ""
  const expectedDb =
    arg("--expected-db-alias", "") ||
    (identity && identity.database_identity_alias) ||
    "public_demo_db"

  const hdr = evaluatePublicHeaders(headers, {
    release_sha: expectedSha || undefined,
    database_identity_alias: process.argv.includes("--require-db-header")
      ? expectedDb
      : undefined,
  })

  // Bridge only when Traefik-routed canonical URL was already accepted AND
  // operator explicitly asserts Traefik proof for this sample. Identity file alone is insufficient.
  const traefikProof = process.argv.includes("--traefik-proof")
  if (!hdr.ok) {
    const onlyMissing = hdr.errors.every((e) => e.startsWith("missing_"))
    if (!(onlyMissing && traefikProof && identity)) {
      fail(6, `public headers rejected: ${hdr.errors.join("; ")}`, {
        url,
        status,
        headers: hdr.headers,
        errors: hdr.errors,
        hint: onlyMissing
          ? "pass --traefik-proof with a valid ACTIVE_PUBLIC identity only for pre-header rollout bridge"
          : undefined,
      })
    }
  }

  if (process.argv.includes("--require-digest-match")) {
    if (!identity) {
      fail(7, "require-digest-match needs --identity-file")
    }
    const liveBe = arg("--live-backend-digest", "")
    const liveSf = arg("--live-storefront-digest", "")
    if (!liveBe || !liveSf) {
      fail(7, "require-digest-match needs independent --live-backend-digest and --live-storefront-digest", {
        hint: "do not default live digests from the identity file",
      })
    }
    const d = digestsMatch(
      {
        backend_image_digest: liveBe,
        storefront_image_digest: liveSf,
      },
      identity
    )
    if (!d.ok) {
      fail(7, `digest mismatch: ${d.errors.join("; ")}`, { errors: d.errors })
    }
  }

  ok({
    url,
    final_url: finalUrl,
    status,
    evidence_class: finalClassified.class,
    runtime_role: hdr.headers["x-woodright-runtime-role"] || identity?.runtime_role || null,
    exposure: hdr.headers["x-woodright-exposure"] || identity?.exposure || null,
    release_sha: hdr.headers["x-woodright-release-sha"] || identity?.release_sha || null,
    database_identity:
      hdr.headers["x-woodright-database-identity"] || identity?.database_identity_alias || null,
    identity_path: identityPath || null,
    traefik_proof_bridge: Boolean(traefikProof && !hdr.headers["x-woodright-runtime-role"]),
  })
}

main().catch((e) => {
  fail(1, String(e && e.stack ? e.stack : e))
})
