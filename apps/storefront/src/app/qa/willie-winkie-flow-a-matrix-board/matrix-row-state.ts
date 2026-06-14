import { TODO_OPERATOR, type MatrixRow, type RowValidation } from "./matrix-board-types"

export type RowWorkflowState =
  | "needs_source_match"
  | "needs_price"
  | "needs_type_policy"
  | "ready_to_approve"
  | "approved"
  | "hold"
  | "rejected"

function isBlank(v: string | undefined): boolean {
  return !v || v.trim() === "" || v === TODO_OPERATOR
}

export const ROW_STATE_LABELS: Record<RowWorkflowState, string> = {
  needs_source_match: "Нужен workbook",
  needs_price: "Нужна цена",
  needs_type_policy: "Тип / статус",
  ready_to_approve: "Готов к approve",
  approved: "Approved",
  hold: "Hold",
  rejected: "Reject",
}

export function computeRowWorkflowState(
  row: MatrixRow,
  validation: RowValidation
): RowWorkflowState {
  if (row.operator_decision === "reject") return "rejected"
  if (row.operator_decision === "hold") return "hold"
  if (validation.is_valid_approve) return "approved"

  const hasMapping =
    !isBlank(row.workbook_row_key) && !isBlank(row.workbook_product_code)
  const hasPainting = !isBlank(row.painting_name)
  if (!hasMapping || !hasPainting) return "needs_source_match"

  if (isBlank(row.price_rub)) return "needs_price"

  const needsPolicy =
    isBlank(row.medusa_product_type) ||
    isBlank(row.variant_strategy) ||
    isBlank(row.status_draft_or_published)

  if (needsPolicy) return "needs_type_policy"

  if (validation.is_complete_for_approve) return "ready_to_approve"

  return "needs_type_policy"
}
