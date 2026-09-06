#!/usr/bin/env node
/**
 * CLI / dry-run contract for ops/release/reconcile-public-production-owner-env.sh
 * and ops/lib/woodright-public-production-owner-env.py
 */
"use strict"

const { spawn, spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = path.resolve(__dirname, "..", "..")
const helper = path.join(root, "ops/release/reconcile-public-production-owner-env.sh")
const planner = path.join(root, "ops/lib/woodright-public-production-owner-env.py")
const installer = path.join(root, "ops/release/install-environment-governance.sh")
const verifier = path.join(root, "ops/release/verify-environment-governance-bundle.sh")

let failed = 0
function check(cond, msg, extra) {
  if (cond) {
    console.log("PASS", msg)
  } else {
    console.error("FAIL", msg, extra ? `\n  ${extra}` : "")
    failed++
  }
}

const SHA = "caf82b048b9caefae30679342aec3d4fc42a8d89"
const SF_DIGEST = "sha256:4f05f9400b5d228e6217d90c4e53d8552e8bdb13ec72776eea265a6e16162ac4"
const BE_DIGEST = "sha256:5bd38b417fb5141c43fe7e6f5d4f8f2a4283e69c5d3f497f534005322a86618d"
const SF_REF = `ghcr.io/saintgroovie/woodright-storefront@${SF_DIGEST}`
const BE_REF = `ghcr.io/saintgroovie/woodright-backend@${BE_DIGEST}`
const CONFIRM = "I_UNDERSTAND_PUBLIC_PRODUCTION_OWNER_ENV_RECONCILE"

const helperText = fs.readFileSync(helper, "utf8")
const plannerText = fs.readFileSync(planner, "utf8")
const installerText = fs.readFileSync(installer, "utf8")
const verifierText = fs.readFileSync(verifier, "utf8")

check(/^# LIVE_MUTATING=true$/m.test(helperText), "header declares LIVE_MUTATING=true")
check(/^# requires_global_lock=true$/m.test(helperText), "header declares requires_global_lock=true")
check(helperText.includes("/srv/woodright/locks/public_production/live-cutover.lock"), "canonical public_production lock")
check(helperText.includes(CONFIRM), "execute confirm token")
check(helperText.includes("OWNER_LEGAL_CONTENT_APPROVED"), "legal pack token exact")
check(helperText.includes("admin_polling") === false || /notification runtime inject/i.test(helperText), "does not require notification runtime inject")
check(!/\bnsupdate\b|\broute53\b|\bgcloud dns\b/.test(helperText), "no DNS mutation CLIs")
check(!helperText.includes("cutover-public-apex-routing.sh"), "does not call apex routing execute")
check(!helperText.includes("cutover-public-production-pair.sh"), "does not call pair cutover")
check(!/wr_compose_force_recreate_service backend/.test(helperText), "does not recreate backend")
check(!helperText.includes("docker commit"), "no docker commit")
check(!/^[^#]*\bdocker restart\b/m.test(helperText), "does not invoke docker restart")
check(helperText.includes("restart does not inject"), "documents restart does not inject env")
check(fs.statSync(helper).mode & 0o111, "helper is executable")
check(installerText.includes("ops/release/reconcile-public-production-owner-env.sh"), "installer lists helper")
check(installerText.includes("ops/lib/woodright-public-production-owner-env.py"), "installer lists planner")
check(installerText.includes("docs/operator/public-production-owner-env-reconcile.md"), "installer lists docs")
check(verifierText.includes("ops/release/reconcile-public-production-owner-env.sh"), "verifier lists helper")
check(verifierText.includes("ops/lib/woodright-public-production-owner-env.py"), "verifier lists planner")
check(verifierText.includes("docs/operator/public-production-owner-env-reconcile.md"), "verifier lists docs")
check(plannerText.includes("notification_runtime_inject") && plannerText.includes("False"), "planner never injects notification")
check(plannerText.includes("payment_env_mutate") && plannerText.includes("False"), "planner never mutates payment")

function runHelper(args, extraEnv = {}) {
  return spawnSync("bash", [helper, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  })
}

{
  const r = runHelper([])
  check(r.status !== 0, "missing --environment fails", r.stderr)
}

{
  const r = runHelper(["--environment", "public_demo", "--component", "storefront", "--dry-run"])
  check(r.status !== 0, "public_demo refused", r.stderr)
}

{
  const r = runHelper(["--environment", "public_production", "--component", "pair", "--dry-run"])
  check(r.status !== 0, "component pair refused", r.stderr)
}

{
  const r = runHelper([
    "--environment",
    "public_production",
    "--component",
    "storefront",
    "--mode",
    "execute",
  ])
  check(r.status !== 0, "execute without confirm token fails", r.stderr)
}

{
  const r = runHelper([
    "--environment",
    "public_production",
    "--component",
    "storefront",
    "--mode",
    "execute",
    "--confirm-mutation",
    "WRONG_TOKEN",
  ])
  check(r.status !== 0, "execute with wrong confirm token fails", r.stderr)
}

function writeFixture(dir, { yamlHasToken, liveHasToken, status }) {
  const yamlLines = [
    "services:",
    "  storefront:",
    "    environment:",
    "      WOODRIGHT_LEGAL_CONTENT_STATUS: ${WOODRIGHT_LEGAL_CONTENT_STATUS:-draft}",
  ]
  if (yamlHasToken) {
    yamlLines.push("      WOODRIGHT_LEGAL_PACK_TOKEN: ${WOODRIGHT_LEGAL_PACK_TOKEN:-}")
  }
  fs.writeFileSync(path.join(dir, "docker-compose.yml"), yamlLines.join("\n") + "\n")
  fs.writeFileSync(
    path.join(dir, ".env"),
    [
      `WOODRIGHT_STOREFRONT_IMAGE=${SF_REF}`,
      `WOODRIGHT_BACKEND_IMAGE=${BE_REF}`,
      `WOODRIGHT_RELEASE_SHA=${SHA}`,
      `WOODRIGHT_LEGAL_CONTENT_STATUS=${status}`,
      liveHasToken ? `WOODRIGHT_LEGAL_PACK_TOKEN=OWNER_LEGAL_CONTENT_APPROVED` : null,
      "DATABASE_URL=secret-must-not-print",
    ]
      .filter(Boolean)
      .join("\n") + "\n"
  )
  fs.writeFileSync(path.join(dir, "traefik.yml"), "http: {}\n")
  const env = {
    WOODRIGHT_RELEASE_SHA: SHA,
    WOODRIGHT_RUNTIME_ROLE: "public_production",
    WOODRIGHT_DATABASE_IDENTITY_ALIAS: "public_production_db",
    WOODRIGHT_LEGAL_CONTENT_STATUS: status,
  }
  if (liveHasToken) env.WOODRIGHT_LEGAL_PACK_TOKEN = "OWNER_LEGAL_CONTENT_APPROVED"
  fs.writeFileSync(
    path.join(dir, "live.json"),
    JSON.stringify(
      {
        id: "a".repeat(64),
        digest: SF_DIGEST,
        role: "public_production",
        db: "public_production_db",
        dokploy_attached: true,
        dokploy_aliases: ["woodright-public-production-storefront"],
        compose_net_attached: true,
        traefik_hash: "d24423ef45b7637714be6686813c9ad2e8a3ca9149d70dd65d95611fbddbcc4c",
        backend_id: "b".repeat(64),
        backend_digest: BE_DIGEST,
        env,
      },
      null,
      2
    ) + "\n"
  )
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-owner-env-need-"))
  writeFixture(dir, { yamlHasToken: false, liveHasToken: false, status: "draft" })
  const plan = spawnSync("python3", [planner, "plan", "--compose-yml", path.join(dir, "docker-compose.yml"), "--compose-env", path.join(dir, ".env"), "--live-json", path.join(dir, "live.json")], {
    encoding: "utf8",
  })
  check(plan.status === 0, "planner succeeds for missing token", plan.stderr)
  const parsed = JSON.parse(plan.stdout)
  check(parsed.already_applied === false, "planner already_applied=false")
  check(parsed.yaml_needs_pack_token_line === true, "planner yaml_needs=true")
  check(parsed.planned_env.WOODRIGHT_LEGAL_PACK_TOKEN === "OWNER_LEGAL_CONTENT_APPROVED", "planner want pack token")
  check(parsed.planned_env.WOODRIGHT_LEGAL_CONTENT_STATUS === "approved", "planner want approved")
  check(parsed.notification_runtime_inject === false, "planner notification_runtime_inject=false")
  check(parsed.payment_env_mutate === false, "planner payment_env_mutate=false")
  check(parsed.dns_mutation === false, "planner dns_mutation=false")
  check(parsed.backend_recreate === false, "planner backend_recreate=false")
  check(!JSON.stringify(parsed).includes("secret-must-not-print"), "planner does not print secrets")

  const applied = path.join(dir, "docker-compose.patched.yml")
  const y = spawnSync("python3", [planner, "apply-yaml", "--compose-yml", path.join(dir, "docker-compose.yml"), "--out", applied], { encoding: "utf8" })
  check(y.status === 0, "apply-yaml succeeds", y.stderr)
  const patched = fs.readFileSync(applied, "utf8")
  check(patched.includes("WOODRIGHT_LEGAL_PACK_TOKEN: ${WOODRIGHT_LEGAL_PACK_TOKEN:-}"), "apply-yaml inserts pack token line")
  check((patched.match(/^\s*WOODRIGHT_LEGAL_PACK_TOKEN\s*:/gm) || []).length === 1, "apply-yaml inserts exactly once")

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-owner-env-assemble-"))
  const envPath = path.join(dir, "env.json")
  const outPath = path.join(dir, "live.json")
  fs.writeFileSync(envPath, JSON.stringify({ WOODRIGHT_LEGAL_CONTENT_STATUS: "draft", SECRET: "must-not-print" }) + "\n")
  const assembled = spawnSync(
    "python3",
    [
      planner,
      "assemble-live",
      "--env-json",
      envPath,
      "--out",
      outPath,
      "--id",
      "a".repeat(64),
      "--digest",
      SF_DIGEST,
      "--role",
      "public_production",
      "--db",
      "public_production_db",
      "--dokploy-attached",
      "true",
      "--aliases",
      "woodright-public-production-storefront",
      "--compose-net-attached",
      "true",
      "--traefik-hash",
      "abc",
      "--backend-id",
      "b".repeat(64),
      "--backend-digest",
      BE_DIGEST,
    ],
    { encoding: "utf8" }
  )
  check(assembled.status === 0, "assemble-live succeeds without stdin/heredoc mix", assembled.stderr)
  const live = JSON.parse(fs.readFileSync(outPath, "utf8"))
  check(live.env.WOODRIGHT_LEGAL_CONTENT_STATUS === "draft", "assemble-live preserves env via file channel")
  check(live.role === "public_production" && live.db === "public_production_db", "assemble-live copies role/db")
  check(live.dokploy_aliases[0] === "woodright-public-production-storefront", "assemble-live copies aliases")
}

  const r = runHelper(
    ["--environment", "public_production", "--component", "storefront", "--mode", "dry-run"],
    {
      WOODRIGHT_OWNER_ENV_HARNESS: "1",
      WOODRIGHT_OWNER_ENV_FIXTURE_DIR: dir,
      WOODRIGHT_ENV_ALLOW_INHERITED_MISMATCH: "1",
    }
  )
  check(r.status === 0, "harness dry-run succeeds for missing token", r.stderr + r.stdout)
  const packet = JSON.parse(r.stdout)
  check(packet.result_token === "PUBLIC_PRODUCTION_OWNER_ENV_RECONCILE_DRY_RUN_PASS", "dry-run token")
  check(packet.mutation === false, "dry-run mutation=false")
  check(packet.same_images === true, "dry-run same_images")
  check(packet.same_SHA === true, "dry-run same_SHA")
  check(packet.backend_recreate === false, "dry-run backend_recreate=false")
  check(packet.dns_mutation === false, "dry-run dns_mutation=false")
  check(packet.traefik_write === false, "dry-run traefik_write=false")
  check(packet.rollback.constructible === true, "rollback constructible")
  check(packet.yaml_needs_pack_token_line === true, "harness yaml_needs")
  check(!JSON.stringify(packet).includes("secret-must-not-print"), "packet does not print secrets")
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-owner-env-stale-"))
  writeFixture(dir, { yamlHasToken: true, liveHasToken: true, status: "approved" })
  const envPath = path.join(dir, ".env")
  const envText = fs.readFileSync(envPath, "utf8").replace(
    /^WOODRIGHT_LEGAL_PACK_TOKEN=OWNER_LEGAL_CONTENT_APPROVED\n/m,
    ""
  )
  fs.writeFileSync(envPath, envText)
  const plan = spawnSync(
    "python3",
    [planner, "plan", "--compose-yml", path.join(dir, "docker-compose.yml"), "--compose-env", envPath, "--live-json", path.join(dir, "live.json")],
    { encoding: "utf8" }
  )
  check(plan.status === 0, "planner accepts stale compose env", plan.stderr)
  check(JSON.parse(plan.stdout).already_applied === false, "stale compose .env is not already_applied")
  const r = runHelper(
    ["--environment", "public_production", "--component", "storefront", "--mode", "execute", "--confirm-mutation", CONFIRM],
    harnessExecuteEnv(dir)
  )
  check(r.status === 0, "execute reconciles stale compose .env", r.stderr)
  check(
    fs.readFileSync(envPath, "utf8").includes("WOODRIGHT_LEGAL_PACK_TOKEN=OWNER_LEGAL_CONTENT_APPROVED"),
    "stale compose .env received pack token"
  )
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-owner-env-done-"))
  writeFixture(dir, { yamlHasToken: true, liveHasToken: true, status: "approved" })
  const r = runHelper(
    ["--environment", "public_production", "--component", "storefront", "--dry-run"],
    {
      WOODRIGHT_OWNER_ENV_HARNESS: "1",
      WOODRIGHT_OWNER_ENV_FIXTURE_DIR: dir,
    }
  )
  check(r.status === 0, "harness dry-run already_applied succeeds", r.stderr)
  const packet = JSON.parse(r.stdout)
  check(packet.already_applied === true, "already_applied=true")
  check(packet.result_token === "PUBLIC_PRODUCTION_OWNER_ENV_RECONCILE_DRY_RUN_PASS", "already_applied still dry-run pass")
  check(packet.mutation === false, "already_applied mutation=false")
}

{
  const r = runHelper(
    [
      "--environment",
      "public_production",
      "--component",
      "storefront",
      "--mode",
      "execute",
      "--confirm-mutation",
      CONFIRM,
    ],
    {
      WOODRIGHT_OWNER_ENV_HARNESS: "1",
      WOODRIGHT_OWNER_ENV_FIXTURE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "wr-owner-env-exec-")),
    }
  )
  check(r.status !== 0, "harness execute refused without HARNESS_EXECUTE", r.stderr)
}

function harnessExecuteEnv(dir) {
  const lockPath = path.join(dir, "locks/public_production/live-cutover.lock")
  fs.mkdirSync(path.dirname(lockPath), { recursive: true })
  fs.writeFileSync(lockPath, "")
  return {
    WOODRIGHT_OWNER_ENV_HARNESS: "1",
    WOODRIGHT_OWNER_ENV_HARNESS_EXECUTE: "1",
    WOODRIGHT_OWNER_ENV_FIXTURE_DIR: dir,
    WOODRIGHT_OWNER_ENV_LOCK_PATH: lockPath,
  }
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-owner-env-role-"))
  writeFixture(dir, { yamlHasToken: false, liveHasToken: false, status: "draft" })
  const live = JSON.parse(fs.readFileSync(path.join(dir, "live.json"), "utf8"))
  live.role = "public_demo"
  fs.writeFileSync(path.join(dir, "live.json"), JSON.stringify(live, null, 2) + "\n")
  const r = runHelper(
    ["--environment", "public_production", "--component", "storefront", "--dry-run"],
    { WOODRIGHT_OWNER_ENV_HARNESS: "1", WOODRIGHT_OWNER_ENV_FIXTURE_DIR: dir }
  )
  check(r.status !== 0, "role mismatch fail-closed", r.stderr)
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-owner-env-run-"))
  writeFixture(dir, { yamlHasToken: false, liveHasToken: false, status: "draft" })
  const r = runHelper(
    ["--environment", "public_production", "--component", "storefront", "--mode", "execute", "--confirm-mutation", CONFIRM],
    harnessExecuteEnv(dir)
  )
  check(r.status === 0, "harness execute success", r.stderr + r.stdout)
  const envText = fs.readFileSync(path.join(dir, ".env"), "utf8")
  check(envText.includes("WOODRIGHT_LEGAL_PACK_TOKEN=OWNER_LEGAL_CONTENT_APPROVED"), "execute wrote pack token")
  check(envText.includes(`WOODRIGHT_STOREFRONT_IMAGE=${SF_REF}`), "execute retained storefront pin")
  check(envText.includes(`WOODRIGHT_RELEASE_SHA=${SHA}`), "execute retained SHA pin")
  const yaml = fs.readFileSync(path.join(dir, "docker-compose.yml"), "utf8")
  check(/^\s*WOODRIGHT_LEGAL_PACK_TOKEN\s*:/m.test(yaml), "execute inserted yaml pack token")
  const live = JSON.parse(fs.readFileSync(path.join(dir, "live.json"), "utf8"))
  check(live.digest === SF_DIGEST, "execute retained digest")
  check(live.backend_id === "b".repeat(64), "execute retained backend id")
  check(live.role === "public_production", "execute retained role")
  check(live.db === "public_production_db", "execute retained db")
  check(live.env.WOODRIGHT_LEGAL_PACK_TOKEN === "OWNER_LEGAL_CONTENT_APPROVED", "execute live env token")
  const packet = JSON.parse(r.stdout)
  check(packet.lock_path.endsWith("/locks/public_production/live-cutover.lock"), "execute lock suffix")
  check(packet.identity_role === "public_production", "packet identity role")
  check(packet.identity_db === "public_production_db", "packet identity db")
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-owner-env-rb-"))
  writeFixture(dir, { yamlHasToken: false, liveHasToken: false, status: "draft" })
  const beforeYaml = fs.readFileSync(path.join(dir, "docker-compose.yml"), "utf8")
  const beforeEnv = fs.readFileSync(path.join(dir, ".env"), "utf8")
  const r = runHelper(
    ["--environment", "public_production", "--component", "storefront", "--mode", "execute", "--confirm-mutation", CONFIRM],
    { ...harnessExecuteEnv(dir), WOODRIGHT_OWNER_ENV_INJECT_FAIL: "after-env" }
  )
  check(r.status !== 0, "injected execute failure exits non-zero", r.stderr)
  check(/rollback verified/i.test(r.stderr), "rollback verified on injected failure", r.stderr)
  check(fs.readFileSync(path.join(dir, "docker-compose.yml"), "utf8") === beforeYaml, "rollback restored yaml")
  check(fs.readFileSync(path.join(dir, ".env"), "utf8") === beforeEnv, "rollback restored env")
  check(!fs.readFileSync(path.join(dir, ".env"), "utf8").includes("WOODRIGHT_LEGAL_PACK_TOKEN=OWNER_LEGAL_CONTENT_APPROVED"), "rollback removed injected token")
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-owner-env-id-"))
  writeFixture(dir, { yamlHasToken: false, liveHasToken: false, status: "draft" })
  const beforeYaml = fs.readFileSync(path.join(dir, "docker-compose.yml"), "utf8")
  const beforeEnv = fs.readFileSync(path.join(dir, ".env"), "utf8")
  const r = runHelper(
    ["--environment", "public_production", "--component", "storefront", "--mode", "execute", "--confirm-mutation", CONFIRM],
    { ...harnessExecuteEnv(dir), WOODRIGHT_OWNER_ENV_INJECT_FAIL: "post-identity" }
  )
  check(r.status !== 0, "post-recreate identity inject exits non-zero", r.stderr)
  check(/rollback verified/i.test(r.stderr), "post-recreate identity mismatch rolls back", r.stderr)
  check(fs.readFileSync(path.join(dir, "docker-compose.yml"), "utf8") === beforeYaml, "identity rollback restored yaml")
  check(fs.readFileSync(path.join(dir, ".env"), "utf8") === beforeEnv, "identity rollback restored env")
}

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wr-owner-env-lock-"))
  writeFixture(dir, { yamlHasToken: false, liveHasToken: false, status: "draft" })
  const env = harnessExecuteEnv(dir)
  const lockLib = path.join(root, "ops/lib/woodright-staging-mutation-lock.sh")
  const holder = spawn(
    "bash",
    [
      "-c",
      `set -euo pipefail
source "${lockLib}"
WR_STAGING_MUTATION_LOCK_PATH="${env.WOODRIGHT_OWNER_ENV_LOCK_PATH}"
WR_STAGING_MUTATION_LOCK_DIR="$(dirname "$WR_STAGING_MUTATION_LOCK_PATH")"
WR_STAGING_MUTATION_LOCK_META="${env.WOODRIGHT_OWNER_ENV_LOCK_PATH}.meta"
WR_STAGING_MUTATION_LOCK_ALLOW_NONCANONICAL=1
wr_staging_mutation_lock_acquire actor=holder command=test target=storefront
sleep 8
`,
    ],
    { stdio: "ignore" }
  )
  spawnSync("python3", ["-c", "import time; time.sleep(0.6)"])
  const r = runHelper(
    ["--environment", "public_production", "--component", "storefront", "--mode", "execute", "--confirm-mutation", CONFIRM],
    { ...env, WR_STAGING_MUTATION_LOCK_TIMEOUT_SEC: "1" }
  )
  holder.kill("SIGTERM")
  check(r.status === 3, "lock contention exits 3", `status=${r.status} ${r.stderr}`)
}

if (failed) {
  console.error(`FAILED ${failed}`)
  process.exit(1)
}
console.log("ALL_OK")
