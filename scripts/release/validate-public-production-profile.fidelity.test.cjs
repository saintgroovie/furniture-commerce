#!/usr/bin/env node
/**
 * Fidelity: public_production profile validator payment gate seam.
 * Does not mutate the canonical conf - uses --profile-path temp copies.
 */
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const root = path.resolve(__dirname, "../..")
const script = path.join(root, "scripts/release/validate-public-production-profile.cjs")
const canonical = path.join(
  root,
  "ops/config/runtime-environments/public_production.conf"
)

function run(profilePath) {
  const r = spawnSync(process.execPath, [script, "--repo-root", root, "--profile-path", profilePath], {
    encoding: "utf8",
  })
  const jsonLine = r.stdout
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("{"))
  // report is pretty-printed JSON - parse from first { to last }
  const start = r.stdout.indexOf("{")
  const end = r.stdout.lastIndexOf("}")
  assert.ok(start >= 0 && end > start, `no JSON report:\n${r.stdout}\n${r.stderr}`)
  const report = JSON.parse(r.stdout.slice(start, end + 1))
  return { report, status: r.status, stdout: r.stdout }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wr-pp-pay-"))
const pendingCopy = path.join(tmp, "pending.conf")
const acceptedCopy = path.join(tmp, "accepted_manual.conf")
fs.copyFileSync(canonical, pendingCopy)
fs.copyFileSync(canonical, acceptedCopy)
fs.writeFileSync(
  pendingCopy,
  fs
    .readFileSync(pendingCopy, "utf8")
    .replace(
      /^WOODRIGHT_PAYMENT_DECISION_STATUS=accepted_manual$/m,
      "WOODRIGHT_PAYMENT_DECISION_STATUS=pending"
    )
)

{
  const { report, status } = run(pendingCopy)
  assert.equal(status, 0)
  assert.equal(report.profile_valid, true)
  assert.equal(report.launch_ready, false)
  assert.equal(report.payment_contract_ready, false)
  assert.ok(report.pending_launch_gates.includes("PAYMENT_DECISION_STATUS=pending"))
  assert.ok(report.pending_launch_gates.includes("LEGAL_CONTENT_STATUS!=approved"))
  assert.ok(report.pending_launch_gates.includes("NOTIFICATION_DECISION_STATUS=pending"))
  assert.ok(report.pending_launch_gates.includes("owner_approval_manifest_public_production_missing"))
  assert.ok(report.pending_launch_gates.includes("application_images_not_qualified"))
}

{
  const { report, status } = run(acceptedCopy)
  assert.equal(status, 0)
  assert.equal(report.profile_valid, true)
  assert.equal(report.launch_ready, false, "payment alone must not set launch_ready")
  assert.equal(report.payment_contract_ready, true)
  assert.ok(!report.pending_launch_gates.includes("PAYMENT_DECISION_STATUS=pending"))
  assert.ok(report.pending_launch_gates.includes("LEGAL_CONTENT_STATUS!=approved"))
  assert.ok(report.pending_launch_gates.includes("NOTIFICATION_DECISION_STATUS=pending"))
  assert.ok(
    report.contract_files.some((c) => String(c).includes("payment_contract_ready:accepted_manual"))
  )
}

{
  // Missing payment mode must not default to ready
  const missingMode = path.join(tmp, "missing-mode.conf")
  fs.writeFileSync(
    missingMode,
    fs
      .readFileSync(acceptedCopy, "utf8")
      .split("\n")
      .filter((l) => !/^WOODRIGHT_PAYMENT_MODE=/.test(l))
      .join("\n")
  )
  const { report, status } = run(missingMode)
  assert.notEqual(status, 0)
  assert.equal(report.profile_valid, false)
  assert.equal(report.payment_contract_ready, false)
  assert.equal(report.launch_ready, false)
}

{
  // Wrong mode + accepted_manual must not be payment-ready
  const wrongMode = path.join(tmp, "wrong-mode.conf")
  fs.writeFileSync(
    wrongMode,
    fs
      .readFileSync(acceptedCopy, "utf8")
      .replace(/^WOODRIGHT_PAYMENT_MODE=manual_invoice$/m, "WOODRIGHT_PAYMENT_MODE=online_provider")
  )
  const { report, status } = run(wrongMode)
  assert.notEqual(status, 0)
  assert.equal(report.profile_valid, false)
  assert.equal(report.payment_contract_ready, false)
}

{
  // Canonical path (default) records OD-05 as accepted_manual; launch_ready stays false
  const r = spawnSync(process.execPath, [script, "--repo-root", root], { encoding: "utf8" })
  assert.equal(r.status, 0)
  const start = r.stdout.indexOf("{")
  const end = r.stdout.lastIndexOf("}")
  const report = JSON.parse(r.stdout.slice(start, end + 1))
  assert.equal(report.profile_valid, true)
  assert.equal(report.launch_ready, false)
  assert.equal(report.payment_contract_ready, true)
  const conf = fs.readFileSync(canonical, "utf8")
  assert.match(conf, /^WOODRIGHT_PAYMENT_DECISION_STATUS=accepted_manual$/m)
  assert.match(conf, /^WOODRIGHT_LEGAL_CONTENT_STATUS=draft$/m)
  assert.match(conf, /^WOODRIGHT_NOTIFICATION_DECISION_STATUS=pending$/m)
}

console.log("validate-public-production-profile payment gate fidelity: ok")
