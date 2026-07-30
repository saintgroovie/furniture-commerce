#!/usr/bin/env node
/**
 * Fidelity tests for ops/lib/woodright-staging-mutation-lock.sh
 */
const { spawn, spawnSync } = require("child_process")
const fs = require("fs")
const os = require("os")
const path = require("path")

const root = path.resolve(__dirname, "../..")
const helper = path.join(root, "ops/lib/woodright-staging-mutation-lock.sh")
let failed = 0

function run(script, env = {}) {
  return spawnSync("bash", ["-lc", `set -euo pipefail; ${script}`], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  })
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL", msg)
    failed++
  } else {
    console.log("PASS", msg)
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wr-lock-"))
const lockPath = path.join(tmp, "live-cutover.lock")
const baseEnv = {
  WR_STAGING_MUTATION_LOCK_PATH: lockPath,
  WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL: "1",
  WR_STAGING_MUTATION_LOCK_TIMEOUT_SEC: "1",
}

{
  const r = run(
    `source "${helper}"; wr_staging_mutation_lock_acquire actor=t1 command=test; echo ACQUIRED; wr_staging_mutation_lock_release`,
    baseEnv
  )
  assert(r.status === 0 && /ACQUIRED/.test(r.stdout + r.stderr), "first acquire PASS")
}

{
  const ready = path.join(tmp, "holder.ready")
  try {
    fs.unlinkSync(ready)
  } catch (_) {}
  const holder = spawn(
    "bash",
    [
      "-lc",
      `source "${helper}"; wr_staging_mutation_lock_acquire actor=holder command=hold; touch "${ready}"; sleep 12`,
    ],
    { env: { ...process.env, ...baseEnv }, stdio: "ignore", detached: true }
  )
  holder.unref()
  for (let i = 0; i < 80 && !fs.existsSync(ready); i++) sleep(50)
  const r = run(
    `source "${helper}"; wr_staging_mutation_lock_acquire actor=t2 command=contested; echo SHOULD_NOT`,
    baseEnv
  )
  assert(fs.existsSync(ready), "holder acquired before contention probe")
  assert(r.status !== 0 && !/SHOULD_NOT/.test(r.stdout), "second acquire during hold FAIL")
  try {
    process.kill(-holder.pid, "SIGTERM")
  } catch (_) {
    try {
      process.kill(holder.pid, "SIGTERM")
    } catch (__) {}
  }
  sleep(200)
}

{
  const other = path.join(tmp, "othercwd")
  fs.mkdirSync(other)
  const r = run(
    `cd "${other}"; source "${helper}"; wr_staging_mutation_lock_acquire actor=cwd command=cwd; echo OK; wr_staging_mutation_lock_release`,
    baseEnv
  )
  assert(r.status === 0 && /OK/.test(r.stdout + r.stderr), "different cwd same lock PASS")
}

{
  const r = run(
    `source "${helper}"; wr_staging_mutation_lock_acquire actor=outer command=outer; wr_staging_mutation_lock_acquire actor=inner command=inner; echo NEST_OK; wr_staging_mutation_lock_release`,
    baseEnv
  )
  assert(r.status === 0 && /NEST_OK/.test(r.stdout + r.stderr), "nested inherit no deadlock PASS")
}

{
  const r = run(
    `source "${helper}"; WOODRIGHT_STAGING_MUTATION_LOCK_HELD=1 wr_staging_mutation_lock_acquire actor=forge command=forge; echo FORGED`,
    baseEnv
  )
  assert(r.status !== 0 && !/FORGED/.test(r.stdout), "forged WOODRIGHT_STAGING_MUTATION_LOCK_HELD rejected")
}

for (const rel of [
  "ops/release/recreate-staging-backend-with-media.sh",
  "ops/release/recreate-staging-storefront.sh",
  "ops/release/cutover-public-demo-pair.sh",
  "ops/release/rollback-staging-backend-from-keeper.sh",
  "ops/release/rollback-staging-storefront-from-keeper.sh",
  "ops/release/reconcile-runtime-manifests.sh",
  "ops/release/run-staging-seed-rooms-v1.sh",
  "scripts/release/attach-backend-network-alias.sh",
]) {
  const t = fs.readFileSync(path.join(root, rel), "utf8")
  assert(/LIVE_MUTATING\s*=\s*true/.test(t), `${rel} LIVE_MUTATING`)
  assert(t.includes("live-cutover.lock") || t.includes("woodright-staging-mutation-lock.sh"), `${rel} canonical helper`)
}

{
  const r = spawnSync("node", [path.join(root, "scripts/release/check-global-lock-policy.cjs")], {
    cwd: root,
    encoding: "utf8",
  })
  assert(r.status === 0, `check-global-lock-policy OK (${(r.stderr || r.stdout || "").trim()})`)
}

{
  const recreate = fs.readFileSync(path.join(root, "ops/release/recreate-staging-backend-with-media.sh"), "utf8")
  const usesCanonical = /woodright-staging-mutation-lock\.sh|live-cutover\.lock/.test(recreate)
  const soleDeploy = /flock[^\n]*DEPLOY\.lock/.test(recreate) && !usesCanonical
  assert(usesCanonical && !soleDeploy, "recreate uses canonical lock not sole DEPLOY.lock flock")
  assert(
    recreate.indexOf("wr_staging_mutation_lock_acquire") < recreate.indexOf('docker stop "$NAME"'),
    "recreate acquires lock before docker stop"
  )
}

{
  const recon = fs.readFileSync(path.join(root, "ops/release/reconcile-runtime-manifests.sh"), "utf8")
  const applyIdx = recon.indexOf('MODE" == "apply"') >= 0 ? recon.indexOf("--apply") : 0
  const lockIdx = recon.indexOf("wr_staging_mutation_lock_acquire")
  const secondAssert = recon.indexOf('bash "$ASSERT"', lockIdx)
  assert(lockIdx > 0 && secondAssert > lockIdx, "reconcile re-runs assert under lock before install")
}

{
  const r = run(
    `ROOMSET_SEED_TARGET=production WOODRIGHT_SEED_IMAGE=ghcr.io/x@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa WOODRIGHT_SEED_ENV_FILE=/etc/hosts bash ops/release/run-staging-seed-rooms-v1.sh`,
    {}
  )
  assert(r.status !== 0, "seed wrapper refuses production target")
}


{
  const mig = fs.readFileSync(path.join(root, "apps/backend/scripts/migrate-only.sh"), "utf8")
  assert(/WOODRIGHT_CUTOVER_LOCK_OK/.test(mig) && /live-cutover\.lock/.test(mig), "migrate-only requires cutover lock proof")
  const wrap = fs.readFileSync(path.join(root, "ops/release/run-staging-db-migrate.sh"), "utf8")
  assert(/wr_staging_mutation_lock_acquire/.test(wrap), "run-staging-db-migrate acquires lock")
}

process.exit(failed ? 1 : 0)
