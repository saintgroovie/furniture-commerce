/**
 * Guard: public payment readiness (manual_invoice + accepted_manual).
 *
 *   yarn dlx tsx src/lib/payment-readiness.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  PUBLIC_READY_PAYMENT_DECISION,
  PUBLIC_READY_PAYMENT_MODE,
  evaluatePublicPaymentReady,
  isPublicPaymentReady,
  parsePaymentDecisionStatus,
  resolvePaymentDecisionSignals,
} from "./payment-readiness"

assert.equal(PUBLIC_READY_PAYMENT_MODE, "manual_invoice")
assert.equal(PUBLIC_READY_PAYMENT_DECISION, "accepted_manual")

// --- parser ---
assert.equal(parsePaymentDecisionStatus("accepted_manual").kind, "accepted_manual")
assert.equal(parsePaymentDecisionStatus("  ACCEPTED_MANUAL  ").kind, "accepted_manual")
assert.equal(parsePaymentDecisionStatus("pending").kind, "pending")
assert.equal(parsePaymentDecisionStatus("").kind, "missing")
assert.equal(parsePaymentDecisionStatus(null).kind, "missing")
assert.equal(parsePaymentDecisionStatus(undefined).kind, "missing")
assert.equal(parsePaymentDecisionStatus("accepted").kind, "unknown")
assert.equal(parsePaymentDecisionStatus("rejected").kind, "rejected")
assert.equal(parsePaymentDecisionStatus("disabled").kind, "rejected")
assert.equal(parsePaymentDecisionStatus("online_psp").kind, "unknown")

// --- ready matrix ---
const readyCases: Array<{
  mode: string | null | undefined
  decision: string | null | undefined
  ready: boolean
  label: string
}> = [
  { mode: "manual_invoice", decision: "accepted_manual", ready: true, label: "canonical ready" },
  {
    mode: " MANUAL_INVOICE ",
    decision: " Accepted_Manual ",
    ready: true,
    label: "trim/case",
  },
  { mode: "manual_invoice", decision: "pending", ready: false, label: "pending" },
  { mode: "manual_invoice", decision: "", ready: false, label: "empty decision" },
  { mode: "manual_invoice", decision: null, ready: false, label: "null decision" },
  { mode: "manual_invoice", decision: undefined, ready: false, label: "missing decision" },
  { mode: "manual_invoice", decision: "accepted", ready: false, label: "bare accepted" },
  { mode: "manual_invoice", decision: "rejected", ready: false, label: "rejected" },
  { mode: "manual_invoice", decision: "disabled", ready: false, label: "disabled" },
  { mode: "manual_invoice", decision: "bogus", ready: false, label: "unknown decision" },
  { mode: "online_provider", decision: "accepted_manual", ready: false, label: "unsupported mode" },
  { mode: "pp_system_default", decision: "accepted_manual", ready: false, label: "psp-like mode" },
  { mode: "", decision: "accepted_manual", ready: false, label: "empty mode" },
  { mode: null, decision: "accepted_manual", ready: false, label: "null mode" },
  { mode: undefined, decision: "accepted_manual", ready: false, label: "missing mode" },
]

for (const c of readyCases) {
  const result = evaluatePublicPaymentReady({
    paymentMode: c.mode,
    paymentDecisionStatus: c.decision,
  })
  assert.equal(
    result.ready,
    c.ready,
    `${c.label}: expected ready=${c.ready}, got ${result.ready} (${result.reason})`
  )
  assert.equal(isPublicPaymentReady({ paymentMode: c.mode, paymentDecisionStatus: c.decision }), c.ready)
}

// --- conflicts ---
{
  const conflict = resolvePaymentDecisionSignals([
    { value: "accepted_manual", source: "conf" },
    { value: "pending", source: "env" },
  ])
  assert.equal(conflict.conflict, true)
  assert.equal(conflict.ok, false)
  assert.match(conflict.detail, /conflicting/)
  assert.equal(
    isPublicPaymentReady({
      paymentMode: "manual_invoice",
      paymentDecisionSignals: [
        { value: "accepted_manual", source: "conf" },
        { value: "pending", source: "env" },
      ],
    }),
    false
  )
}

{
  const agree = resolvePaymentDecisionSignals([
    { value: "accepted_manual", source: "conf" },
    { value: "  ACCEPTED_MANUAL ", source: "env" },
    { value: "", source: "blank-ignored" },
  ])
  assert.equal(agree.conflict, false)
  assert.equal(agree.kind, "accepted_manual")
  assert.equal(
    isPublicPaymentReady({
      paymentMode: "manual_invoice",
      paymentDecisionSignals: [
        { value: "accepted_manual", source: "conf" },
        { value: "accepted_manual", source: "env" },
      ],
    }),
    true
  )
}

{
  const onlyBlank = resolvePaymentDecisionSignals([
    { value: "", source: "a" },
    { value: null, source: "b" },
  ])
  assert.equal(onlyBlank.kind, "missing")
  assert.equal(onlyBlank.conflict, false)
}

{
  // signals array overrides single status (even if single would be ready)
  assert.equal(
    isPublicPaymentReady({
      paymentMode: "manual_invoice",
      paymentDecisionStatus: "accepted_manual",
      paymentDecisionSignals: [
        { value: "accepted_manual", source: "a" },
        { value: "accepted", source: "b" },
      ],
    }),
    false
  )
}

console.log("payment-readiness.fidelity: ok")
