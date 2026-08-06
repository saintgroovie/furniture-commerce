/**
 * CJS mirror of apps/storefront/src/lib/payment-readiness.ts
 * Keep behaviour identical - fidelity test compares matrices.
 */
"use strict"

const PUBLIC_READY_PAYMENT_MODE = "manual_invoice"
const PUBLIC_READY_PAYMENT_DECISION = "accepted_manual"

function normalizePaymentDecisionRaw(raw) {
  return String(raw ?? "").trim().toLowerCase()
}

function parsePaymentDecisionStatus(raw) {
  const normalized = normalizePaymentDecisionRaw(raw)
  if (!normalized) return { kind: "missing", normalized: "" }
  if (normalized === "pending") return { kind: "pending", normalized }
  if (normalized === "accepted_manual") return { kind: "accepted_manual", normalized }
  if (normalized === "rejected" || normalized === "disabled") {
    return { kind: "rejected", normalized }
  }
  return { kind: "unknown", normalized }
}

function resolvePaymentDecisionSignals(signals) {
  const present = []
  const sources = []

  for (const signal of signals) {
    sources.push(signal.source)
    const parsed = parsePaymentDecisionStatus(signal.value)
    if (parsed.kind === "missing") continue
    present.push({
      source: signal.source,
      normalized: parsed.normalized,
      kind: parsed.kind,
    })
  }

  if (present.length === 0) {
    return {
      ok: false,
      kind: "missing",
      conflict: false,
      sources,
      detail: "payment decision missing from all sources",
      normalizedValues: [],
    }
  }

  const unique = [...new Set(present.map((p) => p.normalized))]
  if (unique.length > 1) {
    const detail = present
      .map((p) => `${p.source}=${p.normalized || "<empty>"}`)
      .join("; ")
    return {
      ok: false,
      kind: "unknown",
      conflict: true,
      sources,
      detail: `conflicting payment decision signals: ${detail}`,
      normalizedValues: unique,
    }
  }

  const kind = present[0].kind
  return {
    ok: kind === "accepted_manual",
    kind,
    conflict: false,
    sources,
    detail:
      kind === "accepted_manual"
        ? "owner attested accepted_manual"
        : `payment decision is ${kind} (${present[0].normalized})`,
    normalizedValues: unique,
  }
}

function resolveDecisionFromInput(input) {
  if (input.paymentDecisionSignals && input.paymentDecisionSignals.length > 0) {
    return resolvePaymentDecisionSignals(input.paymentDecisionSignals)
  }
  const parsed = parsePaymentDecisionStatus(input.paymentDecisionStatus)
  return {
    ok: parsed.kind === "accepted_manual",
    kind: parsed.kind,
    conflict: false,
    sources: ["paymentDecisionStatus"],
    detail:
      parsed.kind === "missing"
        ? "payment decision missing"
        : `payment decision is ${parsed.kind}${
            parsed.normalized ? ` (${parsed.normalized})` : ""
          }`,
    normalizedValues: parsed.normalized ? [parsed.normalized] : [],
  }
}

function evaluatePublicPaymentReady(input) {
  const modeRaw = String(input.paymentMode ?? "").trim().toLowerCase()
  const paymentModeOk = modeRaw === PUBLIC_READY_PAYMENT_MODE
  const decision = resolveDecisionFromInput(input)

  if (decision.conflict) {
    return {
      ready: false,
      reason: decision.detail,
      decisionKind: decision.kind,
      paymentModeOk,
      conflict: true,
    }
  }

  if (!paymentModeOk) {
    const reason = !modeRaw
      ? "payment mode missing"
      : `payment mode "${modeRaw}" is not public-ready (only manual_invoice + accepted_manual qualifies; no online PSP)`
    return {
      ready: false,
      reason,
      decisionKind: decision.kind,
      paymentModeOk: false,
      conflict: false,
    }
  }

  if (decision.kind !== "accepted_manual") {
    return {
      ready: false,
      reason: decision.detail,
      decisionKind: decision.kind,
      paymentModeOk: true,
      conflict: false,
    }
  }

  return {
    ready: true,
    reason: "manual_invoice + accepted_manual",
    decisionKind: "accepted_manual",
    paymentModeOk: true,
    conflict: false,
  }
}

function isPublicPaymentReady(input) {
  return evaluatePublicPaymentReady(input).ready
}

module.exports = {
  PUBLIC_READY_PAYMENT_MODE,
  PUBLIC_READY_PAYMENT_DECISION,
  normalizePaymentDecisionRaw,
  parsePaymentDecisionStatus,
  resolvePaymentDecisionSignals,
  evaluatePublicPaymentReady,
  isPublicPaymentReady,
}
