#!/usr/bin/env node
/**
 * CLI / dry-run contract for ops/release/cutover-public-production-pair.sh.
 * Execute state machine: scripts/ops/test-public-production-pair-cutover-execute-fidelity.sh
 */
"use strict"

const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const root = path.resolve(__dirname, "..", "..")
const helper = path.join(root, "ops/release/cutover-public-production-pair.sh")

let failed = 0
function check(cond, msg, extra) {
  if (cond) {
    console.log("PASS", msg)
  } else {
    console.error("FAIL", msg, extra ? `\n  ${extra}` : "")
    failed++
  }
}

const SHA = "a".repeat(40)
const HELPER_SHA = "b".repeat(40)
const CONFIRM = "I_UNDERSTAND_PUBLIC_PRODUCTION_PAIR_CUTOVER"
const BE_REF = `ghcr.io/saintgroovie/woodright-backend@sha256:${"b".repeat(64)}`
const SF_REF = `ghcr.io/saintgroovie/woodright-storefront@sha256:${"c".repeat(64)}`

const metaRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wr-pubprod-oa-"))
fs.mkdirSync(path.join(metaRoot, "public_production"), { recursive: true })
fs.writeFileSync(
  path.join(metaRoot, "public_production", "OWNER_APPROVED_RELEASE.json"),
  JSON.stringify(
    {
      schema_version: 1,
      environment: "public_production",
      application_sha: SHA,
      backend_digest: BE_REF.split("@")[1],
      storefront_digest: SF_REF.split("@")[1],
      owner_decision: "approved",
      owner_authorization_id: "OWNER-PASS-cli-fixture",
      issued_at: "2026-08-21T00:00:00Z",
      evidence_reference: "/tmp/fixture",
      tooling_schema_version: "owner-approved-release-v1",
    },
    null,
    2
  ) + "\n"
)

function run(args, extraEnv = {}) {
  return spawnSync("bash", [helper, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      WOODRIGHT_HELPER_INSTALL_SHA: HELPER_SHA,
      WOODRIGHT_PROVENANCE_ALLOW_ENV_OVERRIDE: "1",
      WOODRIGHT_META_ROOT: metaRoot,
      WOODRIGHT_OWNER_APPROVAL_STRICT_ENVIRONMENT: "1",
      ...extraEnv,
    },
  })
}

{
  const text = fs.readFileSync(helper, "utf8")
  check(/^# LIVE_MUTATING=true$/m.test(text), "header declares LIVE_MUTATING=true")
  check(/^# requires_global_lock=true$/m.test(text), "header declares requires_global_lock=true")
  check(text.includes("/srv/woodright/locks/public_production/live-cutover.lock"), "canonical public_production lock")
  check(!text.includes("recreate-staging-storefront.sh"), "does not call demo storefront recreate")
  check(!text.includes("recreate-staging-backend-with-media.sh"), "does not call demo backend recreate")
  check(!/\bgcloud dns\b|\broute53\b/.test(text) || /refused DNS/.test(text), "no DNS mutation helpers (refuse-only mentions ok)")
  check(text.includes("refused legal-pack token"), "refuses legal-pack token in environment")
  check(fs.statSync(helper).mode & 0o111, "script is executable")
}

{
  const r = run(["--component", "pair", "--source-sha", SHA])
  check(r.status === 1 || r.status === 2, "missing --environment fails closed", r.stderr)
}

{
  const r = run(["--environment", "public_demo", "--component", "pair", "--source-sha", SHA, "--backend-ref", BE_REF, "--storefront-ref", SF_REF])
  check(r.status !== 0, "public_demo environment refused", r.stderr)
}

{
  const r = run(["--environment", "production", "--component", "pair", "--source-sha", SHA, "--backend-ref", BE_REF, "--storefront-ref", SF_REF])
  check(r.status !== 0, "private candidate environment refused", r.stderr)
}

{
  const r = run(["--environment", "public_production", "--component", "storefront", "--source-sha", SHA, "--storefront-ref", SF_REF, "--backend-ref", BE_REF])
  check(r.status !== 0, "single-component storefront refused", r.stderr)
  check(/pair-only/.test(r.stderr), "pair-only message")
}

{
  const r = run(["--environment", "public_production", "--component", "pair", "--source-sha", SHA])
  check(r.status !== 0, "pair without refs fails closed", r.stderr)
}

{
  const r = run([
    "--environment", "public_production", "--component", "pair", "--source-sha", SHA,
    "--backend-ref", BE_REF, "--storefront-ref", SF_REF,
    "--mode", "execute", "--confirm-mutation", "WRONG",
  ])
  check(r.status !== 0, "wrong confirm token refused", r.stderr)
}

{
  const r = run([
    "--environment", "public_production", "--component", "pair", "--source-sha", SHA,
    "--backend-ref", BE_REF, "--storefront-ref", SF_REF,
  ])
  // Dry-run may fail closed on missing live containers/images; it must never mutate.
  check(r.status !== 99, "dry-run did not hit unexpected-mutation code", r.stderr)
  check(!/nsupdate|cs-cart|traefik.http.routers/.test(r.stderr + r.stdout), "dry-run has no DNS/legacy/traefik mutation language")
  if (r.status === 0) {
    const jsonStart = r.stdout.indexOf("{")
    let packet = null
    try {
      packet = JSON.parse(r.stdout.slice(jsonStart))
    } catch (e) {
      check(false, "dry-run stdout JSON", e.message)
    }
    if (packet) {
      check(packet.environment === "public_production", "packet.environment is public_production")
      check(packet.no_dns_change === true, "packet asserts no_dns_change")
      const http = (packet.planned_mutation && packet.planned_mutation.health_plan && packet.planned_mutation.health_plan.http) || []
      check(http.every((u) => u.startsWith("http://127.0.0.1:3300") || u.startsWith("http://127.0.0.1:9300")), "health plan is loopback 3300/9300")
      check(!http.some((u) => /woodright\.ru/.test(u)), "health plan never uses woodright.ru")
    }
  } else {
    console.log("NOTE dry-run exited", r.status, "(acceptable if live pair absent on this host)")
  }
}

{
  const r = run(
    ["--environment", "public_production", "--component", "pair", "--source-sha", SHA, "--backend-ref", BE_REF, "--storefront-ref", SF_REF],
    { WOODRIGHT_OWNER_APPROVAL_PEER_SF_DIGEST: `sha256:${"d".repeat(64)}` }
  )
  check(r.status !== 0, "spoofed peer SF digest refused", r.stderr)
}

fs.rmSync(metaRoot, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
