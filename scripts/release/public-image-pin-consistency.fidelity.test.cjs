/**
 * Fidelity for public image pin consistency + reconcile dry-run contract.
 *
 *   node scripts/release/public-image-pin-consistency.fidelity.test.cjs
 */
"use strict"

const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  existsSync,
} = require("node:fs")
const { join } = require("node:path")
const { tmpdir } = require("node:os")

const root = process.cwd()
const SHA = "eb298fd88e8877b3b35dc1e38536acab05bbf81f"
const BE = "sha256:347e6fe400b980da61342f77df31609043c1912ebdd5fc22f6adea5bab8220d8"
const SF = "sha256:3826ef261461ec4e0eabeebf8b8207adb80470125ce1e58a4801ebb67c479871"
const OLD_BE = "sha256:5243c7c8f1146c2832af7093f1a98f4f8c4f8e5039f733d406d9571c9c657fe8"
const OLD_SF = "sha256:034db9486b9be45e282f543f7f26cbeb862a38b1282218bd0528831a44cf0828"

const self = spawnSync(
  process.execPath,
  ["scripts/release/verify-public-image-pin-consistency.cjs", "--self-test"],
  { cwd: root, encoding: "utf8" }
)
assert.equal(self.status, 0, self.stderr || self.stdout)

const fixtures = spawnSync(
  process.execPath,
  [
    "scripts/release/verify-public-image-pin-consistency.cjs",
    "--fixture-dir",
    "scripts/release/fixtures/image-pins",
  ],
  { cwd: root, encoding: "utf8" }
)
assert.equal(fixtures.status, 0, fixtures.stderr || fixtures.stdout)

const composeOnly = spawnSync(
  process.execPath,
  ["scripts/release/verify-public-image-pin-consistency.cjs"],
  { cwd: root, encoding: "utf8" }
)
assert.equal(composeOnly.status, 0, composeOnly.stderr || composeOnly.stdout)

// Dry-run updater on temp env: only IMAGE lines change; secrets preserved.
// Uses fixture lock path (test-only) so CI never touches /srv/woodright/locks.
const dir = mkdtempSync(join(tmpdir(), "wr-pin-reconcile-"))
const envPath = join(dir, ".env")
const composePath = join(dir, "docker-compose.staging.yml")
const lockPath = join(dir, "live-cutover.lock")
writeFileSync(
  envPath,
  [
    "JWT_SECRET=do-not-print-or-change",
    "COOKIE_SECRET=also-secret",
    `WOODRIGHT_BACKEND_IMAGE=ghcr.io/saintgroovie/woodright-backend@${OLD_BE}`,
    `WOODRIGHT_STOREFRONT_IMAGE=ghcr.io/saintgroovie/woodright-storefront@${OLD_SF}`,
    `STOREFRONT_IMAGE=ghcr.io/saintgroovie/woodright-storefront@sha256:8672e705ec52bd2e7191cb8eb29c2ffc32a744cb8e26503290b5ce3b6b4e67e3`,
    "UNRELATED=keep-me",
    "",
  ].join("\n")
)
chmodSync(envPath, 0o644)
writeFileSync(
  composePath,
  readFileSync(join(root, "docker-compose.staging.yml"), "utf8")
)
writeFileSync(lockPath, "")

const testLockEnv = {
  WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK: "1",
  WOODRIGHT_CUTOVER_LOCK_PATH: lockPath,
  WOODRIGHT_META_ROOT: join(dir, "meta"),
  LOCK_TIMEOUT_SEC: "5",
}

const dry = spawnSync(
  "bash",
  ["scripts/release/reconcile-public-image-pins.sh", "--environment", "public_demo", "--component", "pair"],
  {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      ...testLockEnv,
      EXPECTED_RELEASE_SHA: SHA,
      EXPECTED_BACKEND_DIGEST: BE,
      EXPECTED_STOREFRONT_DIGEST: SF,
      ENV_FILE: envPath,
      COMPOSE_FILE: composePath,
      UPDATE_PINS: "0",
      UPDATE_ACTIVE_PUBLIC: "0",
      APPLY: "0",
      REQUIRE_LIVE_MATCH: "0",
      BACKUP_DIR: join(dir, "backup"),
    },
  }
)
assert.equal(dry.status, 0, dry.stderr || dry.stdout)
assert.match(dry.stdout, /dry_run_complete/)
assert.match(dry.stdout, /lock_acquired=yes/)
assert.doesNotMatch(dry.stdout + dry.stderr, /do-not-print-or-change|also-secret/)
// file unchanged on dry-run
const afterDry = readFileSync(envPath, "utf8")
assert.match(afterDry, /JWT_SECRET=do-not-print-or-change/)
assert.match(afterDry, /5243c7c8f1146c2832af7093f1a98f4f8c4f8e5039f733d406d9571c9c657fe8/)

// APPLY on temp with live-match disabled (unit contract); compose validate skipped.
{
  const apply = spawnSync(
    "bash",
    ["scripts/release/reconcile-public-image-pins.sh", "--environment", "public_demo", "--component", "pair"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        ...testLockEnv,
        EXPECTED_RELEASE_SHA: SHA,
        EXPECTED_BACKEND_DIGEST: BE,
        EXPECTED_STOREFRONT_DIGEST: SF,
        ENV_FILE: envPath,
        COMPOSE_FILE: composePath,
        UPDATE_PINS: "0",
        UPDATE_ACTIVE_PUBLIC: "0",
        APPLY: "1",
        SKIP_COMPOSE_VALIDATE: "1",
        REQUIRE_LIVE_MATCH: "0",
        BACKUP_DIR: join(dir, "backup"),
      },
    }
  )
  assert.equal(apply.status, 0, apply.stderr || apply.stdout)
  assert.match(apply.stdout, /lock_acquired=yes/)
  const after = readFileSync(envPath, "utf8")
  assert.match(after, new RegExp(BE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(after, new RegExp(SF.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.doesNotMatch(after, /5243c7c8f1146c2832af7093f1a98f4f8c4f8e5039f733d406d9571c9c657fe8/)
  assert.match(after, /JWT_SECRET=do-not-print-or-change/)
  assert.match(after, /UNRELATED=keep-me/)
  assert.match(after, /COOKIE_SECRET=also-secret/)
  assert.doesNotMatch(apply.stdout + apply.stderr, /do-not-print-or-change|also-secret/)
}

assert.ok(existsSync(join(root, "docs/operator/dokploy-staging.md")))
const docs = readFileSync(join(root, "docs/operator/dokploy-staging.md"), "utf8")
assert.match(docs, /reconcile-public-image-pins|image pin/)
assert.match(docs, /live-cutover\.lock/)

console.log("public-image-pin-consistency.fidelity.test.cjs: ok")
