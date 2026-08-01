#!/usr/bin/env node
/**
 * Fidelity tests for ops/release/cutover-production-candidate.sh.
 *
 * This helper is dry-run-only in this release (execute is a fail-closed
 * stub), so these tests exercise real subprocess invocations against the
 * checked-in ops/config/runtime-environments/production.conf - no Docker
 * daemon required for the negative/usage cases, and the positive dry-run
 * case tolerates Docker being absent (containers/images simply report as
 * "not present locally", which is still a valid, non-mutating dry-run).
 *
 * Invoked from PR checks release-governance job (plain node, no yarn dlx).
 *
 *   node scripts/release/cutover-production-candidate.fidelity.test.cjs
 */
"use strict"

const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const root = path.resolve(__dirname, "..", "..")
const helper = path.join(root, "ops/release/cutover-production-candidate.sh")

let failed = 0
function check(cond, msg, extra) {
  if (cond) {
    console.log("PASS", msg)
  } else {
    console.error("FAIL", msg, extra ? `\n  ${extra}` : "")
    failed++
  }
}

function run(args) {
  return spawnSync("bash", [helper, ...args], { cwd: root, encoding: "utf8" })
}

const SHA = "a".repeat(40)
const DIGEST = `sha256:${"b".repeat(64)}`
const SF_REF = `ghcr.io/saintgroovie/woodright-storefront@${DIGEST}`
const BE_REF = `ghcr.io/saintgroovie/woodright-backend@${DIGEST}`

// 1. Static: header declares this is NOT live-mutating, execute is a stub.
{
  const text = fs.readFileSync(helper, "utf8")
  check(/LIVE_MUTATING\s*=\s*false/.test(text), "header declares LIVE_MUTATING=false")
  check(
    /execute mode not enabled in this release/.test(text),
    "execute path contains the fail-closed stub message"
  )
  check(fs.statSync(helper).mode & 0o111, "script is executable")
}

// 2. Missing --environment -> usage error.
{
  const r = run(["--component", "pair", "--source-sha", SHA])
  check(r.status === 1 || r.status === 2, "missing --environment fails closed", r.stderr)
}

// 3. --environment public_demo is explicitly refused (never silently reused).
{
  const r = run(["--environment", "public_demo", "--component", "pair", "--source-sha", SHA])
  check(r.status !== 0, "public_demo environment refused", r.stderr)
  check(/refused/.test(r.stderr) && /public_demo/.test(r.stderr), "refusal message names public_demo")
}

// 4. --environment staging is refused too (only production accepted).
{
  const r = run(["--environment", "staging", "--component", "pair", "--source-sha", SHA])
  check(r.status !== 0, "staging environment refused", r.stderr)
}

// 5. Missing --component -> usage error.
{
  const r = run(["--environment", "production", "--source-sha", SHA])
  check(r.status !== 0, "missing --component fails closed", r.stderr)
}

// 6. Invalid --source-sha (not 40-hex) -> usage error.
{
  const r = run(["--environment", "production", "--component", "pair", "--source-sha", "not-a-sha"])
  check(r.status !== 0, "invalid --source-sha fails closed", r.stderr)
}

// 7. --component pair requires both refs.
{
  const r = run(["--environment", "production", "--component", "pair", "--source-sha", SHA])
  check(r.status !== 0, "pair without storefront/backend refs fails closed", r.stderr)
}

// 8. Mutable/non-digest image refs are refused.
{
  const r = run([
    "--environment",
    "production",
    "--component",
    "storefront",
    "--source-sha",
    SHA,
    "--storefront-ref",
    "ghcr.io/saintgroovie/woodright-storefront:latest",
  ])
  check(r.status !== 0, "mutable :latest storefront ref refused", r.stderr)
}

// 9. Valid dry-run (pair) exits 0 and prints a JSON packet proving no mutation.
{
  const r = run([
    "--environment",
    "production",
    "--component",
    "pair",
    "--source-sha",
    SHA,
    "--storefront-ref",
    SF_REF,
    "--backend-ref",
    BE_REF,
  ])
  check(r.status === 0, "valid pair dry-run exits 0", r.stderr)
  const jsonStart = r.stdout.indexOf("{")
  let packet = null
  if (jsonStart !== -1) {
    try {
      packet = JSON.parse(r.stdout.slice(jsonStart))
    } catch (e) {
      check(false, "dry-run stdout contains parseable JSON packet", e.message)
    }
  }
  if (packet) {
    check(packet.mode === "dry-run", "packet.mode is dry-run")
    check(packet.environment === "production", "packet.environment is production")
    check(packet.component === "pair", "packet.component is pair")
    check(packet.source_sha === SHA, "packet.source_sha matches requested sha")
    check(packet.no_mutation_performed === true, "packet asserts no_mutation_performed")
    check(packet.no_lock_held === true, "packet asserts no_lock_held")
    check(packet.no_pin_writes === true, "packet asserts no_pin_writes")
    check(packet.no_dns_change === true, "packet asserts no_dns_change")
    check(packet.candidates.backend.applicable === true, "packet includes applicable backend candidate")
    check(packet.candidates.storefront.applicable === true, "packet includes applicable storefront candidate")
  }
}

// 10. component=backend only requires --backend-ref, and marks storefront N/A.
{
  const r = run([
    "--environment",
    "production",
    "--component",
    "backend",
    "--source-sha",
    SHA,
    "--backend-ref",
    BE_REF,
  ])
  check(r.status === 0, "valid backend-only dry-run exits 0", r.stderr)
  const jsonStart = r.stdout.indexOf("{")
  if (jsonStart !== -1) {
    const packet = JSON.parse(r.stdout.slice(jsonStart))
    check(packet.candidates.storefront.applicable === false, "backend-only packet marks storefront not applicable")
  }
}

// 11. execute mode without --confirm-mutation fails closed (usage error).
{
  const r = run([
    "--environment",
    "production",
    "--component",
    "backend",
    "--source-sha",
    SHA,
    "--backend-ref",
    BE_REF,
    "--mode",
    "execute",
  ])
  check(r.status === 2, "execute without confirm-mutation exits 2", r.stderr)
}

// 12. execute mode with the correct confirm token still fails closed (exit 3),
//     proving no mutation path is reachable in this release.
{
  const r = run([
    "--environment",
    "production",
    "--component",
    "backend",
    "--source-sha",
    SHA,
    "--backend-ref",
    BE_REF,
    "--mode",
    "execute",
    "--confirm-mutation",
    "I_UNDERSTAND_PRIVATE_PRODUCTION_CANDIDATE_CUTOVER",
  ])
  check(r.status === 3, "execute with correct confirm token still exits 3 (stubbed)", r.stderr)
  check(/execute mode not enabled/.test(r.stderr), "execute stub message printed")
}

// 13. Governance: check-global-lock-policy must not flag this script as an
//     undeclared live-mutating script (it correctly declares LIVE_MUTATING=false).
{
  const r = spawnSync("node", [path.join(root, "scripts/release/check-global-lock-policy.cjs"), "ops/release"], {
    cwd: root,
    encoding: "utf8",
  })
  check(r.status === 0, "check-global-lock-policy passes for ops/release", r.stderr || r.stdout)
}

// 14. Does not weaken the public_demo pair cutover's own scope guard.
{
  const pairText = fs.readFileSync(path.join(root, "ops/release/cutover-public-demo-pair.sh"), "utf8")
  check(
    /pair cutover only supports --environment public_demo/.test(pairText),
    "cutover-public-demo-pair.sh public_demo-only guard is unmodified"
  )
}

// 15. Dry-run lock probe must not truncate (append-open only).
{
  const text = fs.readFileSync(helper, "utf8")
  check(/exec 219>>"\$lock_path"/.test(text), "dry-run lock probe uses append-open (>>), not truncate")
  check(!/exec 219>"\$lock_path"/.test(text), "dry-run lock probe does not truncate-open (>) the lock file")
}

process.exit(failed ? 1 : 0)
