#!/usr/bin/env node
/**
 * Validate runtime identity JSON documents + self-test fixtures.
 *
 * Usage:
 *   node scripts/release/validate-runtime-identity.cjs <file.json>
 *   node scripts/release/validate-runtime-identity.cjs --fixture-dir scripts/release/fixtures/runtime-identity
 *   node scripts/release/validate-runtime-identity.cjs --self-test
 */
const fs = require("fs")
const path = require("path")
const {
  classifyEvidenceUrl,
  validateRuntimeIdentityDoc,
  evaluatePublicHeaders,
  evaluateCandidateHeaders,
  assertNoSecrets,
  sameRuntimeForPricingCompare,
  digestsMatch,
  releasePairMismatchWarning,
  buildIdentityHeadersFromEnv,
  selectUnifiedReleaseSha,
  SCHEMA_VERSION,
} = require("./runtime-identity-lib.cjs")

function selfTest() {
  let failed = 0
  const cases = []

  const pub = classifyEvidenceUrl("https://woodright-demo.ru/catalog")
  cases.push(["public domain ok", pub.ok_for_public && pub.class === "public_domain_evidence"])

  const httpPub = classifyEvidenceUrl("http://api.woodright-demo.ru/health")
  cases.push(["reject http canonical public", !httpPub.ok_for_public])

  const api = classifyEvidenceUrl("https://api.woodright-demo.ru/health")
  cases.push(["public api origin ok", api.ok_for_public && api.class === "public_origin_evidence"])

  const loop = classifyEvidenceUrl("http://127.0.0.1:9200/health")
  cases.push([
    "reject :9200",
    !loop.ok_for_public && loop.class === "invalid_public_evidence",
  ])

  const local = classifyEvidenceUrl("http://localhost:9000/health")
  cases.push(["reject localhost", !local.ok_for_public && local.class === "local_dev_evidence"])

  const ip = classifyEvidenceUrl("http://89.169.188.29:9200/health")
  cases.push(["reject ip:9200", !ip.ok_for_public])

  const rolePub = validateRuntimeIdentityDoc({
    schema_version: SCHEMA_VERSION,
    runtime_role: "public_demo",
    exposure: "public",
    canonical_domain: "woodright-demo.ru",
    canonical_api_origin: "https://api.woodright-demo.ru",
  })
  cases.push(["public role serializes", rolePub.ok])

  const spoofApi = validateRuntimeIdentityDoc({
    schema_version: SCHEMA_VERSION,
    runtime_role: "public_demo",
    exposure: "public",
    canonical_domain: "woodright-demo.ru",
    canonical_api_origin: "https://evil.example/woodright-demo.ru",
  })
  cases.push(["reject spoofed api origin substring", !spoofApi.ok])

  const roleCand = validateRuntimeIdentityDoc({
    schema_version: SCHEMA_VERSION,
    runtime_role: "non_public_candidate",
    exposure: "private",
    canonical_domain: "none",
  })
  cases.push(["candidate role serializes", roleCand.ok])

  const badPub = validateRuntimeIdentityDoc({
    schema_version: SCHEMA_VERSION,
    runtime_role: "public_demo",
    exposure: "private",
    canonical_domain: "woodright-demo.ru",
    canonical_api_origin: "https://api.woodright-demo.ru",
  })
  cases.push(["public cannot be private exposure", !badPub.ok])

  const hdrOk = evaluatePublicHeaders({
    "x-woodright-runtime-role": "public_demo",
    "x-woodright-exposure": "public",
    "x-woodright-release-sha": "a".repeat(40),
  }, { release_sha: "a".repeat(40) })
  cases.push(["public headers ok", hdrOk.ok])

  const beSha = "caf82b048b9caefae30679342aec3d4fc42a8d89"
  const sfSha = "dd304d1bf92d59c85795b5091ed0386365bcca6d"
  cases.push([
    "split pair omits global SHA",
    selectUnifiedReleaseSha(beSha, sfSha, sfSha) === "",
  ])
  const splitHdr = buildIdentityHeadersFromEnv({
    WOODRIGHT_RUNTIME_ROLE: "non_public_candidate",
    WOODRIGHT_EXPOSURE: "private",
    WOODRIGHT_BACKEND_SOURCE_SHA: beSha,
    WOODRIGHT_STOREFRONT_SOURCE_SHA: sfSha,
    WOODRIGHT_RELEASE_SHA: sfSha,
  })
  cases.push([
    "split headers expose component SHAs only",
    splitHdr["x-woodright-backend-source-sha"] === beSha &&
      splitHdr["x-woodright-storefront-source-sha"] === sfSha &&
      !splitHdr["x-woodright-release-sha"],
  ])
  const legacyHdr = buildIdentityHeadersFromEnv({
    WOODRIGHT_RUNTIME_ROLE: "non_public_candidate",
    WOODRIGHT_EXPOSURE: "private",
    WOODRIGHT_RELEASE_SHA: sfSha,
  })
  cases.push([
    "legacy global SHA still emitted",
    legacyHdr["x-woodright-release-sha"] === sfSha,
  ])

  const hdrMissing = evaluatePublicHeaders({})
  cases.push(["reject missing headers", !hdrMissing.ok])

  const hdrPrivate = evaluatePublicHeaders({
    "x-woodright-runtime-role": "non_public_candidate",
    "x-woodright-exposure": "private",
  })
  cases.push(["reject private exposure as public", !hdrPrivate.ok])

  const hdrWrongSha = evaluatePublicHeaders(
    {
      "x-woodright-runtime-role": "public_demo",
      "x-woodright-exposure": "public",
      "x-woodright-release-sha": "b".repeat(40),
    },
    { release_sha: "a".repeat(40) }
  )
  cases.push(["reject wrong release sha", !hdrWrongSha.ok])

  const dig = digestsMatch(
    {
      backend_image_digest: "sha256:" + "1".repeat(64),
      storefront_image_digest: "sha256:" + "2".repeat(64),
    },
    {
      backend_image_digest: "sha256:" + "9".repeat(64),
      storefront_image_digest: "sha256:" + "2".repeat(64),
    }
  )
  cases.push(["reject mismatched digests", !dig.ok])

  const candHdr = evaluateCandidateHeaders({
    "x-woodright-runtime-role": "public_demo",
    "x-woodright-exposure": "public",
  })
  cases.push(["candidate verifier rejects public role", !candHdr.ok])

  const secretDoc = {
    schema_version: SCHEMA_VERSION,
    runtime_role: "public_demo",
    exposure: "public",
    canonical_domain: "woodright-demo.ru",
    canonical_api_origin: "https://api.woodright-demo.ru",
    database_url: "postgres://u:p@h/db",
  }
  cases.push(["identity rejects secrets", assertNoSecrets(secretDoc).length > 0])
  cases.push([
    "validate rejects secrets",
    !validateRuntimeIdentityDoc(secretDoc).ok,
  ])

  const stale = validateRuntimeIdentityDoc({
    schema_version: SCHEMA_VERSION,
    runtime_role: "public_demo",
    exposure: "public",
    canonical_domain: "woodright-demo.ru",
    canonical_api_origin: "https://api.woodright-demo.ru",
    deprecated: true,
    superseded_by: "/srv/woodright/runtime-identity/ACTIVE_PUBLIC.json",
  })
  cases.push(["stale ACTIVE rejected", !stale.ok])

  const priceCross = sameRuntimeForPricingCompare(
    { runtime_role: "public_demo", exposure: "public", database_identity_alias: "public_demo_db" },
    {
      runtime_role: "non_public_candidate",
      exposure: "private",
      database_identity_alias: "non_public_candidate_db",
    }
  )
  cases.push([
    "cross-stack price compare warns",
    !priceCross.ok && priceCross.warning === "cross_stack_price_compare_role_mismatch",
  ])

  const priceSame = sameRuntimeForPricingCompare(
    { runtime_role: "public_demo", exposure: "public", database_identity_alias: "public_demo_db" },
    { runtime_role: "public_demo", exposure: "public", database_identity_alias: "public_demo_db" }
  )
  cases.push(["same-runtime price compare ok", priceSame.ok])

  const mismatch = releasePairMismatchWarning({
    backend_revision: "a".repeat(40),
    storefront_revision: "b".repeat(40),
  })
  cases.push([
    "surface BE/SF release mismatch",
    mismatch && mismatch.warning === "backend_storefront_release_mismatch",
  ])

  const reportPhrase = "backend localhost:9200 показал цену"
  cases.push([
    "report :9200 not public evidence phrase",
    /localhost:9200/.test(reportPhrase) &&
      classifyEvidenceUrl("http://localhost:9200").class === "invalid_public_evidence",
  ])

  for (const [name, ok] of cases) {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`)
    if (!ok) failed++
  }
  process.exit(failed ? 1 : 0)
}

function main() {
  const args = process.argv.slice(2)
  if (args[0] === "--self-test") return selfTest()
  if (args[0] === "--fixture-dir") {
    const dir = args[1]
    let failed = 0
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))
      const expectRole = doc._expect_role
      delete doc._expect_role
      const r = validateRuntimeIdentityDoc(doc, expectRole ? { expectRole } : {})
      const shouldFail = f.startsWith("neg-")
      const pass = shouldFail ? !r.ok : r.ok
      console.log(`${pass ? "PASS" : "FAIL"} ${f} ${r.errors.join("; ")}`)
      if (!pass) failed++
    }
    process.exit(failed ? 1 : 0)
  }
  if (!args[0]) {
    console.error(
      "usage: validate-runtime-identity.cjs <file>|--fixture-dir <d>|--self-test"
    )
    process.exit(2)
  }
  const r = validateRuntimeIdentityDoc(JSON.parse(fs.readFileSync(args[0], "utf8")))
  if (!r.ok) {
    console.error("INVALID", r.errors.join("\n"))
    process.exit(1)
  }
  console.log("OK runtime identity")
}

main()
