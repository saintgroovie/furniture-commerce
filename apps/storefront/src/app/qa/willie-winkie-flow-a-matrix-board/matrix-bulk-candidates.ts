import { candidateToRowPatch, sourceFieldsFromCandidate } from "./matrix-candidate-patch"
import { validateRow } from "./matrix-board-validation"
import {
  TODO_OPERATOR,
  type HandleCandidates,
  type MatrixRow,
  type RowFieldSources,
  type WorkbookCandidate,
  type WorkbookConfidence,
} from "./matrix-board-types"

export type BulkSkipReason =
  | "no_candidate"
  | "candidate_not_exact"
  | "candidate_not_likely"
  | "manual_value_exists"
  | "missing_price"

export type BulkCandidateMode = "exact" | "likely"

export type BulkRowPlan =
  | { handle: string; kind: "skip"; reason: BulkSkipReason }
  | {
      handle: string
      kind: "apply"
      candidate: WorkbookCandidate
      patch: Partial<MatrixRow>
      sourceFields: Array<keyof MatrixRow>
      fieldsSkippedManual: string[]
      missingPriceAfter: boolean
    }

export type BulkApplyPlan = {
  rows: BulkRowPlan[]
  updatedCount: number
  skippedCount: number
  appliedWithoutPrice: number
  skippedByReason: Record<BulkSkipReason, number>
}

function isBlankValue(v: string | undefined | null): boolean {
  const s = (v ?? "").trim()
  return s.length === 0 || s === TODO_OPERATOR
}

function isBlankDecision(v: string | undefined): boolean {
  return isBlankValue(v)
}

function confidenceMeets(conf: WorkbookConfidence, mode: BulkCandidateMode): boolean {
  if (mode === "exact") return conf === "exact"
  return conf === "exact" || conf === "likely"
}

function hasManualValue(
  row: MatrixRow,
  field: keyof MatrixRow,
  fieldSources: RowFieldSources
): boolean {
  if (fieldSources[field] === "manual") return true
  if (fieldSources[field] === "source") return false
  return !isBlankValue(String(row[field] ?? ""))
}

function candidateNote(c: WorkbookCandidate): string {
  return `source: ${c.source_sheet}:${c.workbook_row_key} ${c.workbook_product_code}`
}

function mergeNotes(existing: string, note: string): string {
  const cur = (existing ?? "").trim()
  if (!cur) return note
  if (cur.includes(note)) return cur
  return `${cur}; ${note}`
}

export function planBulkCandidateApply(opts: {
  targetHandles: string[]
  rowsByHandle: Map<string, MatrixRow>
  candidatesByHandle: Map<string, HandleCandidates>
  fieldSourcesByHandle: Map<string, RowFieldSources>
  mode: BulkCandidateMode
  overwriteManual: boolean
}): BulkApplyPlan {
  const { targetHandles, rowsByHandle, candidatesByHandle, fieldSourcesByHandle, mode, overwriteManual } =
    opts

  const rows: BulkRowPlan[] = []
  const skippedByReason: Record<BulkSkipReason, number> = {
    no_candidate: 0,
    candidate_not_exact: 0,
    candidate_not_likely: 0,
    manual_value_exists: 0,
    missing_price: 0,
  }
  let appliedWithoutPrice = 0

  for (const handle of targetHandles) {
    const row = rowsByHandle.get(handle)
    if (!row) continue

    const hc = candidatesByHandle.get(handle)
    const top = hc?.candidates[0]
    if (!top) {
      rows.push({ handle, kind: "skip", reason: "no_candidate" })
      skippedByReason.no_candidate++
      continue
    }

    if (!confidenceMeets(top.confidence, mode)) {
      const reason: BulkSkipReason = mode === "exact" ? "candidate_not_exact" : "candidate_not_likely"
      rows.push({ handle, kind: "skip", reason })
      skippedByReason[reason]++
      continue
    }

    const fieldSources = fieldSourcesByHandle.get(handle) ?? {}
    const fullPatch = candidateToRowPatch(top)
    const patch: Partial<MatrixRow> = { ingestion_allowed: "no" }
    const sourceFields: Array<keyof MatrixRow> = []
    const fieldsSkippedManual: string[] = []

    for (const field of sourceFieldsFromCandidate(top)) {
      if (!overwriteManual && hasManualValue(row, field, fieldSources)) {
        fieldsSkippedManual.push(field)
        continue
      }
      const val = fullPatch[field]
      if (val !== undefined) {
        patch[field] = val as never
        sourceFields.push(field)
      }
    }

    if (sourceFields.length === 0) {
      rows.push({ handle, kind: "skip", reason: "manual_value_exists" })
      skippedByReason.manual_value_exists++
      continue
    }

    if (isBlankDecision(row.operator_decision)) {
      patch.operator_decision = "hold"
    }

    patch.operator_notes = mergeNotes(row.operator_notes, candidateNote(top))

    const mergedRow = { ...row, ...patch } as MatrixRow
    const missingPriceAfter = isBlankValue(mergedRow.price_rub)
    if (missingPriceAfter && top.price == null) {
      appliedWithoutPrice++
    }

    rows.push({
      handle,
      kind: "apply",
      candidate: top,
      patch,
      sourceFields,
      fieldsSkippedManual,
      missingPriceAfter,
    })
  }

  const updatedCount = rows.filter((r) => r.kind === "apply").length
  const skippedCount = rows.filter((r) => r.kind === "skip").length

  return { rows, updatedCount, skippedCount, appliedWithoutPrice, skippedByReason }
}

export function countStillMissingMandatoryCells(rows: MatrixRow[]): number {
  let missing = 0
  for (const row of rows) {
    missing += validateRow(row).missing_fields.length
  }
  return missing
}

export function formatBulkSummary(plan: BulkApplyPlan, stillMissingCells: number): string {
  const parts = [
    `Обновлено: ${plan.updatedCount}`,
    `Пропущено: ${plan.skippedCount}`,
  ]
  const reasons = Object.entries(plan.skippedByReason)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}: ${n}`)
  if (reasons.length) parts.push(`Причины пропуска — ${reasons.join(", ")}`)
  if (plan.appliedWithoutPrice > 0) {
    parts.push(`без цены в source (нужно вручную): ${plan.appliedWithoutPrice}`)
  }
  parts.push(`Всё ещё не заполнено обязательных полей: ${stillMissingCells}`)
  parts.push("approve не ставился автоматически")
  return parts.join(" · ")
}
