import {
  TODO_OPERATOR,
  type GateRow,
  type GateSummary,
  type RowValidation,
} from "./business-gate-board-types"

const PRODUCT_TYPES = new Set(["STANDARD", "CONFIGURABLE", "BESPOKE"])
const VARIANTS = new Set(["single_default", "configurable_tiers"])
const PUBLISH = new Set(["draft", "published", "exclude"])
const DECISIONS = new Set(["approve_for_seed", "needs_more_info", "exclude_from_pilot"])

function isBlank(v: string | undefined): boolean {
  return !v || v.trim() === "" || v === TODO_OPERATOR
}

export function validateRow(row: GateRow): RowValidation {
  const missing: string[] = []
  const errors: string[] = []
  const warnings: string[] = []

  const decision = row.operator_decision

  if (decision === "approve_for_seed") {
    for (const f of [
      "workbook_row_key",
      "workbook_product_code_ww",
      "price",
      "currency",
      "product_type",
      "variant_strategy",
      "publish_policy",
      "operator_decision",
    ] as const) {
      if (isBlank(row[f])) missing.push(f)
    }
    const price = Number(String(row.price).replace(/\s/g, ""))
    if (!Number.isFinite(price) || price <= 0) {
      errors.push("price must be a positive number")
      missing.push("price")
    }
    if (!isBlank(row.product_type) && !PRODUCT_TYPES.has(row.product_type)) {
      errors.push("invalid product_type")
    }
    if (!isBlank(row.variant_strategy) && !VARIANTS.has(row.variant_strategy)) {
      errors.push("invalid variant_strategy")
    }
    if (!isBlank(row.publish_policy) && !PUBLISH.has(row.publish_policy)) {
      errors.push("invalid publish_policy")
    }
    if (row.publish_policy === "exclude") {
      warnings.push("publish_policy exclude with approve_for_seed — consider exclude_from_pilot")
    }
  }

  if (
    (decision === "needs_more_info" || decision === "exclude_from_pilot") &&
    isBlank(row.operator_note)
  ) {
    errors.push("operator_note required for needs_more_info / exclude_from_pilot")
  }

  if (!isBlank(decision) && !DECISIONS.has(decision)) {
    errors.push("invalid operator_decision")
  }

  const is_complete_for_approve =
    decision === "approve_for_seed" && missing.length === 0 && errors.length === 0
  const is_seed_ready = is_complete_for_approve

  return {
    handle: row.handle,
    is_seed_ready,
    is_complete_for_approve,
    missing_fields: Array.from(new Set(missing)),
    errors,
    warnings,
  }
}

export function computeSummary(rows: GateRow[]): GateSummary {
  const validations = rows.map(validateRow)
  return {
    total_rows: rows.length,
    approve_for_seed_count: rows.filter((r) => r.operator_decision === "approve_for_seed").length,
    needs_more_info_count: rows.filter((r) => r.operator_decision === "needs_more_info").length,
    excluded_from_pilot_count: rows.filter((r) => r.operator_decision === "exclude_from_pilot")
      .length,
    missing_required_fields_count: validations.filter((v) => v.missing_fields.length > 0).length,
    seed_ready_count: validations.filter((v) => v.is_seed_ready).length,
  }
}
