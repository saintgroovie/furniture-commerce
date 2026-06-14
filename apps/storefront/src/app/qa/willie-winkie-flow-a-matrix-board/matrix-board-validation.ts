import { TODO_OPERATOR, type MatrixReadiness, type MatrixRow, type RowValidation } from "./matrix-board-types"

const MANDATORY = [
  "workbook_row_key",
  "workbook_product_code",
  "painting_name",
  "medusa_product_type",
  "variant_strategy",
  "price_rub",
  "status_draft_or_published",
  "operator_decision",
] as const

const PRODUCT_TYPES = new Set(["STANDARD", "CONFIGURABLE", "BESPOKE"])
const STATUSES = new Set(["draft", "published"])
const DECISIONS = new Set(["approve", "reject", "hold"])
const VARIANTS = new Set(["single_default", "configurable_tiers"])

function isBlank(v: string | undefined): boolean {
  return !v || v.trim() === "" || v === TODO_OPERATOR
}

export function validateRow(row: MatrixRow): RowValidation {
  const missing: string[] = []
  const errors: string[] = []
  const warnings: string[] = []

  for (const f of MANDATORY) {
    if (isBlank(row[f])) missing.push(f)
  }

  const decision = row.operator_decision
  const isApprove = decision === "approve"
  const isReject = decision === "reject"
  const isHold = decision === "hold"

  if (!isBlank(decision) && !DECISIONS.has(decision)) {
    errors.push(`operator_decision must be approve|reject|hold`)
  }

  if (isApprove) {
    if (missing.length > 0) {
      errors.push(`approve requires all mandatory fields: ${missing.join(", ")}`)
    }
    if (!isBlank(row.medusa_product_type) && !PRODUCT_TYPES.has(row.medusa_product_type)) {
      errors.push("invalid medusa_product_type")
    }
    if (!isBlank(row.status_draft_or_published) && !STATUSES.has(row.status_draft_or_published)) {
      errors.push("invalid status_draft_or_published")
    }
    if (!isBlank(row.variant_strategy) && !VARIANTS.has(row.variant_strategy)) {
      errors.push("invalid variant_strategy")
    }
    const price = Number(row.price_rub)
    if (!Number.isFinite(price) || price <= 0) {
      errors.push("price_rub must be a positive number for approve")
    }
    if (row.currency && !/^rub$/i.test(row.currency)) {
      errors.push("currency must be rub")
    }
  }

  if (isReject && isBlank(row.operator_notes)) {
    warnings.push("reject should include operator_notes")
  }

  if (isHold && missing.length > 0) {
    /* hold allows missing */
  }

  const is_complete_for_approve = missing.length === 0 && !errors.some((e) => e.includes("price_rub"))
  const is_valid_approve = isApprove && is_complete_for_approve && errors.length === 0

  return {
    handle: row.handle,
    is_complete_for_approve,
    is_valid_approve,
    missing_fields: missing,
    errors,
    warnings,
  }
}

export function computeReadiness(rows: MatrixRow[]): MatrixReadiness {
  const validations = rows.map(validateRow)
  const approve = rows.filter((r) => r.operator_decision === "approve")
  const reject = rows.filter((r) => r.operator_decision === "reject")
  const hold = rows.filter((r) => r.operator_decision === "hold")
  const pending = rows.filter((r) => isBlank(r.operator_decision))

  const rows_ready = validations.filter((v) => v.is_complete_for_approve).length
  const rows_blocked = validations.filter((v) => !v.is_complete_for_approve).length

  let mandatoryFilled = 0
  const mandatoryTotal = rows.length * MANDATORY.length
  for (const row of rows) {
    for (const f of MANDATORY) {
      if (!isBlank(row[f])) mandatoryFilled++
    }
  }

  const allApproveValid =
    approve.length > 0 && approve.every((r) => validateRow(r).is_valid_approve)

  return {
    generated_at: new Date().toISOString(),
    readiness: allApproveValid,
    seed_draft_allowed_later: allApproveValid,
    total_rows: rows.length,
    approve_count: approve.length,
    reject_count: reject.length,
    hold_count: hold.length,
    pending_decision_count: pending.length,
    rows_ready_for_approve: rows_ready,
    rows_blocked: rows_blocked,
    mandatory_filled_cells: mandatoryFilled,
    mandatory_total_cells: mandatoryTotal,
    row_validations: validations,
    reason: allApproveValid
      ? "All approve rows valid; seed draft may be generated in a separate task"
      : "Mandatory fields incomplete or approve rows invalid; seed draft not allowed",
  }
}

export const MANDATORY_FIELDS = MANDATORY
