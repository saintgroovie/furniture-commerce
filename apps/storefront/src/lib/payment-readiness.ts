/**
 * Woodright public payment readiness (fail-closed).
 *
 * Distinct from `payment-mode.ts` (resolve WOODRIGHT_PAYMENT_MODE) and from
 * backend `WOODRIGHT_PAYMENT_LAUNCH_MODE`. This module only answers:
 * "has the owner attested a public-ready manual_invoice story?"
 *
 * Canonical public-ready pair:
 *   paymentMode === "manual_invoice"
 *   + paymentDecisionStatus === "accepted_manual"
 *
 * Bare `accepted` is intentionally unknown/not-ready (legacy health-check
 * vocabulary was too broad for PSP vs manual attestation).
 *
 * No process.env reads here - callers pass explicit inputs.
 * Keep in sync with `scripts/release/lib/payment-readiness.cjs`.
 */

export type PaymentDecisionKind =
  | "pending"
  | "accepted_manual"
  | "rejected"
  | "missing"
  | "unknown"

export type PaymentDecisionParse = {
  kind: PaymentDecisionKind
  normalized: string
}

export type PaymentDecisionSignal = {
  value: string | null | undefined
  source: string
}

export type PaymentDecisionConsensus = {
  ok: boolean
  kind: PaymentDecisionKind
  conflict: boolean
  sources: string[]
  detail: string
  normalizedValues: string[]
}

export type PublicPaymentReadyInput = {
  paymentMode: string | null | undefined
  /** Single decision status when only one authoritative source exists */
  paymentDecisionStatus?: string | null | undefined
  /**
   * Multiple authoritative signals. When provided (non-empty array), consensus
   * is required and `paymentDecisionStatus` is ignored.
   */
  paymentDecisionSignals?: PaymentDecisionSignal[]
}

export type PublicPaymentReadyResult = {
  ready: boolean
  reason: string
  decisionKind: PaymentDecisionKind
  paymentModeOk: boolean
  conflict: boolean
}

export const PUBLIC_READY_PAYMENT_MODE = "manual_invoice" as const
export const PUBLIC_READY_PAYMENT_DECISION = "accepted_manual" as const

export function normalizePaymentDecisionRaw(
  raw: string | null | undefined
): string {
  return String(raw ?? "").trim().toLowerCase()
}

export function parsePaymentDecisionStatus(
  raw: string | null | undefined
): PaymentDecisionParse {
  const normalized = normalizePaymentDecisionRaw(raw)
  if (!normalized) {
    return { kind: "missing", normalized: "" }
  }
  if (normalized === "pending") {
    return { kind: "pending", normalized }
  }
  if (normalized === "accepted_manual") {
    return { kind: "accepted_manual", normalized }
  }
  if (normalized === "rejected" || normalized === "disabled") {
    return { kind: "rejected", normalized }
  }
  // bare "accepted", typos, PSP tokens, etc. → unknown (not ready)
  return { kind: "unknown", normalized }
}

/**
 * Resolve one or more decision signals fail-closed.
 *
 * - Blank/missing signals are ignored for disagreement (not treated as values).
 * - Readiness still requires at least one present `accepted_manual`.
 * - Duplicate equivalent values agree.
 * - Any disagreement among present normalized values → conflict → unknown.
 */
export function resolvePaymentDecisionSignals(
  signals: PaymentDecisionSignal[]
): PaymentDecisionConsensus {
  const present: { source: string; normalized: string; kind: PaymentDecisionKind }[] =
    []
  const sources: string[] = []

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

function resolveDecisionFromInput(
  input: PublicPaymentReadyInput
): PaymentDecisionConsensus {
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

/**
 * Public payment gate. True only for exact manual_invoice + accepted_manual
 * with no conflicting decision signals and no unsupported mode.
 */
export function evaluatePublicPaymentReady(
  input: PublicPaymentReadyInput
): PublicPaymentReadyResult {
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

export function isPublicPaymentReady(input: PublicPaymentReadyInput): boolean {
  return evaluatePublicPaymentReady(input).ready
}
