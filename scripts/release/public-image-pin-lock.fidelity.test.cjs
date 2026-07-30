/**
 * Lock contention / rollback fidelity for image pin reconciliation.
 *
 *   node scripts/release/public-image-pin-lock.fidelity.test.cjs
 */
"use strict"

const assert = require("node:assert/strict")
const { spawn, spawnSync } = require("node:child_process")
const {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  existsSync,
  unlinkSync,
} = require("node:fs")
const { join } = require("node:path")
const { tmpdir } = require("node:os")

const root = process.cwd()
const SHA = "eb298fd88e8877b3b35dc1e38536acab05bbf81f"
const BE = "sha256:347e6fe400b980da61342f77df31609043c1912ebdd5fc22f6adea5bab8220d8"
const SF = "sha256:3826ef261461ec4e0eabeebf8b8207adb80470125ce1e58a4801ebb67c479871"
const OLD_BE = "sha256:5243c7c8f1146c2832af7093f1a98f4f8c4f8e5039f733d406d9571c9c657fe8"
const OLD_SF = "sha256:034db9486b9be45e282f543f7f26cbeb862a38b1282218bd0528831a44cf0828"

const script = "scripts/release/reconcile-public-image-pins.sh"
const src = readFileSync(join(root, script), "utf8")
assert.match(src, /LIVE_MUTATING=true/)
assert.match(src, /missing required --environment/)
assert.match(src, /WOODRIGHT_MUTATION_LOCK_PATH|public_demo\/live-cutover\.lock/)
assert.match(src, /flock -x|python_holder|fcntl\.flock/)
assert.doesNotMatch(src, /SKIP_LOCK=1/)

function sleepMs(ms) {
  spawnSync("sleep", [String(ms / 1000)])
}

function makeEnvFixture(dir) {
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
      `STOREFRONT_IMAGE=ghcr.io/saintgroovie/woodright-storefront@${OLD_SF}`,
      "UNRELATED=keep-me",
      "",
    ].join("\n")
  )
  chmodSync(envPath, 0o644)
  writeFileSync(composePath, readFileSync(join(root, "docker-compose.staging.yml"), "utf8"))
  writeFileSync(lockPath, "")
  return { envPath, composePath, lockPath }
}

function baseEnv(dir, extra = {}) {
  const { envPath, composePath, lockPath } = makeEnvFixture(dir)
  return {
    paths: { envPath, composePath, lockPath },
    env: {
      ...process.env,
      EXPECTED_RELEASE_SHA: SHA,
      EXPECTED_BACKEND_DIGEST: BE,
      EXPECTED_STOREFRONT_DIGEST: SF,
      ENV_FILE: envPath,
      COMPOSE_FILE: composePath,
      UPDATE_PINS: "0",
      UPDATE_ACTIVE_PUBLIC: "0",
      UPDATE_ACTIVE_RELEASE: "0",
      REQUIRE_LIVE_MATCH: "0",
      SKIP_COMPOSE_VALIDATE: "1",
      WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK: "1",
      WOODRIGHT_CUTOVER_LOCK_PATH: lockPath,
      LOCK_TIMEOUT_SEC: "2",
      BACKUP_DIR: join(dir, "backup"),
      ...extra,
    },
  }
}

function holdLock(lockPath, seconds) {
  const readyPath = `${lockPath}.held`
  try {
    unlinkSync(readyPath)
  } catch {
    /* absent ok */
  }
  // Prefer util-linux flock; fall back to python holder (macOS local).
  let proc
  if (spawnSync("bash", ["-c", "command -v flock >/dev/null"], { encoding: "utf8" }).status === 0) {
    proc = spawn(
      "bash",
      [
        "-c",
        'exec 9>>"$LOCK"; flock -x 9; printf ok >"$READY"; sleep "$SEC"',
      ],
      {
        env: {
          ...process.env,
          LOCK: lockPath,
          SEC: String(seconds),
          READY: readyPath,
        },
        stdio: "ignore",
      }
    )
  } else {
    proc = spawn(
      "python3",
      [
        "-c",
        [
          "import fcntl,os,sys,time",
          "path,sec,ready=sys.argv[1],float(sys.argv[2]),sys.argv[3]",
          "fd=os.open(path,os.O_RDWR|os.O_CREAT,0o644)",
          "fcntl.flock(fd,fcntl.LOCK_EX)",
          "open(ready,'w').write('ok\\n')",
          "time.sleep(sec)",
        ].join(";"),
        lockPath,
        String(seconds),
        readyPath,
      ],
      { stdio: "ignore" }
    )
  }
  proc.readyPath = readyPath
  return proc
}

function waitHeld(proc, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  const readyPath = proc.readyPath
  while (Date.now() < deadline) {
    if (existsSync(readyPath) && readFileSync(readyPath, "utf8").includes("ok")) {
      return true
    }
    if (proc.exitCode !== null) return false
    sleepMs(50)
  }
  return existsSync(readyPath) && readFileSync(readyPath, "utf8").includes("ok")
}

// 1) Authoritative dry-run acquires lock
{
  const dir = mkdtempSync(join(tmpdir(), "wr-pin-lock-dry-"))
  const { env, paths } = baseEnv(dir, { APPLY: "0" })
  const r = spawnSync("bash", [script, "--environment", "public_demo", "--component", "pair"], { cwd: root, encoding: "utf8", env })
  assert.equal(r.status, 0, r.stderr || r.stdout)
  assert.match(r.stdout, /lock_acquired=yes/)
  assert.match(r.stdout, /dry_run_complete/)
  assert.match(readFileSync(paths.envPath, "utf8"), /5243c7c8f1146c2832af7093f1a98f4f8c4f8e5039f733d406d9571c9c657fe8/)
}

// 2) Contention: holder keeps lock; updater fails with exit 3 and no mutation
{
  const dir = mkdtempSync(join(tmpdir(), "wr-pin-lock-contend-"))
  const { env, paths } = baseEnv(dir, { APPLY: "1" })
  const before = readFileSync(paths.envPath, "utf8")
  const holder = holdLock(paths.lockPath, 8)
  assert.equal(waitHeld(holder), true, "lock holder did not signal HELD")
  const r = spawnSync("bash", [script, "--environment", "public_demo", "--component", "pair"], { cwd: root, encoding: "utf8", env })
  assert.equal(r.status, 3, r.stderr || r.stdout)
  assert.match(r.stderr + r.stdout, /lock contention|lock_acquired=no/)
  assert.equal(readFileSync(paths.envPath, "utf8"), before)
  holder.kill("SIGTERM")
}

// 3) After free lock, apply succeeds
{
  const dir = mkdtempSync(join(tmpdir(), "wr-pin-lock-apply-"))
  const { env, paths } = baseEnv(dir, { APPLY: "1" })
  const r = spawnSync("bash", [script, "--environment", "public_demo", "--component", "pair"], { cwd: root, encoding: "utf8", env })
  assert.equal(r.status, 0, r.stderr || r.stdout)
  assert.match(r.stdout, /lock_acquired=yes/)
  assert.match(r.stdout, /apply_complete/)
  const after = readFileSync(paths.envPath, "utf8")
  assert.match(after, new RegExp(BE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(after, /JWT_SECRET=do-not-print-or-change/)
  assert.doesNotMatch(r.stdout + r.stderr, /do-not-print-or-change|also-secret/)
}

// 4) Fault after env triggers rollback under lock; original restored
{
  const dir = mkdtempSync(join(tmpdir(), "wr-pin-lock-fault-"))
  const { env, paths } = baseEnv(dir, {
    APPLY: "1",
    WOODRIGHT_PIN_RECONCILE_FAULT_AFTER: "env",
  })
  const before = readFileSync(paths.envPath, "utf8")
  const r = spawnSync("bash", [script, "--environment", "public_demo", "--component", "pair"], { cwd: root, encoding: "utf8", env })
  assert.equal(r.status, 7, r.stderr || r.stdout)
  assert.match(r.stderr + r.stdout, /restoring_all_targets|rollback_performed=yes|injected fault/)
  assert.equal(readFileSync(paths.envPath, "utf8"), before)
}

// 4b) Fault after writes at verify stage also rolls back
{
  const dir = mkdtempSync(join(tmpdir(), "wr-pin-lock-fault-verify-"))
  const { env, paths } = baseEnv(dir, {
    APPLY: "1",
    WOODRIGHT_PIN_RECONCILE_FAULT_AFTER: "verify",
  })
  const before = readFileSync(paths.envPath, "utf8")
  const r = spawnSync("bash", [script, "--environment", "public_demo", "--component", "pair"], { cwd: root, encoding: "utf8", env })
  assert.equal(r.status, 7, r.stderr || r.stdout)
  assert.match(r.stderr + r.stdout, /restoring_all_targets|rollback_performed=yes|injected fault/)
  assert.equal(readFileSync(paths.envPath, "utf8"), before)
}

// 5) Concurrent apply while A holds lock: B contends; A finishes clean pair
{
  const dir = mkdtempSync(join(tmpdir(), "wr-pin-lock-concurrent-"))
  const { env, paths } = baseEnv(dir, { APPLY: "1", LOCK_TIMEOUT_SEC: "2" })
  const holder = holdLock(paths.lockPath, 3)
  assert.equal(waitHeld(holder), true)
  const b = spawnSync("bash", [script, "--environment", "public_demo", "--component", "pair"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...env,
      EXPECTED_BACKEND_DIGEST: OLD_BE,
      EXPECTED_STOREFRONT_DIGEST: OLD_SF,
    },
  })
  assert.equal(b.status, 3, b.stderr || b.stdout)
  holder.kill("SIGTERM")
  sleepMs(100)
  const a = spawnSync("bash", [script, "--environment", "public_demo", "--component", "pair"], { cwd: root, encoding: "utf8", env })
  assert.equal(a.status, 0, a.stderr || a.stdout)
  const after = readFileSync(paths.envPath, "utf8")
  assert.match(after, new RegExp(BE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.doesNotMatch(after, /5243c7c8f1146c2832af7093f1a98f4f8c4f8e5039f733d406d9571c9c657fe8/)
}

// 6) READ_ONLY_NO_LOCK dry-run warns and does not require flock
{
  const dir = mkdtempSync(join(tmpdir(), "wr-pin-lock-nolock-"))
  const { env, paths } = baseEnv(dir, {
    APPLY: "0",
    READ_ONLY_NO_LOCK: "1",
  })
  const holder = holdLock(paths.lockPath, 5)
  assert.equal(waitHeld(holder), true)
  const r = spawnSync("bash", [script, "--environment", "public_demo", "--component", "pair"], { cwd: root, encoding: "utf8", env })
  assert.equal(r.status, 0, r.stderr || r.stdout)
  assert.match(r.stdout, /read_only_no_lock|non_authoritative/)
  holder.kill("SIGTERM")
}

// 7) APPLY + READ_ONLY_NO_LOCK rejected
{
  const dir = mkdtempSync(join(tmpdir(), "wr-pin-lock-forbid-"))
  const { env } = baseEnv(dir, { APPLY: "1", READ_ONLY_NO_LOCK: "1" })
  const r = spawnSync("bash", [script, "--environment", "public_demo", "--component", "pair"], { cwd: root, encoding: "utf8", env })
  assert.equal(r.status, 2, r.stderr || r.stdout)
}

// 8) Override without allow flag rejected
{
  const dir = mkdtempSync(join(tmpdir(), "wr-pin-lock-override-"))
  const { env } = baseEnv(dir, {
    APPLY: "0",
    WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK: "0",
    WOODRIGHT_CUTOVER_LOCK_PATH: join(dir, "evil.lock"),
    REQUIRE_LIVE_MATCH: "0",
  })
  const r = spawnSync("bash", [script, "--environment", "public_demo", "--component", "pair"], { cwd: root, encoding: "utf8", env })
  assert.equal(r.status, 2, r.stderr || r.stdout)
  assert.match(r.stderr + r.stdout, /override rejected/)
}

// Policy scanner still OK
const policy = spawnSync(
  process.execPath,
  ["scripts/release/check-global-lock-policy.cjs", "scripts/release"],
  { cwd: root, encoding: "utf8" }
)
assert.equal(policy.status, 0, policy.stderr || policy.stdout)

console.log("public-image-pin-lock.fidelity.test.cjs: ok")
