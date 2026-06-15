import type { MatrixRow } from "../../matrix-board-types"
import { TODO_OPERATOR } from "../../matrix-board-types"

const TIER_DEFAULTS: Record<string, string> = {
  solid_full_price_rub: TODO_OPERATOR,
  solid_front_ldsp_body_price_rub: TODO_OPERATOR,
  solid_full_sku_suffix: "",
  solid_front_ldsp_body_sku_suffix: "",
  tier_notes: "",
}

export const MATRIX_COLUMNS = [
  "handle",
  "painting_prefix",
  "legacy_title",
  "legacy_collection_hint",
  "proposed_medusa_collection",
  "proposed_category",
  "legacy_cs_cart_product_id",
  "flow_a_media_count",
  "workbook_row_key",
  "workbook_product_code",
  "painting_name",
  "medusa_product_type",
  "variant_strategy",
  "price_rub",
  "solid_full_price_rub",
  "solid_front_ldsp_body_price_rub",
  "solid_full_sku_suffix",
  "solid_front_ldsp_body_sku_suffix",
  "tier_notes",
  "compare_at_price_rub",
  "currency",
  "status_draft_or_published",
  "category_seed_needed",
  "ingestion_allowed",
  "operator_decision",
  "operator_notes",
] as const

export function parseCsv(text: string): MatrixRow[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0])
  const rows: MatrixRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const vals = parseCsvLine(line)
    const row = {} as Record<string, string>
    headers.forEach((h, idx) => {
      row[h] = vals[idx] ?? ""
    })
    for (const [k, v] of Object.entries(TIER_DEFAULTS)) {
      if (row[k] === undefined || row[k] === "") row[k] = v
    }
    rows.push(row as unknown as MatrixRow)
  }
  return rows
}

function parseCsvLine(line: string): string[] {
  const vals: string[] = []
  let cur = ""
  let inQ = false
  for (let j = 0; j < line.length; j++) {
    const c = line[j]
    if (inQ) {
      if (c === '"' && line[j + 1] === '"') {
        cur += '"'
        j++
      } else if (c === '"') inQ = false
      else cur += c
    } else {
      if (c === '"') inQ = true
      else if (c === ",") {
        vals.push(cur)
        cur = ""
      } else cur += c
    }
  }
  vals.push(cur)
  return vals
}

export function csvEscape(v: string): string {
  const s = String(v ?? "")
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function rowsToCsv(rows: MatrixRow[]): string {
  const lines = [MATRIX_COLUMNS.join(",")]
  for (const row of rows) {
    lines.push(MATRIX_COLUMNS.map((c) => csvEscape(String(row[c as keyof MatrixRow] ?? ""))).join(","))
  }
  return lines.join("\n") + "\n"
}
