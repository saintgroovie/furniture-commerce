#!/usr/bin/env node
/**
 * Fail-closed validator for public_production payment + notification launch decisions.
 * Does not approve decisions, send messages, charge cards, or mutate runtime.
 *
 * Usage:
 *   node scripts/release/validate-payment-notification-decisions.cjs --repo-root .
 *   node scripts/release/validate-payment-notification-decisions.cjs \
 *     --payment-fixture path.json --notification-fixture path.json --expect-status pending
 *
 * Exit:
 *   0 + STATUS …_CONTRACTS_READY_OWNER_DECISIONS_PENDING  (repo pending fixtures)
 *   0 + STATUS …_DECISIONS_APPROVED_FIXTURE_PASS           (test-only approved fixtures)
 *   2 + STATUS …_DECISIONS_INVALID
 */
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

function parseArgs(argv) {
  const out = {
    "repo-root": process.cwd(),
    "expect-status": "pending",
    "payment-fixture": null,
    "notification-fixture": null,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--repo-root") out["repo-root"] = argv[++i]
    else if (a === "--expect-status") out["expect-status"] = argv[++i]
    else if (a === "--payment-fixture") out["payment-fixture"] = argv[++i]
    else if (a === "--notification-fixture") out["notification-fixture"] = argv[++i]
  }
  return out
}

function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex")
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"))
}

function fail(errors, msg) {
  errors.push(msg)
}

function assertNoSecrets(obj, errors, label) {
  const blob = JSON.stringify(obj)
  if (/(password|secret|api[_-]?key|bearer\s|smtp_pass|database_url)/i.test(blob)) {
    fail(errors, `${label}: forbidden secret-like content`)
  }
}

function validatePayment(obj, errors, expectStatus) {
  if (!obj || typeof obj !== "object") {
    fail(errors, "payment: not an object")
    return
  }
  if (obj.schema !== "woodright_payment_launch_decision_v1") {
    fail(errors, "payment: bad schema")
  }
  if (obj.environment !== "public_production") {
    fail(errors, `payment: wrong environment=${obj.environment}`)
  }
  if (!["pending", "approved"].includes(obj.decision_status)) {
    fail(errors, `payment: bad decision_status=${obj.decision_status}`)
  }
  if (expectStatus && obj.decision_status !== expectStatus) {
    fail(errors, `payment: expect decision_status=${expectStatus} got=${obj.decision_status}`)
  }
  const types = ["manual_invoice", "online_payment_required"]
  if (!types.includes(obj.decision_type)) {
    fail(errors, `payment: bad decision_type=${obj.decision_type}`)
  }
  if (!obj.issued_at_utc) fail(errors, "payment: missing issued_at_utc")
  if (obj.decision_status === "pending") {
    if (obj.authorization_id) fail(errors, "payment: pending must not have authorization_id")
    assertNoSecrets(obj, errors, "payment")
    return
  }
  // approved
  if (!obj.authorization_id || typeof obj.authorization_id !== "string") {
    fail(errors, "payment: approved requires authorization_id")
  }
  if (!obj.owner || String(obj.owner).trim().length < 2) {
    fail(errors, "payment: approved requires non-empty owner")
  }
  if (!obj.evidence_reference || String(obj.evidence_reference).trim().length < 8) {
    fail(errors, "payment: approved requires evidence_reference")
  }
  if (!obj.approval_record_id || String(obj.approval_record_id).trim().length < 8) {
    fail(errors, "payment: approved requires approval_record_id")
  }
  const allowedAuth = [
    "MANUAL_INVOICE_ACCEPTED_FOR_LAUNCH",
    "ONLINE_PAYMENT_REQUIRED_BEFORE_LAUNCH",
  ]
  if (!allowedAuth.includes(obj.authorization_id)) {
    fail(errors, `payment: invalid authorization_id=${obj.authorization_id}`)
  }
  if (obj.decision_type === "manual_invoice") {
    if (obj.authorization_id !== "MANUAL_INVOICE_ACCEPTED_FOR_LAUNCH") {
      fail(errors, "payment: manual_invoice auth mismatch")
    }
    if (!obj.operational_sop_version) fail(errors, "payment: manual_invoice requires operational_sop_version")
    if (!obj.sales_sop_path) fail(errors, "payment: manual_invoice requires sales_sop_path")
  }
  if (obj.decision_type === "online_payment_required") {
    if (obj.authorization_id !== "ONLINE_PAYMENT_REQUIRED_BEFORE_LAUNCH") {
      fail(errors, "payment: online_payment auth mismatch")
    }
    if (obj.psp_readiness === true) {
      fail(errors, "payment: online_payment must not claim psp_readiness=true in this contract layer")
    }
  }
  if (obj.expires_at_utc) {
    const exp = Date.parse(obj.expires_at_utc)
    if (Number.isNaN(exp)) fail(errors, "payment: bad expires_at_utc")
    else if (exp < Date.now()) fail(errors, "payment: decision expired")
  }
  assertNoSecrets(obj, errors, "payment")
}

function validateNotification(obj, errors, expectStatus) {
  if (!obj || typeof obj !== "object") {
    fail(errors, "notification: not an object")
    return
  }
  if (obj.schema !== "woodright_notification_launch_decision_v1") {
    fail(errors, "notification: bad schema")
  }
  if (obj.environment !== "public_production") {
    fail(errors, `notification: wrong environment=${obj.environment}`)
  }
  if (!["pending", "approved"].includes(obj.decision_status)) {
    fail(errors, `notification: bad decision_status=${obj.decision_status}`)
  }
  if (expectStatus && obj.decision_status !== expectStatus) {
    fail(errors, `notification: expect decision_status=${expectStatus} got=${obj.decision_status}`)
  }
  const types = ["provider_required", "temporary_manual_monitoring"]
  if (!types.includes(obj.decision_type)) {
    fail(errors, `notification: bad decision_type=${obj.decision_type}`)
  }
  if (!obj.issued_at_utc) fail(errors, "notification: missing issued_at_utc")
  if (obj.decision_status === "pending") {
    if (obj.authorization_id) fail(errors, "notification: pending must not have authorization_id")
    assertNoSecrets(obj, errors, "notification")
    return
  }
  const allowedAuth = [
    "SMTP_OR_NOTIFICATION_PROVIDER_REQUIRED_BEFORE_LAUNCH",
    "TEMPORARY_MANUAL_ORDER_MONITORING_ACCEPTED_FOR_LAUNCH",
  ]
  if (!allowedAuth.includes(obj.authorization_id)) {
    fail(errors, `notification: invalid authorization_id=${obj.authorization_id}`)
  }
  if (!obj.owner || String(obj.owner).trim().length < 2) {
    fail(errors, "notification: approved requires non-empty owner")
  }
  if (!obj.evidence_reference || String(obj.evidence_reference).trim().length < 8) {
    fail(errors, "notification: approved requires evidence_reference")
  }
  if (!obj.approval_record_id || String(obj.approval_record_id).trim().length < 8) {
    fail(errors, "notification: approved requires approval_record_id")
  }
  if (obj.decision_type === "provider_required") {
    if (obj.authorization_id !== "SMTP_OR_NOTIFICATION_PROVIDER_REQUIRED_BEFORE_LAUNCH") {
      fail(errors, "notification: provider_required auth mismatch")
    }
    if (obj.provider_readiness === true) {
      fail(errors, "notification: must not claim provider_readiness=true without separate readiness cycle")
    }
  }
  if (obj.decision_type === "temporary_manual_monitoring") {
    if (obj.authorization_id !== "TEMPORARY_MANUAL_ORDER_MONITORING_ACCEPTED_FOR_LAUNCH") {
      fail(errors, "notification: workaround auth mismatch")
    }
    if (!obj.workaround_expires_at_utc) {
      fail(errors, "notification: temporary workaround requires workaround_expires_at_utc")
    } else {
      const exp = Date.parse(obj.workaround_expires_at_utc)
      if (Number.isNaN(exp)) fail(errors, "notification: bad workaround_expires_at_utc")
      else if (exp < Date.now()) fail(errors, "notification: workaround expired")
    }
    if (!obj.operational_sop_version) fail(errors, "notification: workaround requires operational_sop_version")
    if (!obj.sales_polling_sop_path) {
      fail(errors, "notification: workaround requires sales_polling_sop_path")
    }
    if (!obj.max_response_minutes || Number(obj.max_response_minutes) <= 0) {
      fail(errors, "notification: workaround requires max_response_minutes > 0")
    }
  }
  assertNoSecrets(obj, errors, "notification")
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const root = path.resolve(args["repo-root"])
  const errors = []
  const expectStatus = args["expect-status"]

  const defaultPayment = path.join(
    root,
    "ops/config/launch-decisions/public_production/PAYMENT_LAUNCH_DECISION.json"
  )
  const defaultNotification = path.join(
    root,
    "ops/config/launch-decisions/public_production/NOTIFICATION_LAUNCH_DECISION.json"
  )
  const paymentPath = args["payment-fixture"]
    ? path.resolve(args["payment-fixture"])
    : defaultPayment
  const notificationPath = args["notification-fixture"]
    ? path.resolve(args["notification-fixture"])
    : defaultNotification

  if (!fs.existsSync(paymentPath)) fail(errors, `missing payment decision: ${paymentPath}`)
  if (!fs.existsSync(notificationPath)) {
    fail(errors, `missing notification decision: ${notificationPath}`)
  }

  // Isolation: must not live under public_demo / production-candidate trees
  for (const p of [paymentPath, notificationPath]) {
    if (p.includes("public_demo") || p.includes("production-candidate")) {
      fail(errors, `decision path leaks foreign environment tree: ${p}`)
    }
  }

  let payment = null
  let notification = null
  if (fs.existsSync(paymentPath)) {
    try {
      payment = loadJson(paymentPath)
      validatePayment(payment, errors, expectStatus)
    } catch (e) {
      fail(errors, `payment parse: ${e.message}`)
    }
  }
  if (fs.existsSync(notificationPath)) {
    try {
      notification = loadJson(notificationPath)
      validateNotification(notification, errors, expectStatus)
    } catch (e) {
      fail(errors, `notification parse: ${e.message}`)
    }
  }

  // SOP files referenced by approved fixtures must exist and be filled (no blank template markers)
  function assertSopFilled(rel, label) {
    if (!rel) return
    const sop = path.join(root, rel)
    if (!fs.existsSync(sop)) {
      fail(errors, `${label} SOP missing: ${rel}`)
      return
    }
    const text = fs.readFileSync(sop, "utf8")
    if (text.includes("________________")) {
      fail(errors, `${label} SOP still contains unfilled blanks: ${rel}`)
    }
    if (/Status:\s*\*\*template/i.test(text)) {
      fail(errors, `${label} SOP is still marked template: ${rel}`)
    }
  }
  if (payment && payment.decision_status === "approved") {
    assertSopFilled(payment.sales_sop_path, "payment")
  }
  if (notification && notification.decision_status === "approved") {
    assertSopFilled(notification.sales_polling_sop_path, "notification")
  }

  const report = {
    tool: "validate-payment-notification-decisions.cjs",
    expect_status: expectStatus,
    payment_path: paymentPath,
    notification_path: notificationPath,
    payment_checksum: fs.existsSync(paymentPath) ? sha256File(paymentPath) : null,
    notification_checksum: fs.existsSync(notificationPath) ? sha256File(notificationPath) : null,
    launch_ready: false,
    errors,
  }
  console.log(JSON.stringify(report, null, 2))
  if (errors.length) {
    console.log("STATUS PUBLIC_PRODUCTION_DECISIONS_INVALID")
    process.exit(2)
  }
  if (expectStatus === "pending") {
    console.log("STATUS PUBLIC_PRODUCTION_PROFILE_VALID_CONTRACTS_READY_OWNER_DECISIONS_PENDING")
  } else {
    console.log("STATUS PUBLIC_PRODUCTION_DECISIONS_APPROVED_FIXTURE_PASS")
  }
  process.exit(0)
}

main()
