/**
 * Guard: Woodright payment-mode contract (only manual_invoice exists;
 * pp_system_default is never a PSP; public-ready needs accepted_manual).
 *
 *   yarn dlx tsx src/lib/payment-mode.fidelity.test.ts
 */
import assert from "node:assert/strict"
import {
  SUPPORTED_PAYMENT_MODES,
  isPublicPaymentReady,
  isSupportedPaymentMode,
  resolvePaymentMode,
} from "./payment-mode"

assert.deepEqual(SUPPORTED_PAYMENT_MODES, ["manual_invoice"])
assert.equal(isSupportedPaymentMode("manual_invoice"), true)
assert.equal(isSupportedPaymentMode("online_provider"), false)
assert.equal(isSupportedPaymentMode("pp_system_default"), false)

// --- resolvePaymentMode: explicit value ---
assert.equal(resolvePaymentMode("manual_invoice"), "manual_invoice")
assert.equal(resolvePaymentMode("MANUAL_INVOICE"), "manual_invoice")

// --- resolvePaymentMode: pp_system_default must never be accepted as a PSP mode ---
assert.throws(() => resolvePaymentMode("pp_system_default"), /checkout plumbing, not a PSP/)
assert.throws(() => resolvePaymentMode("online_provider"), /no online PSP integration exists yet/)
assert.throws(() => resolvePaymentMode("bogus"), /Unknown WOODRIGHT_PAYMENT_MODE/)

// --- resolvePaymentMode: fail-closed only for production-like role + production NODE_ENV ---
assert.equal(
  resolvePaymentMode(undefined, { nodeEnv: "development", runtimeRole: undefined }),
  "manual_invoice"
)
assert.equal(
  resolvePaymentMode(undefined, { nodeEnv: "production", runtimeRole: undefined }),
  "manual_invoice"
)
assert.throws(
  () => resolvePaymentMode(undefined, { nodeEnv: "production", runtimeRole: "production_candidate" }),
  /WOODRIGHT_PAYMENT_MODE is required/
)
assert.throws(
  () => resolvePaymentMode(undefined, { nodeEnv: "production", runtimeRole: "production" }),
  /WOODRIGHT_PAYMENT_MODE is required/
)

// --- isPublicPaymentReady: mode alone never unlocks ---
assert.equal(
  isPublicPaymentReady({ paymentMode: "manual_invoice" }),
  false,
  "missing decision must not be public-ready"
)
assert.equal(
  isPublicPaymentReady({ paymentMode: "manual_invoice", paymentDecisionStatus: "pending" }),
  false
)
assert.equal(
  isPublicPaymentReady({
    paymentMode: "manual_invoice",
    paymentDecisionStatus: "accepted_manual",
  }),
  true
)
assert.equal(
  isPublicPaymentReady({
    paymentMode: "manual_invoice",
    paymentDecisionStatus: "accepted",
  }),
  false,
  "bare accepted must not unlock"
)

console.log("payment-mode.fidelity: ok")
