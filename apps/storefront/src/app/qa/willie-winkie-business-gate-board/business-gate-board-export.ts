import { computeSummary, validateRow } from "./business-gate-board-validation"
import {
  REVIEW_VERSION,
  type GateRow,
  type RowValidation,
} from "./business-gate-board-types"

const CSV_COLUMNS = [
  "handle",
  "sku",
  "collection",
  "motif_painting_name",
  "raw_legacy_title",
  "raw_legacy_category",
  "media_count",
  "available_roles",
  "static_sample_public_url",
  "static_sample_repo_path",
  "workbook_row_key",
  "workbook_product_code_ww",
  "price",
  "currency",
  "product_type",
  "variant_strategy",
  "publish_policy",
  "operator_decision",
  "operator_note",
] as const

function csvEscape(v: unknown): string {
  const s = String(v ?? "")
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function rowsToCsv(rows: GateRow[]): string {
  const lines = [CSV_COLUMNS.join(",")]
  for (const r of rows) {
    lines.push(CSV_COLUMNS.map((k) => csvEscape(r[k])).join(","))
  }
  return lines.join("\n") + "\n"
}

export function buildExportJson(
  rows: GateRow[],
  sourcePacketPath: string
): Record<string, unknown> {
  const validations = rows.map(validateRow)
  const validationByHandle = new Map(validations.map((v) => [v.handle, v]))
  return {
    review_tool: "willie-winkie-business-gate-board",
    review_version: REVIEW_VERSION,
    created_at: new Date().toISOString(),
    source_packet_path: sourcePacketPath,
    do_not_auto_apply: true,
    validation_summary: computeSummary(rows),
    rows: rows.map((row) => ({
      ...row,
      validation: validationByHandle.get(row.handle),
      do_not_auto_apply: true,
    })),
  }
}

export function parseImportJson(
  data: unknown,
  baseHandles: Set<string>
): Partial<GateRow>[] | null {
  if (!data || typeof data !== "object") return null
  const obj = data as Record<string, unknown>
  const rows = obj.rows
  if (!Array.isArray(rows)) return null
  return rows.filter(
    (r): r is Partial<GateRow> =>
      !!r &&
      typeof r === "object" &&
      typeof (r as GateRow).handle === "string" &&
      baseHandles.has((r as GateRow).handle)
  )
}

export function downloadBlob(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export type { RowValidation }
