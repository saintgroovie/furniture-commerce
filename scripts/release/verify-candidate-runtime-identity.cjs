#!/usr/bin/env node
/**
 * Candidate (non-public) runtime identity verifier.
 * Expects non_public_candidate + private. Must NOT be used for public acceptance.
 *
 * Usage:
 *   node scripts/release/verify-candidate-runtime-identity.cjs --url http://127.0.0.1:9200/health
 *   node scripts/release/verify-candidate-runtime-identity.cjs --offline --url http://127.0.0.1:9200/health --headers-json '{...}'
 */
const fs = require("fs")
const {
  classifyEvidenceUrl,
  evaluateCandidateHeaders,
  validateRuntimeIdentityDoc,
} = require("./runtime-identity-lib.cjs")

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return fallback
}

function fail(code, message, extra = {}) {
  console.error(JSON.stringify({ ok: false, message, ...extra }, null, 2))
  process.exit(code)
}

async function fetchHeaders(url, timeoutMs) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { method: "GET", signal: ctrl.signal })
    const headers = {}
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v
    })
    return { status: res.status, headers }
  } finally {
    clearTimeout(t)
  }
}

async function main() {
  const url = arg("--url", "")
  if (!url) {
    console.error("usage: --url <candidate-url> [--identity-file f] [--offline --headers-json '{}']")
    process.exit(2)
  }

  const classified = classifyEvidenceUrl(url)
  if (classified.ok_for_public) {
    fail(3, "candidate verifier refuses public canonical URL", {
      url,
      evidence_class: classified.class,
    })
  }

  const identityPath = arg("--identity-file", "")
  let identity = null
  if (identityPath) {
    identity = JSON.parse(fs.readFileSync(identityPath, "utf8"))
    const vr = validateRuntimeIdentityDoc(identity, {
      expectRole: "non_public_candidate",
    })
    // allow legacy production_candidate alias in file by normalizing expectation
    if (!vr.ok) {
      const legacy = validateRuntimeIdentityDoc({
        ...identity,
        runtime_role: "non_public_candidate",
      })
      if (identity.runtime_role !== "production_candidate" || !legacy.ok) {
        fail(4, `identity invalid: ${vr.errors.join("; ")}`, { identity_path: identityPath })
      }
    }
  }

  let headers = {}
  let status = null
  if (process.argv.includes("--offline")) {
    headers = JSON.parse(arg("--headers-json", "{}"))
  } else {
    try {
      const r = await fetchHeaders(url, Number(arg("--timeout", "10000")) || 10000)
      status = r.status
      headers = r.headers
    } catch (e) {
      fail(5, `fetch failed: ${e && e.message ? e.message : e}`, { url })
    }
  }

  const localProof = process.argv.includes("--local-bind-proof")
  const hdr = evaluateCandidateHeaders(headers, {
    release_sha: arg("--expected-sha", "") || identity?.release_sha || undefined,
  })
  if (!hdr.ok) {
    const onlyMissing = hdr.errors.every((e) => e.startsWith("missing_"))
    // Bridge only with explicit local bind proof + identity; never for public acceptance.
    if (!(onlyMissing && localProof && identity)) {
      fail(6, `candidate headers rejected: ${hdr.errors.join("; ")}`, {
        url,
        status,
        errors: hdr.errors,
        headers: hdr.headers,
        hint: onlyMissing
          ? "pass --local-bind-proof with candidate identity only for pre-header rollout"
          : undefined,
      })
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        evidence_class: "candidate_evidence",
        not_for_public_acceptance: true,
        url,
        status,
        runtime_role:
          hdr.headers["x-woodright-runtime-role"] || identity?.runtime_role || null,
        exposure: hdr.headers["x-woodright-exposure"] || identity?.exposure || null,
      },
      null,
      2
    )
  )
}

main().catch((e) => fail(1, String(e)))
