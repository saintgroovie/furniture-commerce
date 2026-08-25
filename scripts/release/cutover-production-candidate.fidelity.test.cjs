#!/usr/bin/env node
/**
 * Fidelity tests for ops/release/cutover-production-candidate.sh.
 *
 * The helper is live-mutating in execute mode, so this suite only covers the
 * CLI contract and the read-only dry-run packet: usage refusals, environment
 * scoping, the confirm-token gate, and dry-run JSON shape. Every case here
 * runs the real script against the checked-in
 * ops/config/runtime-environments/production.conf and never reaches a
 * mutation (no Docker daemon required - absent containers/images simply
 * report as "not present locally", which is still a valid dry-run).
 *
 * The execute state machine itself (locking, pin writes, recreate, health,
 * rollback, traps) is covered by the shell harness:
 *   scripts/ops/test-production-candidate-cutover-execute-fidelity.sh
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

const SHA = "a".repeat(40)
const HELPER_SHA = "b".repeat(40)
const CONFIRM = "I_UNDERSTAND_PRIVATE_PRODUCTION_CANDIDATE_CUTOVER"
const PRODUCTION_LOCK = "/srv/woodright/locks/production/live-cutover.lock"
const BE_REF = `ghcr.io/saintgroovie/woodright-backend@sha256:${"b".repeat(64)}`
const SF_REF = `ghcr.io/saintgroovie/woodright-storefront@sha256:${"c".repeat(64)}`

function run(args, extraEnv = {}) {
  return spawnSync("bash", [helper, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      // Harness: no live /srv markers. Allow env override as sole provenance
      // source so dry-run CLI contract tests do not require a real install.
      WOODRIGHT_HELPER_INSTALL_SHA: HELPER_SHA,
      WOODRIGHT_PROVENANCE_ALLOW_ENV_OVERRIDE: "1",
      ...extraEnv,
    },
  })
}

// 1. Static: header declares the execute path is live-mutating and needs the
//    global lock (check-global-lock-policy relies on both).
{
  const text = fs.readFileSync(helper, "utf8")
  check(/^# LIVE_MUTATING=true$/m.test(text), "header declares LIVE_MUTATING=true")
  check(/^# requires_global_lock=true$/m.test(text), "header declares requires_global_lock=true")
  check(
    !/execute mode not enabled/.test(text),
    "execute path is no longer a fail-closed stub"
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

    // Application SHA (OCI revision of the images) and helper install SHA (the
    // ops commit that installed this script) are separate fields; the helper
    // SHA must never be substituted for the release SHA.
    check(
      packet.application_source_sha === SHA,
      "packet.application_source_sha carries the requested application sha"
    )
    check(
      Object.prototype.hasOwnProperty.call(packet, "helper_install_sha"),
      "packet exposes helper_install_sha as its own field"
    )
    check(
      packet.helper_install_sha !== SHA,
      "packet.helper_install_sha is not the application sha",
      String(packet.helper_install_sha)
    )
    check(
      packet.planned_mutation.ownership_targets.release_sha_field === "application_source_sha",
      "planned ownership metadata records the application sha, not the helper sha"
    )

    // Planned-mutation disclosure: pin plan, recreate order, rollback refs,
    // health plan and the phase state machine.
    const plan = packet.planned_mutation
    check(
      plan.pin_plan.keys.WOODRIGHT_BACKEND_IMAGE === BE_REF &&
        plan.pin_plan.keys.WOODRIGHT_STOREFRONT_IMAGE === SF_REF,
      "pin plan targets both compose .env image keys"
    )
    check(
      JSON.stringify(plan.recreate.order) === JSON.stringify(["backend", "storefront"]),
      "recreate order is backend then storefront"
    )
    check(
      plan.recreate.flags.includes("--no-deps") &&
        JSON.stringify(plan.recreate.never_recreated) === JSON.stringify(["postgres", "redis"]),
      "recreate uses --no-deps and never touches postgres/redis"
    )
    check(
      typeof plan.rollback_refs.pin_backup === "string" && plan.rollback_refs.pin_backup.length > 0,
      "rollback refs name the pin backup"
    )

    // Keeper containers are gone: a renamed container keeps its Compose
    // project labels, so `compose up` destroys it and the "restore" becomes a
    // silent no-op. The disclosed plan must say so.
    check(
      plan.container_recreate_uses_keepers === false,
      "planned recreate declares container_recreate_uses_keepers=false"
    )
    check(
      !Object.prototype.hasOwnProperty.call(plan.rollback_refs, "keeper_names"),
      "rollback refs no longer advertise keeper names"
    )
    check(
      typeof plan.rollback_refs.method === "string" && /pins/.test(plan.rollback_refs.method),
      "rollback method is pin-anchored"
    )
    check(
      Array.isArray(plan.rollback_refs.postconditions) &&
        plan.rollback_refs.postconditions.includes("runtime_repo_digests_equal_restored_pins"),
      "rollback discloses the pins==runtime postcondition"
    )

    check(
      plan.health_plan.http.some((u) => u.startsWith("http://127.0.0.1:")),
      "health plan probes loopback only"
    )
    check(
      typeof plan.health_plan.deadline_sec.backend === "string" &&
        Number(plan.health_plan.deadline_sec.backend) > 0 &&
        Number(plan.health_plan.deadline_sec.storefront) > 0,
      "health plan discloses per-component readiness deadlines"
    )
    check(
      Array.isArray(plan.health_plan.transient_docker_states) &&
        plan.health_plan.transient_docker_states.some((s) => /starting/.test(s)),
      "health plan treats docker health 'starting' as transient"
    )
    check(
      Array.isArray(plan.health_plan.terminal_docker_states) &&
        plan.health_plan.terminal_docker_states.includes("exited"),
      "health plan lists terminal docker states"
    )

    check(
      plan.state_machine[0] === "prepared" &&
        plan.state_machine.includes("pins_written") &&
        plan.state_machine.includes("health_passed") &&
        plan.state_machine[plan.state_machine.length - 1].includes("rollback_incomplete"),
      "planned state machine is disclosed and includes rollback_incomplete"
    )
    check(
      plan.exit_codes["13"] !== undefined && /rollback_incomplete/.test(plan.exit_codes["13"]),
      "exit code 13 is documented as rollback_incomplete"
    )

    // Skew disclosure: with no live containers on the test host both sides are
    // unknown, so the helper must NOT claim a skew it cannot prove.
    check(packet.existing_pin_runtime_skew === false, "no skew claimed when the runtime cannot be read")
    check(packet.normal_execute_blocked === false, "execute not blocked when there is no proven skew")
    check(
      packet.pin_runtime_comparison.backend.verdict === "unknown" &&
        packet.pin_runtime_comparison.storefront.verdict === "unknown",
      "pin/runtime verdicts are 'unknown' rather than guessed"
    )
    check(
      packet.pin_runtime_comparison.blocking_token === "existing_pin_runtime_skew_requires_recovery",
      "packet names the blocking token used by the execute refusal"
    )
    check(
      /recover-production-candidate-skew\.sh/.test(packet.pin_runtime_comparison.recovery_helper),
      "packet points at the skew recovery helper"
    )
  }
}

// 9b. Header/usage document the new exit codes and the no-keeper rollback.
{
  const text = fs.readFileSync(helper, "utf8")
  check(/13 rollback_incomplete/.test(text), "header documents exit 13 rollback_incomplete")
  check(/NO KEEPER CONTAINERS/.test(text), "header states the rollback does not use keepers")
  check(
    /existing_pin_runtime_skew_requires_recovery/.test(text),
    "helper carries the skew refusal token"
  )
  const r = run(["--help"])
  check(r.status === 0, "--help exits 0", r.stderr)
  check(/13 rollback_incomplete/.test(r.stdout), "usage lists exit 13", r.stdout)
  check(/No keeper/i.test(r.stdout), "usage states keepers are not used", r.stdout)
}

// 9c. The skew recovery helper exists and is wired into the install set.
{
  const recovery = path.join(root, "ops/release/recover-production-candidate-skew.sh")
  check(fs.existsSync(recovery), "recover-production-candidate-skew.sh exists")
  const installer = fs.readFileSync(path.join(root, "ops/release/install-environment-governance.sh"), "utf8")
  check(
    /ops\/release\/recover-production-candidate-skew\.sh/.test(installer),
    "installer ships the skew recovery helper"
  )
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
    check(
      JSON.stringify(packet.planned_mutation.recreate.order) === JSON.stringify(["backend", "storefront"]),
      "backend-only still recreates both services for identity env refresh"
    )
    check(
      Array.isArray(packet.planned_mutation.recreate.env_refresh_only) &&
        packet.planned_mutation.recreate.env_refresh_only.includes("storefront"),
      "backend-only marks storefront as env_refresh_only"
    )
    check(
      packet.planned_mutation.pin_plan.keys.WOODRIGHT_BACKEND_SOURCE_SHA === SHA,
      "backend-only pin plan includes mutated backend source SHA"
    )
  }
}

// 11. execute mode without --confirm-mutation fails closed (usage error),
//     before any lock is taken or any pin is written.
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
  check(
    /confirm/i.test(r.stderr) && /I_UNDERSTAND_PRIVATE_PRODUCTION_CANDIDATE_CUTOVER/.test(r.stderr),
    "refusal names the required confirm token",
    r.stderr
  )
}

// 12. execute mode with a wrong confirm token fails closed the same way.
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
    "I_UNDERSTAND_PRIVATE_PRODUCTION_CANDIDATE_CUTOVERX",
  ])
  check(r.status === 2, "execute with a wrong confirm token exits 2", r.stderr)
}

// 12b. --dry-run and --execute together is ambiguous -> refused.
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
    "--dry-run",
    "--execute",
    "--confirm-mutation",
    CONFIRM,
  ])
  check(r.status === 2, "--dry-run together with --execute exits 2", r.stderr)
  check(
    /conflicting modes/i.test(r.stderr) && /--dry-run/.test(r.stderr) && /--execute/.test(r.stderr),
    "refusal explains the conflict",
    r.stderr
  )
}

// 12c. execute is still refused for non-production environments even with the
//      correct confirm token (scope guard beats the token).
{
  for (const env of ["public_demo", "staging"]) {
    const r = run([
      "--environment",
      env,
      "--component",
      "backend",
      "--source-sha",
      SHA,
      "--backend-ref",
      BE_REF,
      "--mode",
      "execute",
      "--confirm-mutation",
      CONFIRM,
    ])
    check(r.status !== 0, `execute refused for --environment ${env}`, r.stderr)
    check(!/lock acquired/i.test(r.stderr), `no lock taken for --environment ${env}`, r.stderr)
  }
}

// 13. Governance: check-global-lock-policy must accept this script - it now
//     declares LIVE_MUTATING=true together with requires_global_lock=true.
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

// 16. Only the canonical production lock may be used, and the execute path
//     must go through the shared flock helper (not an ad-hoc lock file).
{
  const text = fs.readFileSync(helper, "utf8")
  check(text.includes(PRODUCTION_LOCK), "helper names the canonical production lock path")
  check(/wr_staging_mutation_lock_acquire/.test(text), "execute path acquires the shared flock")
  check(
    !/reconcile-public-image-pins|recreate-staging-(backend|storefront)/.test(text),
    "helper does not call public_demo-only runtime helpers"
  )
}

process.exit(failed ? 1 : 0)
