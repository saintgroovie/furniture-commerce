import type { MatrixRow, WorkbookCandidate } from "./matrix-board-types"

/** Apply only fields present on the candidate — never auto-approve. */
export function candidateToRowPatch(candidate: WorkbookCandidate): Partial<MatrixRow> {
  const patch: Partial<MatrixRow> = {
    workbook_row_key: candidate.workbook_row_key,
    workbook_product_code: candidate.workbook_product_code,
    ingestion_allowed: "no",
  }
  if (candidate.painting_name) patch.painting_name = candidate.painting_name
  if (candidate.price != null && Number.isFinite(candidate.price) && candidate.price > 0) {
    patch.price_rub = String(Math.round(candidate.price))
    patch.currency = "rub"
  }
  return patch
}

export function sourceFieldsFromCandidate(candidate: WorkbookCandidate): Array<keyof MatrixRow> {
  const keys: Array<keyof MatrixRow> = ["workbook_row_key", "workbook_product_code"]
  if (candidate.painting_name) keys.push("painting_name")
  if (candidate.price != null && candidate.price > 0) keys.push("price_rub", "currency")
  return keys
}
