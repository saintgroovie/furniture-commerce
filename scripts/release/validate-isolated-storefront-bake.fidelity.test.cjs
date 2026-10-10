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

function initRepo() {
  const repo = mkdtempSync(join(tmpdir(), "wr-iso-bake-"))
  git(repo, ["init", "-q"])
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
