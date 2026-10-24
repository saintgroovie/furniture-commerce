#!/usr/bin/env node
/**
 * Isolated storefront bake gate.
 *   node scripts/release/validate-isolated-storefront-bake.fidelity.test.cjs
 */
const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } = require("node:fs")
const { tmpdir } = require("node:os")
const { join } = require("node:path")
const { validateIsolatedStorefrontBake } = require("./validate-isolated-storefront-bake.cjs")

const BACKEND_DIGEST = "sha256:" + "ab".repeat(32)
const BACKEND_REVISION = "01d8fd57c4b33868be116f09a7a2814f437c43c4"

function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Woodright Test",
      GIT_AUTHOR_EMAIL: "test@woodright.local",
      GIT_COMMITTER_NAME: "Woodright Test",
      GIT_COMMITTER_EMAIL: "test@woodright.local",
    },
  }).trim()
}

function initRepo(options = {}) {
  const repo = mkdtempSync(join(tmpdir(), "wr-iso-bake-"))
  git(repo, ["init", "-q"])
  if (options.dockerfile) {
    mkdirSync(join(repo, "apps/storefront"), { recursive: true })
    writeFileSync(join(repo, "apps/storefront/Dockerfile"), options.dockerfile)
    git(repo, ["add", "apps/storefront/Dockerfile"])
  }
  git(repo, ["commit", "--allow-empty", "-m", "base"])
  const base = git(repo, ["rev-parse", "HEAD"])
  mkdirSync(join(repo, "apps/storefront/src"), { recursive: true })
  writeFileSync(join(repo, "apps/storefront/src/page.tsx"), "export const page = 1\n")
  git(repo, ["add", "apps/storefront/src/page.tsx"])
  git(repo, ["commit", "-m", "storefront"])
  const source = git(repo, ["rev-parse", "HEAD"])
  git(repo, ["update-ref", "refs/remotes/origin/release/partners-ok", source])
  git(repo, ["update-ref", "refs/remotes/origin/main", base])
  git(repo, ["checkout", "-q", source])
  return { repo, base, source }
}

function accept(extra = {}) {
  const repo = extra.repo
  return validateIsolatedStorefrontBake({
    releaseMode: "isolated_storefront",
    sourceSha: extra.source,
    productionBaseSha: extra.base,
    releaseRef: "release/partners-ok",
    backendDigest: BACKEND_DIGEST,
    backendRevision: BACKEND_REVISION,
    dbMutation: false,
    ...extra,
    repo,
  })
}

function rejects(fn, pattern) {
  assert.throws(fn, (error) => {
    assert.match(error.message, pattern)
    return true
  })
}

const ok = initRepo()
const accepted = accept(ok)
assert.equal(accepted.migrationCount, 0)
assert.equal(accepted.buildBackend, false)
assert.equal(accepted.dbMutation, "forbidden")
assert.deepEqual(accepted.files, ["apps/storefront/src/page.tsx"])
rmSync(ok.repo, { recursive: true, force: true })

const oldDockerfile = readFileSync(join(__dirname, "fixtures/isolated-storefront/Dockerfile.pre-component-revision"), "utf8")
// This exception permits one historical byte-exact backport, not the current runtime.
const revisionDockerfile = readFileSync(join(__dirname, "fixtures/isolated-storefront/Dockerfile.component-revision"), "utf8")
const currentDockerfile = readFileSync(join(__dirname, "../../apps/storefront/Dockerfile"), "utf8")
function checkDockerfileBackport(baseContent, sourceContent, accepted) {
  const sample = initRepo({ dockerfile: baseContent })
  writeFileSync(join(sample.repo, "apps/storefront/Dockerfile"), sourceContent)
  git(sample.repo, ["add", "apps/storefront/Dockerfile"])
  git(sample.repo, ["commit", "-m", "component revision bake"])
  const source = git(sample.repo, ["rev-parse", "HEAD"])
  git(sample.repo, ["update-ref", "refs/remotes/origin/release/partners-ok", source])
  if (accepted) assert.ok(accept({ ...sample, source }).files.includes("apps/storefront/Dockerfile"))
  else rejects(() => accept({ ...sample, source }), /runtime:apps\/storefront\/Dockerfile/)
  rmSync(sample.repo, { recursive: true, force: true })
}
checkDockerfileBackport(oldDockerfile, revisionDockerfile, true)
// Runtime updates remain forbidden without a separate sealed runtime policy.
checkDockerfileBackport(oldDockerfile, currentDockerfile, false)
checkDockerfileBackport(oldDockerfile, revisionDockerfile + "\nRUN echo unexpected-runtime-change\n", false)
checkDockerfileBackport(oldDockerfile + "\n# unknown base\n", revisionDockerfile, false)

const missingRef = initRepo()
git(missingRef.repo, ["update-ref", "-d", "refs/remotes/origin/release/partners-ok"])
rejects(() => accept(missingRef), /not fetched/)
rmSync(missingRef.repo, { recursive: true, force: true })

const notDescendant = initRepo()
git(notDescendant.repo, ["checkout", "--orphan", "side", "-q"])
git(notDescendant.repo, ["commit", "--allow-empty", "-m", "unrelated"])
const side = git(notDescendant.repo, ["rev-parse", "HEAD"])
git(notDescendant.repo, ["update-ref", "refs/remotes/origin/release/partners-ok", side])
rejects(
  () => accept({ ...notDescendant, source: side }),
  /not an ancestor/
)
rmSync(notDescendant.repo, { recursive: true, force: true })

function rejectFile(relativePath, pattern) {
  const sample = initRepo()
  const full = join(sample.repo, relativePath)
  mkdirSync(join(full, ".."), { recursive: true })
  writeFileSync(full, "x\n")
  git(sample.repo, ["add", relativePath])
  git(sample.repo, ["commit", "-m", "bad"])
  const source = git(sample.repo, ["rev-parse", "HEAD"])
  git(sample.repo, ["update-ref", "refs/remotes/origin/release/partners-ok", source])
  rejects(() => accept({ ...sample, source }), pattern)
  rmSync(sample.repo, { recursive: true, force: true })
}

rejectFile("apps/backend/src/index.ts", /backend:/)
rejectFile("apps/backend/src/modules/x/migrations/Migration20261005120000.ts", /migration:/)
rejectFile("ops/compose/docker-compose.yml", /runtime:|governance:/)
rejectFile("apps/storefront/.env.production", /env:/)
rejectFile("apps/storefront/yarn.lock", /dependency:/)
rejectFile("apps/storefront/compose.yaml", /runtime:/)
rejectFile("apps/storefront/package-lock.json", /dependency:/)

const renamed = initRepo()
mkdirSync(join(renamed.repo, "apps/backend/src"), { recursive: true })
writeFileSync(join(renamed.repo, "apps/backend/src/index.ts"), "hidden\n")
git(renamed.repo, ["add", "apps/backend/src/index.ts"])
git(renamed.repo, ["commit", "-m", "backend in base"])
const renamedBase = git(renamed.repo, ["rev-parse", "HEAD"])
git(renamed.repo, ["mv", "apps/backend/src/index.ts", "apps/storefront/src/stolen.ts"])
git(renamed.repo, ["commit", "-m", "rename"])
const renamedSource = git(renamed.repo, ["rev-parse", "HEAD"])
git(renamed.repo, ["update-ref", "refs/remotes/origin/release/partners-ok", renamedSource])
git(renamed.repo, ["update-ref", "refs/remotes/origin/main", renamedBase])
rejects(
  () => accept({ ...renamed, base: renamedBase, source: renamedSource }),
  /backend:/
)
rmSync(renamed.repo, { recursive: true, force: true })

const db = initRepo()
rejects(() => accept({ ...db, dbMutation: true }), /DB_MUTATION_FORBIDDEN/)
rmSync(db.repo, { recursive: true, force: true })

const badDigest = initRepo()
rejects(() => accept({ ...badDigest, backendDigest: "latest" }), /backend digest/)
rmSync(badDigest.repo, { recursive: true, force: true })

const mainMode = initRepo()
rejects(
  () =>
    validateIsolatedStorefrontBake({
      ...accept(mainMode) && {},
      releaseMode: "main",
      sourceSha: mainMode.source,
      productionBaseSha: mainMode.base,
      releaseRef: "release/partners-ok",
      backendDigest: BACKEND_DIGEST,
      backendRevision: BACKEND_REVISION,
      repo: mainMode.repo,
      dbMutation: false,
    }),
  /main mode cannot use this path/
)
rmSync(mainMode.repo, { recursive: true, force: true })

const workflow = readFileSync(
  join(__dirname, "../../.github/workflows/build-staging-images.yml"),
  "utf8"
)
assert.match(workflow, /release_mode:/)
assert.match(workflow, /- main\n\s+- isolated_storefront/)
assert.match(workflow, /inputs\.release_mode != 'isolated_storefront'/)
assert.match(workflow, /Restrict SHA to trusted deployment ancestry/)
assert.match(workflow, /Verify reused backend digest/)
assert.match(workflow, /node trusted-governance\/scripts\/release\/validate-isolated-storefront-bake\.cjs/)
assert.match(workflow, /Choose release script root/)
assert.match(workflow, /\$\{\{ steps\.scripts\.outputs\.root \}\}\/scripts\/release\/write-build-manifest\.py/)
assert.doesNotMatch(workflow, /python3 scripts\/release\/write-build-manifest\.py/)
assert.match(workflow, /refs\/heads\/main/)
assert.match(workflow, /production storefront digest revision/)
assert.doesNotMatch(workflow, /node scripts\/release\/validate-isolated-storefront-bake\.cjs/)
assert.match(
  readFileSync(join(__dirname, "validate-isolated-storefront-bake.cjs"), "utf8"),
  /DB_MUTATION_FORBIDDEN/
)
const cutover = readFileSync(join(__dirname, "../../ops/release/cutover-public-production-pair.sh"), "utf8")
assert.match(cutover, /Retained backend is inspected against the approval revision, not SOURCE_SHA/)
assert.match(cutover, /pending migration flagged/)
assert.match(cutover, /"no_migrations": True/)
assert.match(cutover, /assert_backend_notouch/)

const sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const other = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
const tag = `build-${sha}-run-7-attempt-1`
function image(revision, digest, unique) {
  return {
    repository: "ghcr.io/saintgroovie/woodright-storefront",
    unique_tag: unique,
    digest,
    oci_revision: revision,
  }
}
function manifest(extra) {
  return {
    schema_version: "1",
    source_sha: sha,
    source_branch: "main",
    workflow_name: "Build staging images",
    workflow_run_id: "7",
    workflow_run_attempt: 1,
    event_name: "workflow_dispatch",
    build_started_at: "2026-10-10T00:00:00Z",
    build_completed_at: "2026-10-10T00:01:00Z",
    backend: {
      ...image(sha, "sha256:" + "11".repeat(32), tag),
      repository: "ghcr.io/saintgroovie/woodright-backend",
    },
    storefront: image(sha, "sha256:" + "22".repeat(32), tag),
    convenience_aliases: [],
    build_argument_names: [],
    build_config_fingerprint: "abc",
    release_authorized: false,
    notes: "pair",
    ...extra,
  }
}
const { spawnSync } = require("node:child_process")
const { writeFileSync: writeManifest } = require("node:fs")
function checkManifest(doc) {
  const file = join(tmpdir(), `wr-manifest-${process.pid}-${Math.random().toString(16).slice(2)}.json`)
  writeManifest(file, JSON.stringify(doc))
  const result = spawnSync(process.execPath, [join(__dirname, "validate-build-manifest.cjs"), file], {
    encoding: "utf8",
  })
  rmSync(file, { force: true })
  return result
}
const pairOk = checkManifest(manifest())
assert.equal(pairOk.status, 0, pairOk.stderr)
const reusedOk = checkManifest(
  manifest({
    release_mode: "isolated_storefront",
    source_branch: "release/partners-ok",
    production_base_sha: other,
    production_storefront_digest: "sha256:" + "33".repeat(32),
    main_sha: other,
    migration_count: 0,
    db_mutation: "forbidden",
    storefront_delta_scope: "apps/storefront",
    backend: {
      repository: "ghcr.io/saintgroovie/woodright-backend",
      unique_tag: "reused-bbbbbbbbbbbb",
      digest: "sha256:" + "11".repeat(32),
      oci_revision: other,
      reused: true,
    },
  })
)
assert.equal(reusedOk.status, 0, reusedOk.stderr)
const substituted = checkManifest(
  manifest({
    release_mode: "isolated_storefront",
    source_branch: "release/partners-ok",
    production_base_sha: other,
    production_storefront_digest: "sha256:" + "33".repeat(32),
    main_sha: other,
    migration_count: 0,
    db_mutation: "forbidden",
    storefront_delta_scope: "apps/storefront",
    backend: {
      repository: "ghcr.io/saintgroovie/woodright-backend",
      unique_tag: "reused-bbbbbbbbbbbb",
      digest: "sha256:" + "11".repeat(32),
      oci_revision: sha,
      reused: true,
    },
  })
)
assert.notEqual(substituted.status, 0)
assert.match(substituted.stderr, /must stay the reused revision/)

console.log("validate-isolated-storefront-bake.fidelity.test.cjs: ok")

// New runtime policy tests use an independent tiny Git fixture. They do not
// mutate the production registry or require fetching private production source.
const { createHash } = require("node:crypto")
const { validateRuntimeContract } = require("./validate-isolated-storefront-bake.cjs")
const hash = bytes => createHash("sha256").update(bytes).digest("hex")
const runtimeFixture = readFileSync(join(__dirname, "fixtures/isolated-storefront/Dockerfile.node24-catalog-v1"))
const registryBytes = readFileSync(join(__dirname, "storefront-runtime-policies.json"))
const runtimeRegistry = JSON.parse(registryBytes)
const sealed = runtimeRegistry.policies["node20-to-node24-catalog-v1"]
const fixtureReuse = key => key === "backend-fidelity" ? {
  origin: "prior-qualified-backend", runId: sealed.qualification_reuse.backend_run_id,
  runAttempt: 1, policySha: sealed.qualification_reuse.backend_policy_sha, jobId: 20, checkId: 20,
  artifactId: sealed.qualification_reuse.backend_artifact_id, artifactDigest: sealed.qualification_reuse.backend_artifact_digest,
  sealSha256: sealed.qualification_reuse.backend_seal_sha256,
} : { origin: "mandatory-pr-ci-exact-policy-tree", runId: 42, runAttempt: 1, jobId: 44, checkId: 44,
  policySha: other, mergedPolicySha: sha, policyTree: sha, checkedOutSha: "c".repeat(40),
  commandTemplateSha256: sealed.qualification_job_template_sha256 }

assert.equal(sealed.paths["apps/storefront/Dockerfile"].after, hash(runtimeFixture))
assert.equal(Object.keys(sealed.paths).length, 8)
assert.equal(Object.keys(sealed.protected).length, 9)
assert.match(runtimeFixture.toString(), /FROM node:24\.22\.1-bookworm-slim@sha256:[a-f0-9]{64} AS runner/)
const rt = initRepo({ dockerfile: revisionDockerfile })
writeFileSync(join(rt.repo, "apps/storefront/Dockerfile"), runtimeFixture)
git(rt.repo, ["add", "apps/storefront/Dockerfile"])
git(rt.repo, ["commit", "-m", "explicit runtime fixture"])
const rtSource = git(rt.repo, ["rev-parse", "HEAD"])
// The retained backend fixture has its own tree; it is never built or changed.
mkdirSync(join(rt.repo, "apps/backend"), { recursive: true })
writeFileSync(join(rt.repo, "apps/backend/package.json"), "{}\n")
git(rt.repo, ["add", "apps/backend/package.json"])
git(rt.repo, ["commit", "-m", "retained backend fixture"])
const rtBackend = git(rt.repo, ["rev-parse", "HEAD"])
git(rt.repo, ["checkout", "-q", rtSource])
const rtPaths = ["apps/storefront/Dockerfile", "apps/storefront/src/page.tsx"]
const rtPolicy = { ...sealed, qualification_reuse: undefined, source_sha: rtSource, base_sha: rt.base,
  source_tree: git(rt.repo, ["rev-parse", `${rtSource}^{tree}`]), base_tree: git(rt.repo, ["rev-parse", `${rt.base}^{tree}`]),
  backend_revision: rtBackend, backend_digest: BACKEND_DIGEST,
  backend_tree: git(rt.repo, ["rev-parse", `${rtBackend}:apps/backend`]), protected: {},
  paths: Object.fromEntries(rtPaths.map(file => [file, {
    before: file.endsWith("Dockerfile") ? hash(revisionDockerfile) : null,
    after: hash(readFileSync(join(rt.repo, file))),
  }])) }
const rtBytes = Buffer.from(JSON.stringify({ schema_version: 1, policies: { "node20-to-node24-catalog-v1": rtPolicy } }))
const checkFile = join(rt.repo, "checks.json")
const rtChecks = sealed.required_checks.map((name, i) => ({ name, source_sha: rtSource, head_sha: sha, policy_sha: sha, seal_artifact_id: i + 10, conclusion: "success",
  workflow_path: sealed.required_workflow, run_id: 1, run_attempt: 1, check_id: i + 1,
  event: sealed.source_ci_event, head_branch: sealed.source_ci_ref,
  source_base_sha: rtPolicy.base_sha, source_tree: rtPolicy.source_tree }))
writeFileSync(checkFile, JSON.stringify(rtChecks))
const rtInput = { repo: rt.repo, sourceSha: rtSource, productionBaseSha: rt.base,
  backendRevision: rtBackend, backendDigest: BACKEND_DIGEST, productionStorefrontDigest: sealed.production_storefront_digest,
  runtimePolicy: "node20-to-node24-catalog-v1", trustedPolicySha: sha, sourceChecksFile: checkFile }
const validateFixture = (input = rtInput, paths = rtPaths, bytes = rtBytes, fixture = runtimeFixture) =>
  validateRuntimeContract(input, paths, bytes, fixture)
const rtEvidence = validateFixture()
assert.equal(rtEvidence.runtime_after, sealed.runtime_after)
assert.equal(rtEvidence.source_checks.length, 3)
for (const [key, value] of [["runtimePolicy", "unknown"], ["trustedPolicySha", ""], ["sourceChecksFile", ""],
  ["sourceSha", sha], ["productionBaseSha", sha], ["backendRevision", rtSource],
  ["backendDigest", "sha256:" + "ff".repeat(32)], ["productionStorefrontDigest", "sha256:" + "ff".repeat(32)]]) {
  rejects(() => validateFixture({ ...rtInput, [key]: value }), /policy|receipts/)
}
rejects(() => validateFixture(rtInput, [...rtPaths, "apps/backend/extra.ts"]), /path set/)
rejects(() => validateFixture(rtInput, rtPaths, rtBytes, Buffer.from("FROM node:24 AS runner\n")), /runner\/fixture/)
const badTree = JSON.parse(rtBytes)
badTree.policies[rtInput.runtimePolicy].source_tree = "0".repeat(40)
rejects(() => validateFixture(rtInput, rtPaths, Buffer.from(JSON.stringify(badTree))), /source tree/)
const badProtected = JSON.parse(rtBytes)
badProtected.policies[rtInput.runtimePolicy].protected = { "apps/storefront/Dockerfile": "0".repeat(64) }
rejects(() => validateFixture(rtInput, rtPaths, Buffer.from(JSON.stringify(badProtected))), /protected/)
const badBlob = JSON.parse(rtBytes)
badBlob.policies[rtInput.runtimePolicy].paths[rtPaths[0]].after = "0".repeat(64)
rejects(() => validateFixture(rtInput, rtPaths, Buffer.from(JSON.stringify(badBlob))), /blob mismatch/)
for (const mutate of [x => x.pop(), x => x.push(x[0]), x => x[0].head_sha = other,
  x => x[0].conclusion = "failure", x => x[0].workflow_path = "other.yml", x => x[0].run_id = 0,
  x => x[0].event = "pull_request", x => x[0].source_base_sha = sha,
  x => x[0].run_attempt = 2]) {
  const checks = structuredClone(rtChecks); mutate(checks); writeFileSync(checkFile, JSON.stringify(checks))
  rejects(() => validateFixture(), /checks|check not qualified/)
}
writeFileSync(checkFile, JSON.stringify(rtChecks))
rmSync(rt.repo, { recursive: true, force: true })

const sealedTag = `build-${sealed.source_sha}-run-7-attempt-1`
const realEvidence = { id: "node20-to-node24-catalog-v1", policy_sha: sha, registry_sha256: hash(registryBytes),
  source_tree: sealed.source_tree, backend_tree: sealed.backend_tree,
  runtime_before: sealed.runtime_before, runtime_after: sealed.runtime_after,
  source_checks: sealed.required_checks.map((name, i) => ({ name, source_sha: sealed.source_sha, head_sha: sha, policy_sha: sha, seal_artifact_id: i + 10, conclusion: "success",
    workflow_path: sealed.required_workflow, run_id: 1, run_attempt: 1, check_id: i + 1,
    event: sealed.source_ci_event, head_branch: sealed.source_ci_ref,
    source_base_sha: sealed.base_sha, source_tree: sealed.source_tree,
    ...(sealed.qualification_jobs[name] !== "storefront" ? { reused_checks: fixtureReuse(sealed.qualification_jobs[name]) } : {}) })) }
const runtimeManifest = manifest({ source_sha: sealed.source_sha, release_mode: "isolated_storefront",
  source_branch: "release/storefront-memory-20261024", production_base_sha: sealed.base_sha,
  production_storefront_digest: sealed.production_storefront_digest, main_sha: sha,
  migration_count: 0, db_mutation: "forbidden", storefront_delta_scope: "apps/storefront",
  backend: { repository: "ghcr.io/saintgroovie/woodright-backend", unique_tag: "reused-ec0d00550ed9",
    digest: sealed.backend_digest, oci_revision: sealed.backend_revision, reused: true },
  storefront: image(sealed.source_sha, "sha256:" + "22".repeat(32), sealedTag), storefront_runtime_policy: realEvidence })
const runtimeManifestResult = checkManifest(runtimeManifest)
assert.equal(runtimeManifestResult.status, 0, runtimeManifestResult.stderr)
for (const mutate of [d => delete d.storefront_runtime_policy, d => d.storefront_runtime_policy.policy_sha = "bad",
  d => d.storefront_runtime_policy.registry_sha256 = "0".repeat(64), d => d.backend.reused = false,
  d => d.backend.digest = "sha256:" + "ff".repeat(32), d => d.storefront_runtime_policy.source_checks.pop(),
  d => d.storefront_runtime_policy.runtime_after = "node:24", d => d.storefront_runtime_policy.id = "unknown"]) {
  const doc = structuredClone(runtimeManifest); mutate(doc); assert.notEqual(checkManifest(doc).status, 0)
}
assert.match(workflow, /STOREFRONT_RUNTIME_POLICY: \$\{\{ inputs.storefront_runtime_policy \}\}/)
assert.match(workflow, /--fetch-source-checks/)
assert.match(workflow, /--evidence-output/)
// Exercise the actual Python writer, not only hand-assembled manifests.
const writerDir = mkdtempSync(join(tmpdir(), "wr-runtime-writer-"))
const writerEvidence = join(writerDir, "evidence.json")
writeFileSync(writerEvidence, JSON.stringify({ sourceSha: sealed.source_sha,
  productionBaseSha: sealed.base_sha, backendDigest: sealed.backend_digest,
  backendRevision: sealed.backend_revision, buildBackend: false, dbMutation: "forbidden", runtimePolicy: realEvidence }))
const writerEnv = { ...process.env, SHA: sealed.source_sha, RUN_ID: "7", ATTEMPT: "1", UNIQUE: sealedTag,
  BACKEND_DIGEST: sealed.backend_digest, STOREFRONT_DIGEST: runtimeManifest.storefront.digest,
  RELEASE_MODE: "isolated_storefront", RELEASE_REF: runtimeManifest.source_branch,
  BACKEND_REVISION: sealed.backend_revision, PRODUCTION_BASE_SHA: sealed.base_sha,
  PRODUCTION_STOREFRONT_DIGEST: sealed.production_storefront_digest, MAIN_SHA: sha, GITHUB_SHA: sha,
  GITHUB_WORKFLOW: "Build staging images", GITHUB_EVENT_NAME: "workflow_dispatch",
  STOREFRONT_RUNTIME_POLICY: realEvidence.id, ISOLATED_BAKE_EVIDENCE: writerEvidence,
  BUILD_PROFILE: "", PUBLISH_MUTABLE_ALIAS: "false" }
const writeRuntime = env => spawnSync("python3", [join(__dirname, "write-build-manifest.py")], {
  cwd: writerDir, env, encoding: "utf8",
})
const writerResult = writeRuntime(writerEnv)
assert.equal(writerResult.status, 0, writerResult.stderr)
const written = JSON.parse(readFileSync(join(writerDir, "release-artifacts/build-manifest.json")))
assert.equal(checkManifest(written).status, 0)
assert.deepEqual(written.storefront_runtime_policy, realEvidence)
assert.equal(written.backend.reused, true)
assert.equal(written.release_authorized, false)
assert.notEqual(writeRuntime({ ...writerEnv, GITHUB_SHA: other }).status, 0)
assert.notEqual(writeRuntime({ ...writerEnv, RELEASE_MODE: "main" }).status, 0)
// Installed595 uses a separate canonical approval contract, not build-manifest
// root fields. Run its unchanged parser locally against a synthetic SF-only
// projection; this is not an owner approval or a production cutover.
const ownerParserText = readFileSync(join(__dirname, "../../ops/lib/woodright-owner-approved-release.sh"), "utf8")
const parserStart = ownerParserText.indexOf("import hashlib, json, os, re, sys\n")
assert.ok(parserStart > 0)
const parserEnd = ownerParserText.indexOf("\nPY\n", parserStart)
assert.ok(parserEnd > parserStart)
const nativeParser = ownerParserText.slice(parserStart, parserEnd)
const approvalFixture = join(writerDir, "synthetic-approval-fixture.json")
const projection = { schema_version: "1", environment: "public_production", owner_decision: "approved",
  application_sha: written.source_sha, backend_digest: written.backend.digest,
  storefront_digest: written.storefront.digest, component: "storefront",
  retained_backend_revision: written.backend.oci_revision,
  expected_current_storefront_digest: written.production_storefront_digest,
  expected_current_backend_digest: written.backend.digest, owner_authorization_id: "LOCAL-FIXTURE-NOT-AUTHORITY" }
const parseProjection = doc => {
  writeFileSync(approvalFixture, JSON.stringify(doc))
  return spawnSync("python3", ["-c", nativeParser, approvalFixture, "public_production"], { encoding: "utf8" })
}
const nativeOk = parseProjection(projection)
assert.equal(nativeOk.status, 0, nativeOk.stderr)
const nativeFields = nativeOk.stdout.trimEnd().split("\n")
assert.equal(nativeFields[2], sealed.source_sha)
assert.equal(nativeFields[3], sealed.backend_digest)
assert.equal(nativeFields[6], "storefront")
assert.equal(nativeFields[7], sealed.backend_revision)
assert.notEqual(parseProjection({ ...projection, retained_backend_revision: sealed.source_sha }).status, 0)
assert.notEqual(parseProjection({ ...projection, expected_current_backend_digest: "sha256:" + "ff".repeat(32) }).status, 0)
assert.match(cutover, /assert_backend_notouch/)
assert.doesNotMatch(cutover, /storefront_runtime_policy/)
rmSync(writerDir, { recursive: true, force: true })
// Mock the collector itself: successful source checks from a PR merge/base,
// another branch/workflow, a stale rerun attempt or an unrelated job must fail.
const previousReuseRepo = process.env.GITHUB_REPOSITORY
process.env.GITHUB_REPOSITORY = "fixture/repository"
// Pinned backend reuse and same-tree PR governance acceptance are different
// evidence origins; neither may pretend to be fresh candidate SF checks.
const { collectQualificationReuse } = require("./validate-isolated-storefront-bake.cjs")
const reusePolicy = sealed.qualification_reuse
const previousRegistry = structuredClone(runtimeRegistry)
delete previousRegistry.policies["node20-to-node24-catalog-v1"].qualification_reuse
const previousBytes = Buffer.from(JSON.stringify(previousRegistry, null, 2) + "\n")
assert.equal(hash(previousBytes), reusePolicy.backend_registry_sha256)
const previousSeal = Buffer.from(JSON.stringify({ sourceSha: sealed.source_sha, sourceTree: sealed.source_tree,
  productionBaseSha: sealed.base_sha, policySha: reusePolicy.backend_policy_sha,
  policyRegistrySha256: reusePolicy.backend_registry_sha256, jobKey: "backend-fidelity",
  runId: reusePolicy.backend_run_id, runAttempt: 1, postChecks: true }, null, 2) + "\n")
assert.equal(hash(previousSeal), reusePolicy.backend_seal_sha256)
const reuseRepo = "fixture/repository"
const oldRun = { id: reusePolicy.backend_run_id, run_attempt: 1, repository: { full_name: reuseRepo },
  head_sha: reusePolicy.backend_policy_sha, path: sealed.required_workflow, event: "workflow_dispatch", head_branch: "main",
  status: "completed", conclusion: "failure", check_suite_id: 19 }
const oldJob = { name: "Backend fidelity tests", id: 20, run_id: oldRun.id, run_attempt: 1, head_sha: oldRun.head_sha,
  status: "completed", conclusion: "success", check_run_url: `https://api.github.com/repos/${reuseRepo}/check-runs/20` }
const oldCheck = { id: 20, name: oldJob.name, app: { slug: "github-actions" }, head_sha: oldRun.head_sha,
  check_suite: { id: 19 }, status: "completed", conclusion: "success" }
const oldArtifact = { id: reusePolicy.backend_artifact_id, digest: reusePolicy.backend_artifact_digest,
  name: `runtime-qualification-${oldRun.id}-1-backend-fidelity`, expired: false,
  workflow_run: { id: oldRun.id, head_sha: oldRun.head_sha } }
const prRun = { id: 42, run_attempt: 1, repository: { full_name: reuseRepo }, head_sha: other,
  path: ".github/workflows/pr-checks.yml", event: "pull_request", status: "completed", conclusion: "success", check_suite_id: 43 }
const prJob = { id: 44, name: "Release governance gates", run_id: 42, run_attempt: 1, head_sha: other,
  status: "completed", conclusion: "success", check_run_url: `https://api.github.com/repos/${reuseRepo}/check-runs/44` }
const prCheck = { id: 44, name: prJob.name, app: { slug: "github-actions" }, head_sha: other,
  check_suite: { id: 43 }, status: "completed", conclusion: "success" }
const checkoutObject = { sha: "c".repeat(40), tree: { sha }, parents: [{ sha: other }] }
const checkoutLog = `2026-10-24T00:00:00Z [command]/usr/bin/git log -1 --format=%H\n2026-10-24T00:00:01Z ${checkoutObject.sha}\n`
const trustedTemplate = readFileSync(join(__dirname, "../../.github/workflows/pr-checks.yml"))
const reuseGit = (ref, file) => {
  if (!file) return ref.endsWith("^2") ? other : sha
  if (file.endsWith("storefront-runtime-policies.json")) return previousBytes
  if (file.endsWith("pr-checks.yml")) return trustedTemplate
  return Buffer.from("unchanged trusted backend install dependency")
}
const reuseApi = suffix => {
  if (suffix === `actions/runs/${oldRun.id}`) return oldRun
  if (suffix === `actions/runs/${oldRun.id}/attempts/1/jobs?per_page=100`) return [{ jobs: [oldJob, { name: "build", conclusion: "skipped" }] }]
  if (suffix === `actions/runs/${oldRun.id}/artifacts?per_page=100`) return [{ artifacts: [oldArtifact] }]
  if (suffix === "check-runs/20") return oldCheck
  if (suffix.startsWith("actions/runs?head_sha=")) return [{ workflow_runs: [prRun] }]
  if (suffix === "actions/runs/42") return prRun
  if (suffix === "actions/runs/42/attempts/1/jobs?per_page=100") return [{ jobs: [prJob] }]
  if (suffix === "check-runs/44") return prCheck
  if (suffix === "actions/jobs/44/logs") return checkoutLog
  if (suffix === `git/commits/${checkoutObject.sha}`) return checkoutObject
  throw Error("Unexpected reuse request: " + suffix)
}
const reuseInput = { sourceSha: sealed.source_sha, trustedPolicySha: sha, runtimePolicy: "node20-to-node24-catalog-v1", qualificationJob: "backend-fidelity" }
const loadOld = () => previousSeal
const validateReuse = (input = reuseInput, api = reuseApi, loader = loadOld, readGit = reuseGit) => collectQualificationReuse(input, api, loader, readGit)
const backendProvenance = validateReuse()
assert.equal(backendProvenance.policySha, oldRun.head_sha)
assert.equal(backendProvenance.origin, "prior-qualified-backend")
const changedApi = (suffix, value) => key => key === suffix ? value : reuseApi(key)
rejects(() => validateReuse(reuseInput, changedApi(`actions/runs/${oldRun.id}`, { ...oldRun, run_attempt: 2 })), /workflow mismatch/)
rejects(() => validateReuse(reuseInput, changedApi("check-runs/20", { ...oldCheck, check_suite: { id: 99 } })), /membership/)
rejects(() => validateReuse(reuseInput, changedApi(`actions/runs/${oldRun.id}/artifacts?per_page=100`, [{ artifacts: [] }])), /artifact/)
rejects(() => validateReuse(reuseInput, changedApi(`actions/runs/${oldRun.id}/artifacts?per_page=100`, [{ artifacts: [{ ...oldArtifact, expired: true }] }])), /artifact/)
rejects(() => validateReuse(reuseInput, reuseApi, () => Buffer.from("{}")), /seal bytes/)
rejects(() => validateReuse(reuseInput, reuseApi, loadOld, (ref, file) => file?.endsWith("yarn-install-network-resilient.cjs") && ref === sha ? Buffer.from("changed") : reuseGit(ref, file)), /dependency changed/)
rejects(() => validateReuse({ ...reuseInput, qualificationJob: "storefront" }), /reuse role/)
const govInput = { ...reuseInput, qualificationJob: "release-governance" }
const governanceProvenance = validateReuse(govInput)
assert.equal(governanceProvenance.origin, "mandatory-pr-ci-exact-policy-tree")
assert.equal(governanceProvenance.checkedOutSha, checkoutObject.sha)
rejects(() => validateReuse(govInput, reuseApi, loadOld, (ref, file) => !file && ref === `${other}^{tree}` ? "d".repeat(40) : reuseGit(ref, file)), /PR tree/)
rejects(() => validateReuse(govInput, changedApi("actions/runs/42", { ...prRun, event: "workflow_dispatch" })), /workflow mismatch/)
rejects(() => validateReuse(govInput, changedApi("actions/runs/42/attempts/1/jobs?per_page=100", [{ jobs: [{ ...prJob, run_attempt: 2 }] }])), /exact attempt/)
rejects(() => validateReuse(govInput, changedApi("actions/jobs/44/logs", "missing checkout proof")), /checkout proof/)
rejects(() => validateReuse(govInput, changedApi(`git/commits/${checkoutObject.sha}`, { ...checkoutObject, tree: { sha: other } })), /actual checkout tree/)
rejects(() => validateReuse(govInput, changedApi("check-runs/44", { ...prCheck, conclusion: "failure" })), /membership/)

if (previousReuseRepo === undefined) delete process.env.GITHUB_REPOSITORY
else process.env.GITHUB_REPOSITORY = previousReuseRepo
const { collectSourceChecks: liveCollectSourceChecks } = require("./validate-isolated-storefront-bake.cjs")
const reuseProof = key => key === "backend-fidelity" ? backendProvenance : governanceProvenance
const collectSourceChecks = (input, api, seal) => liveCollectSourceChecks(input, api, seal, x => reuseProof(x.qualificationJob))
const apiDir = mkdtempSync(join(tmpdir(), "wr-ci-collector-"))
const previousRepo = process.env.GITHUB_REPOSITORY
process.env.GITHUB_REPOSITORY = "fixture/repository"
const apiChecks = sealed.required_checks.map((name, i) => ({ name, id: i + 1,
  head_sha: sha, status: "completed", conclusion: "success", app: { slug: "github-actions" },
  check_suite: { id: 17 } }))
const apiRun = { id: 7, repository: { full_name: "fixture/repository" }, path: sealed.required_workflow,
  head_sha: sha, event: sealed.source_ci_event, head_branch: sealed.source_ci_ref,
  run_attempt: 1, check_suite_id: 17, status: "completed", conclusion: "success" }
const apiJobs = [{ name: "build", status: "completed", conclusion: "skipped" }, ...apiChecks.map(x => ({ name: x.name, status: "completed", conclusion: "success",
  check_run_url: "https://api.github.com/repos/fixture/repository/check-runs/" + x.id }))]
const apiArtifacts = sealed.required_checks.map((name, i) => ({ id: i + 10,
  name: `runtime-qualification-7-1-${sealed.qualification_jobs[name]}`, expired: false }))
const seals = Object.fromEntries(sealed.required_checks.map(name => [
  `runtime-qualification-7-1-${sealed.qualification_jobs[name]}`,
  { sourceSha: sealed.source_sha, sourceTree: sealed.source_tree, productionBaseSha: sealed.base_sha,
    policySha: sha, policyRegistrySha256: hash(registryBytes), jobKey: sealed.qualification_jobs[name],
    runId: 7, runAttempt: 1, postChecks: true,
    ...(sealed.qualification_jobs[name] !== "storefront" ? { reusedChecks: reuseProof(sealed.qualification_jobs[name]) } : {}) },
]))
function mockApi(run = apiRun, checks = apiChecks, jobs = apiJobs, artifacts = apiArtifacts) {
  return suffix => {
    if (suffix === "actions/runs/7") return run
    if (suffix.startsWith("actions/runs/7/attempts/")) return [{ jobs }]
    if (suffix === "actions/runs/7/artifacts?per_page=100") return [{ artifacts }]
    if (suffix.startsWith("check-runs/")) return checks.find(x => x.id === Number(suffix.split("/")[1]))
    throw new Error("Unexpected API request: " + suffix)
  }
}
const apiInput = { sourceSha: sealed.source_sha, trustedPolicySha: sha, qualificationRunId: "7",
  runtimePolicy: "node20-to-node24-catalog-v1", sourceChecksFile: join(apiDir, "receipts.json") }
const loadSeal = name => seals[name]
assert.equal(collectSourceChecks(apiInput, mockApi(), loadSeal).length, 3)
for (const bad of [
  { ...apiRun, event: "pull_request", pull_requests: [{ base: { sha: other } }] },
  { ...apiRun, head_branch: "other-branch" }, { ...apiRun, path: "other.yml" },
  { ...apiRun, head_sha: other }, { ...apiRun, repository: { full_name: "other/repository" } },
]) rejects(() => collectSourceChecks(apiInput, mockApi(bad), loadSeal), /workflow\/ref\/event/)
rejects(() => collectSourceChecks(apiInput, mockApi({ ...apiRun, run_attempt: 2 }), loadSeal), /artifact missing/)
rejects(() => collectSourceChecks(apiInput, mockApi(apiRun, apiChecks, apiJobs.slice(1)), loadSeal), /must not build/)
rejects(() => collectSourceChecks(apiInput, mockApi(apiRun, apiChecks, apiJobs.slice(0, 3)), loadSeal), /not successful/)
const failedChecks = structuredClone(apiChecks); failedChecks[0].conclusion = "failure"
rejects(() => collectSourceChecks(apiInput, mockApi(apiRun, failedChecks), loadSeal), /membership/)
const wrongSuite = structuredClone(apiChecks); wrongSuite[0].check_suite.id = 99
rejects(() => collectSourceChecks(apiInput, mockApi(apiRun, wrongSuite), loadSeal), /membership/)
rejects(() => collectSourceChecks(apiInput, mockApi(), name => ({ ...seals[name], sourceSha: other })), /source seal/)
rejects(() => collectSourceChecks(apiInput, mockApi(), name => ({ ...seals[name], policySha: other })), /source seal/)
rejects(() => collectSourceChecks(apiInput, mockApi(), name => ({ ...seals[name], postChecks: false })), /source seal/)
rejects(() => collectSourceChecks(apiInput, mockApi(), name => ({ ...seals[name], reusedChecks: { origin: "forged" } })), /unexpected reused|reused provenance/)
const wrongJobs = structuredClone(apiJobs); wrongJobs[1].check_run_url = "https://api.github.com/repos/other/repository/check-runs/1"
rejects(() => collectSourceChecks(apiInput, mockApi(apiRun, apiChecks, wrongJobs), loadSeal), /URL invalid/)
if (previousRepo === undefined) delete process.env.GITHUB_REPOSITORY
else process.env.GITHUB_REPOSITORY = previousRepo
rmSync(apiDir, { recursive: true, force: true })
const template = readFileSync(join(__dirname, "../../.github/workflows/pr-checks.yml"), "utf8")
assert.equal(hash(template), sealed.qualification_job_template_sha256)
assert.match(workflow, /build:\n\s+if: \$\{\{ !inputs\.qualification_only \}\}/)
for (const key of Object.values(sealed.qualification_jobs)) {
  assert.ok(workflow.includes(`qualify-${key}:\n    if: \${{ inputs.qualification_only }}`))
}
const originalRuns = [...template.matchAll(/        run: \|\n((?:          .*\n|\n)+)/g)].map(x => x[0])
for (const command of originalRuns) assert.ok(workflow.includes(command.trimEnd()), "qualification must preserve full trusted job command block")
assert.doesNotMatch(workflow.split("  qualify-storefront:")[1], /docker\/login-action|docker\/build-push-action/)
// The streamed-page parser regression belongs to the trusted CI audit CLI.
// A passing product-source check must never imply this absent helper was tested.
const parseYml = source => {
  const parsed = spawnSync("ruby", ["-rpsych", "-rjson", "-e", "puts JSON.generate(Psych.safe_load(STDIN.read, permitted_classes: [], permitted_symbols: [], aliases: false))"], { input: source, encoding: "utf8" })
  assert.equal(parsed.status, 0, parsed.stderr)
  return JSON.parse(parsed.stdout)
}
function assertTrustedAuditContext(source) {
  const job = parseYml(source).jobs["qualify-storefront"]
  const steps = job.steps.filter(step => step.name === "Streamed schema audit regression tests")
  assert.equal(steps.length, 1)
  assert.deepEqual(steps[0], { name: "Streamed schema audit regression tests",
    "working-directory": ".runtime-policy/apps/storefront", run: "python3 scripts/test_catalog_schema_stream.py" })
  assert.ok(!job["continue-on-error"])
}
assertTrustedAuditContext(workflow)
assert.throws(() => assertTrustedAuditContext(workflow.replace("working-directory: .runtime-policy/apps/storefront", "working-directory: apps/storefront")))
assert.throws(() => assertTrustedAuditContext(workflow.replace("run: python3 scripts/test_catalog_schema_stream.py", "if: false\n        run: python3 scripts/test_catalog_schema_stream.py")))
assert.throws(() => assertTrustedAuditContext(workflow.replace("run: python3 scripts/test_catalog_schema_stream.py", "run: python3 scripts/test_catalog_schema_stream.py || true")))
assert.match(workflow, /--post-checks/)
assert.match(workflow, /runtime-qualification-\$\{\{ github.run_id \}\}/)
const { assertNoExtraProductionSource } = require("./validate-isolated-storefront-bake.cjs")
const ignoredFixture = initRepo()
writeFileSync(join(ignoredFixture.repo, ".gitignore"), "apps/storefront/src/ignored-generated.ts\n")
assertNoExtraProductionSource(ignoredFixture.repo)
writeFileSync(join(ignoredFixture.repo, "apps/storefront/src/ignored-generated.ts"), "export const injected = true\n")
assert.equal(git(ignoredFixture.repo, ["ls-files", "--others", "--exclude-standard", "--", "apps/storefront/src"]), "")
rejects(() => assertNoExtraProductionSource(ignoredFixture.repo), /untracked production source/)
rmSync(ignoredFixture.repo, { recursive: true, force: true })
const stagedFixture = initRepo()
const unchangedHead = git(stagedFixture.repo, ["rev-parse", "HEAD"])
writeFileSync(join(stagedFixture.repo, "apps/storefront/src/page.tsx"), "export const stagedPolicyChange = true\n")
git(stagedFixture.repo, ["add", "apps/storefront/src/page.tsx"])
assert.equal(git(stagedFixture.repo, ["rev-parse", "HEAD"]), unchangedHead)
assert.equal(spawnSync("git", ["-C", stagedFixture.repo, "diff", "--exit-code"], { encoding: "utf8" }).status, 0)
assert.equal(spawnSync("git", ["-C", stagedFixture.repo, "diff", "--exit-code", "HEAD", "--"], { encoding: "utf8" }).status, 1)
rmSync(stagedFixture.repo, { recursive: true, force: true })
const trustChecks = workflow.split("\n").filter(line => /git -C.*diff --exit-code/.test(line))
assert.equal(trustChecks.length, 7)
for (const line of trustChecks) assert.ok(line.endsWith("diff --exit-code HEAD --"))
console.log("sealed runtime policy and manifest binding: PASS")
