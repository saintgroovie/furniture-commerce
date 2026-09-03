#!/usr/bin/env node
/**
 * Fidelity: public_production profile validator payment / legal / notification seams.
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
  const start = r.stdout.indexOf("{")
  const end = r.stdout.lastIndexOf("}")
  assert.ok(start >= 0 && end > start, `no JSON report:\n${r.stdout}\n${r.stderr}`)
  const report = JSON.parse(r.stdout.slice(start, end + 1))
  return { report, status: r.status, stdout: r.stdout }
}

function writePatched(dir, name, mutate) {
  const dest = path.join(dir, name)
  fs.writeFileSync(dest, mutate(fs.readFileSync(canonical, "utf8")))
  return dest
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wr-pp-pay-"))
const pendingPay = writePatched(tmp, "pending-pay.conf", (t) =>
  t.replace(
    /^WOODRIGHT_PAYMENT_DECISION_STATUS=accepted_manual$/m,
    "WOODRIGHT_PAYMENT_DECISION_STATUS=pending"
  )
)
const draftLegal = writePatched(tmp, "draft-legal.conf", (t) =>
  t
    .replace(/^WOODRIGHT_LEGAL_CONTENT_STATUS=approved$/m, "WOODRIGHT_LEGAL_CONTENT_STATUS=draft")
    .replace(/^WOODRIGHT_LEGAL_PACK_TOKEN=OWNER_LEGAL_CONTENT_APPROVED\n/m, "")
)
const pendingNotify = writePatched(tmp, "pending-notify.conf", (t) =>
  t
    .replace(/^WOODRIGHT_NOTIFICATION_MODE=admin_polling$/m, "WOODRIGHT_NOTIFICATION_MODE=unset")
    .replace(
      /^WOODRIGHT_NOTIFICATION_DECISION_STATUS=accepted$/m,
      "WOODRIGHT_NOTIFICATION_DECISION_STATUS=pending"
    )
)

{
  const { report, status } = run(pendingPay)
  assert.equal(status, 0)
  assert.equal(report.profile_valid, true)
  assert.equal(report.launch_ready, false)
  assert.equal(report.payment_contract_ready, false)
  assert.equal(report.legal_pack_ready, true)
  assert.equal(report.notification_contract_ready, true)
  assert.ok(report.pending_launch_gates.includes("PAYMENT_DECISION_STATUS=pending"))
  assert.ok(!report.pending_launch_gates.includes("LEGAL_CONTENT_STATUS!=approved"))
  assert.ok(!report.pending_launch_gates.includes("NOTIFICATION_DECISION_STATUS=pending"))
  assert.ok(report.pending_launch_gates.includes("owner_approval_manifest_public_production_missing"))
  assert.ok(report.pending_launch_gates.includes("application_images_not_qualified"))
}

{
  const { report, status } = run(canonical)
  assert.equal(status, 0)
  assert.equal(report.profile_valid, true)
  assert.equal(report.launch_ready, false, "recorded gates must not set launch_ready")
  assert.equal(report.payment_contract_ready, true)
  assert.equal(report.legal_pack_ready, true)
  assert.equal(report.notification_contract_ready, true)
  assert.ok(!report.pending_launch_gates.includes("PAYMENT_DECISION_STATUS=pending"))
  assert.ok(!report.pending_launch_gates.includes("LEGAL_CONTENT_STATUS!=approved"))
  assert.ok(!report.pending_launch_gates.includes("NOTIFICATION_DECISION_STATUS=pending"))
  assert.ok(
    report.contract_files.some((c) => String(c).includes("payment_contract_ready:accepted_manual"))
  )
  assert.ok(
    report.contract_files.some((c) => String(c).includes("legal_pack_ready:OWNER_LEGAL_CONTENT_APPROVED"))
  )
  assert.ok(
    report.contract_files.some((c) => String(c).includes("notification_contract_ready:admin_polling"))
  )
}

{
  const { report, status } = run(draftLegal)
  assert.equal(status, 0)
  assert.equal(report.profile_valid, true)
  assert.equal(report.legal_pack_ready, false)
  assert.ok(report.pending_launch_gates.includes("LEGAL_CONTENT_STATUS!=approved"))
  assert.ok(!report.pending_launch_gates.includes("NOTIFICATION_DECISION_STATUS=pending"))
}

{
  const { report, status } = run(pendingNotify)
  assert.equal(status, 0)
  assert.equal(report.profile_valid, true)
  assert.equal(report.notification_contract_ready, false)
  assert.ok(report.pending_launch_gates.includes("NOTIFICATION_DECISION_STATUS=pending"))
  assert.ok(!report.pending_launch_gates.includes("LEGAL_CONTENT_STATUS!=approved"))
}

{
  // Missing payment mode must not default to ready
  const missingMode = writePatched(tmp, "missing-mode.conf", (t) =>
    t
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
  const wrongMode = writePatched(tmp, "wrong-mode.conf", (t) =>
    t.replace(/^WOODRIGHT_PAYMENT_MODE=manual_invoice$/m, "WOODRIGHT_PAYMENT_MODE=online_provider")
  )
  const { report, status } = run(wrongMode)
  assert.notEqual(status, 0)
  assert.equal(report.profile_valid, false)
  assert.equal(report.payment_contract_ready, false)
}

{
  const approvedNoToken = writePatched(tmp, "approved-no-token.conf", (t) =>
    t.replace(/^WOODRIGHT_LEGAL_PACK_TOKEN=OWNER_LEGAL_CONTENT_APPROVED\n/m, "")
  )
  const { report, status } = run(approvedNoToken)
  assert.notEqual(status, 0)
  assert.equal(report.profile_valid, false)
  assert.equal(report.legal_pack_ready, false)
}

{
  const acceptedWrongMode = writePatched(tmp, "notify-wrong-mode.conf", (t) =>
    t.replace(/^WOODRIGHT_NOTIFICATION_MODE=admin_polling$/m, "WOODRIGHT_NOTIFICATION_MODE=unset")
  )
  const { report, status } = run(acceptedWrongMode)
  assert.notEqual(status, 0)
  assert.equal(report.profile_valid, false)
  assert.equal(report.notification_contract_ready, false)
}

{
  // Canonical path (default) records owner legal + notification + OD-05; launch_ready stays false
  const r = spawnSync(process.execPath, [script, "--repo-root", root], { encoding: "utf8" })
  assert.equal(r.status, 0)
  const start = r.stdout.indexOf("{")
  const end = r.stdout.lastIndexOf("}")
  const report = JSON.parse(r.stdout.slice(start, end + 1))
  assert.equal(report.profile_valid, true)
  assert.equal(report.launch_ready, false)
  assert.equal(report.payment_contract_ready, true)
  assert.equal(report.legal_pack_ready, true)
  assert.equal(report.notification_contract_ready, true)
  const conf = fs.readFileSync(canonical, "utf8")
  assert.match(conf, /^WOODRIGHT_PAYMENT_DECISION_STATUS=accepted_manual$/m)
  assert.match(conf, /^WOODRIGHT_LEGAL_CONTENT_STATUS=approved$/m)
  assert.match(conf, /^WOODRIGHT_LEGAL_PACK_TOKEN=OWNER_LEGAL_CONTENT_APPROVED$/m)
  assert.match(conf, /^WOODRIGHT_NOTIFICATION_MODE=admin_polling$/m)
  assert.match(conf, /^WOODRIGHT_NOTIFICATION_DECISION_STATUS=accepted$/m)
}

console.log("validate-public-production-profile payment/legal/notification gate fidelity: ok")
