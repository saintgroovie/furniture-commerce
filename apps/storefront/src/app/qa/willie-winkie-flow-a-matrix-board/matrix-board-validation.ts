import { TODO_OPERATOR, type MatrixReadiness, type MatrixRow, type RowValidation } from "./matrix-board-types"
import {
  isBlankTierValue,
  isConfigurableRow,
  parsePositivePrice,
  TIER_FIELD_KEYS,
} from "./matrix-tier-policy"

const BASE_MANDATORY = [
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

export function mandatoryFieldsForRow(row: MatrixRow): string[] {
  const fields: string[] = [...BASE_MANDATORY]
  if (isConfigurableRow(row)) {
    fields.push(...TIER_FIELD_KEYS)
  }
  return fields
}

function validateConfigurableTiersForApprove(row: MatrixRow, errors: string[]): void {
  if (row.variant_strategy !== "configurable_tiers") {
    errors.push("CONFIGURABLE approve requires variant_strategy=configurable_tiers")
  }
  const full = parsePositivePrice(row.solid_full_price_rub)
  const ldsp = parsePositivePrice(row.solid_front_ldsp_body_price_rub)
  if (full == null) {
    errors.push("solid_full_price_rub must be a positive number for approve")
  }
  if (ldsp == null) {
    errors.push("solid_front_ldsp_body_price_rub must be a positive number for approve")
  }
  if (full != null && ldsp != null && full <= ldsp) {
    errors.push("solid_full_price_rub must be greater than solid_front_ldsp_body_price_rub")
  }
}

export function validateRow(row: MatrixRow): RowValidation {
  const missing: string[] = []
  const errors: string[] = []
  const warnings: string[] = []

  for (const f of mandatoryFieldsForRow(row)) {
    if (isBlank(row[f as keyof MatrixRow] as string)) missing.push(f)
  }

  const decision = row.operator_decision
  const isApprove = decision === "approve"
  const isReject = decision === "reject"

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
    const refPrice = Number(row.price_rub)
    if (!Number.isFinite(refPrice) || refPrice <= 0) {
      errors.push("price_rub reference must be a positive number for approve")
    }
    if (row.currency && !/^rub$/i.test(row.currency)) {
      errors.push("currency must be rub")
    }
    if (isConfigurableRow(row)) {
      validateConfigurableTiersForApprove(row, errors)
    }
  }

  if (isReject && isBlank(row.operator_notes)) {
    warnings.push("reject should include operator_notes")
  }

  const blockingPriceErrors = errors.some(
    (e) =>
      e.includes("price_rub") ||
      e.includes("solid_full_price_rub") ||
      e.includes("solid_front_ldsp_body_price_rub")
  )

  const is_complete_for_approve = missing.length === 0 && !blockingPriceErrors
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
  let mandatoryTotal = 0
  for (const row of rows) {
    const fields = mandatoryFieldsForRow(row)
    mandatoryTotal += fields.length
    for (const f of fields) {
      if (!isBlank(row[f as keyof MatrixRow] as string)) mandatoryFilled++
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

export const MANDATORY_FIELDS = BASE_MANDATORY
