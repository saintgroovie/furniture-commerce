import * as fs from "fs"
import * as path from "path"
import { assertWritePath, matrixFile } from "./matrix-repo-root"
import type { MatrixRow } from "../../matrix-board-types"

export const PARSED_SHEETS_REL = path.join("data", "raw", "workbook", "parsed-sheets.json")

export type WorkbookConfidence = "exact" | "likely" | "weak"

export type ParsedWorkbookRow = {
  source_sheet: string
  row_index: number
  collection_name_raw: string
  collection_name_normalized: string
  product_code_raw: string
  product_code_normalized: string
  product_name_raw: string
  product_name_canonical: string
  category_raw: string
  category_normalized: string
  dimensions_raw: string
  price_raw: number | null
  price_normalized: number | null
  price_type: string
  notes_raw: string | null
  is_ambiguous: boolean
}

export type WorkbookCandidate = {
  candidate_id: string
  source_sheet: string
  workbook_row_key: string
  workbook_product_code: string
  candidate_title: string
  painting_name: string | null
  category: string | null
  category_raw: string | null
  price: number | null
  currency: string | null
  confidence: WorkbookConfidence
  why_matched: string[]
  raw_row_excerpt: Record<string, unknown>
}

export type HandleCandidates = {
  handle: string
  candidates: WorkbookCandidate[]
  has_workbook_source: boolean
  best_confidence: WorkbookConfidence | null
}

export type WorkbookSourceAudit = {
  generated_at: string
  parsed_sheets_path: string
  total_workbook_rows: number
  sheets: Array<{ name: string; row_count: number }>
  willie_winkie_sheet_rows: number
  pilot_handles: number
  handles_with_candidates: number
  handles_with_exact_or_likely: number
  handles_with_no_candidates: string[]
  prefix_mapping_notes: string[]
  molly_notes: string[]
  sample_candidates: Array<{ handle: string; top: WorkbookCandidate | null }>
  per_handle: HandleCandidates[]
}

/** Painting motif names derived from pilot legacy titles — not invented at match time. */
export const PAINTING_BY_PREFIX: Record<string, string> = {
  AV: "Ant's Village",
  BA: "Ballet",
  FA: "Fairies",
  FK: "Fantasy Kingdom",
  IN: "Infanta",
  MO: "Molly",
  PA: "Pastoral",
  RL: "Royal Lilies",
  RS: "Rural Scenery",
  SH: "Sweet Home",
  TB: "Teddy Bear",
  TE: "Templars",
  TO: "Tommy",
  TW: "Tiggy-Winkle",
}

const CATEGORY_HINT_TO_WORKBOOK = new Map<string, string[]>([
  ["komody", ["dresser"]],
  ["stellazhi", ["bookcase"]],
  ["shkafy", ["wardrobe"]],
  ["stoly-i-stoliki", ["table", "mirror"]],
  ["krovati", ["bed"]],
  ["zerkala", ["mirror"]],
])

const TITLE_KEYWORDS: Record<string, string[]> = {
  dresser: ["комод"],
  bookcase: ["стеллаж"],
  wardrobe: ["шкаф"],
  table: ["стол"],
  mirror: ["зеркал", "туалетн"],
  bed: ["кроват"],
}

function loadParsedSheets(repoRoot: string): ParsedWorkbookRow[] {
  const abs = path.join(repoRoot, PARSED_SHEETS_REL)
  if (!fs.existsSync(abs)) return []
  const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as ParsedWorkbookRow[]
  return Array.isArray(raw) ? raw : []
}

function handleSuffix(handle: string): string {
  const i = handle.indexOf("-")
  return i >= 0 ? handle.slice(i + 1) : handle
}

function wwSuffixFromCode(row: ParsedWorkbookRow): string {
  const norm = (row.product_code_normalized || "").toUpperCase()
  if (norm.startsWith("WW-")) return norm.slice(3).toLowerCase()
  return (row.product_code_raw || "").trim().toLowerCase()
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[`'"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function titleOverlapScore(legacyTitle: string, productName: string): number {
  const lt = normalizeText(legacyTitle)
  const pn = normalizeText(productName)
  let score = 0
  for (const words of Object.values(TITLE_KEYWORDS)) {
    for (const w of words) {
      if (lt.includes(w) && pn.includes(w)) score += 2
    }
  }
  if (pn.length > 4 && lt.includes(pn.slice(0, Math.min(12, pn.length)))) score += 1
  return score
}

function categoryMatch(proposedCategory: string, wbCategory: string): boolean {
  const allowed = CATEGORY_HINT_TO_WORKBOOK.get(proposedCategory) || []
  return allowed.includes(wbCategory)
}

function confidenceRank(c: WorkbookConfidence): number {
  return c === "exact" ? 3 : c === "likely" ? 2 : 1
}

function buildCandidate(
  matrixRow: MatrixRow,
  wb: ParsedWorkbookRow,
  paintingName: string | null
): WorkbookCandidate {
  const why: string[] = []
  const suffix = handleSuffix(matrixRow.handle)
  const wwSuffix = wwSuffixFromCode(wb)
  why.push(`суффикс handle ${suffix} ↔ workbook ${wb.product_code_normalized || wb.product_code_raw}`)

  if (categoryMatch(matrixRow.proposed_category, wb.category_normalized)) {
    why.push(`категория ${matrixRow.proposed_category} ↔ ${wb.category_normalized}`)
  }

  if (paintingName && normalizeText(matrixRow.legacy_title).includes(normalizeText(paintingName))) {
    why.push(`мотив «${paintingName}» в legacy title`)
  }

  const overlap = titleOverlapScore(matrixRow.legacy_title, wb.product_name_raw)
  if (overlap > 0) why.push(`совпадение типа изделия в названии (score ${overlap})`)

  if (wb.source_sheet === "ВВ" || wb.collection_name_normalized === "willie-winkie") {
    why.push("лист ВВ / collection willie-winkie")
  }

  let confidence: WorkbookConfidence = "weak"
  const catOk = categoryMatch(matrixRow.proposed_category, wb.category_normalized)
  if (catOk && overlap >= 2) confidence = "exact"
  else if (catOk || overlap >= 2 || paintingName) confidence = "likely"

  const price =
    typeof wb.price_normalized === "number" && Number.isFinite(wb.price_normalized)
      ? wb.price_normalized
      : null

  return {
    candidate_id: `${matrixRow.handle}::${wb.source_sheet}:${wb.row_index}`,
    source_sheet: wb.source_sheet,
    workbook_row_key: `${wb.source_sheet}:${wb.row_index}`,
    workbook_product_code: wb.product_code_normalized || wb.product_code_raw,
    candidate_title: wb.product_name_raw || wb.product_name_canonical,
    painting_name: paintingName,
    category: wb.category_normalized,
    category_raw: wb.category_raw,
    price,
    currency: price != null ? "rub" : null,
    confidence,
    why_matched: why,
    raw_row_excerpt: {
      row_index: wb.row_index,
      product_code_raw: wb.product_code_raw,
      product_code_normalized: wb.product_code_normalized,
      product_name_raw: wb.product_name_raw,
      category_raw: wb.category_raw,
      dimensions_raw: wb.dimensions_raw,
      price_raw: wb.price_raw,
      price_normalized: wb.price_normalized,
      is_ambiguous: wb.is_ambiguous,
    },
  }
}

export function buildCandidatesForRow(
  matrixRow: MatrixRow,
  allWorkbook: ParsedWorkbookRow[]
): HandleCandidates {
  const suffix = handleSuffix(matrixRow.handle).toLowerCase()
  const prefix = matrixRow.painting_prefix.toUpperCase()
  const paintingName = PAINTING_BY_PREFIX[prefix] || null

  const vvRows = allWorkbook.filter(
    (r) =>
      r.source_sheet === "ВВ" ||
      r.collection_name_normalized === "willie-winkie"
  )

  const bySuffix = vvRows.filter((r) => wwSuffixFromCode(r) === suffix)

  const candidates = bySuffix
    .map((wb) => buildCandidate(matrixRow, wb, paintingName))
    .sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence))

  const best = candidates[0]?.confidence ?? null

  return {
    handle: matrixRow.handle,
    candidates,
    has_workbook_source: candidates.length > 0,
    best_confidence: best,
  }
}

export function buildAllCandidates(
  repoRoot: string,
  matrixRows: MatrixRow[]
): { workbook_rows: number; parsed_path: string; by_handle: HandleCandidates[] } {
  const allWorkbook = loadParsedSheets(repoRoot)
  const by_handle = matrixRows.map((row) => buildCandidatesForRow(row, allWorkbook))
  return {
    workbook_rows: allWorkbook.length,
    parsed_path: path.join(repoRoot, PARSED_SHEETS_REL),
    by_handle,
  }
}

export function buildWorkbookSourceAudit(
  repoRoot: string,
  matrixRows: MatrixRow[]
): WorkbookSourceAudit {
  const allWorkbook = loadParsedSheets(repoRoot)
  const sheetCounts = new Map<string, number>()
  for (const r of allWorkbook) {
    sheetCounts.set(r.source_sheet, (sheetCounts.get(r.source_sheet) || 0) + 1)
  }

  const per_handle = matrixRows.map((row) => buildCandidatesForRow(row, allWorkbook))
  const vvCount = allWorkbook.filter(
    (r) => r.source_sheet === "ВВ" || r.collection_name_normalized === "willie-winkie"
  ).length

  const noCandidates = per_handle.filter((h) => h.candidates.length === 0).map((h) => h.handle)
  const exactOrLikely = per_handle.filter(
    (h) => h.best_confidence === "exact" || h.best_confidence === "likely"
  ).length

  return {
    generated_at: new Date().toISOString(),
    parsed_sheets_path: path.join(repoRoot, PARSED_SHEETS_REL),
    total_workbook_rows: allWorkbook.length,
    sheets: Array.from(sheetCounts.entries())
      .map(([name, row_count]) => ({ name, row_count }))
      .sort((a, b) => b.row_count - a.row_count),
    willie_winkie_sheet_rows: vvCount,
    pilot_handles: matrixRows.length,
    handles_with_candidates: per_handle.filter((h) => h.candidates.length > 0).length,
    handles_with_exact_or_likely: exactOrLikely,
    handles_with_no_candidates: noCandidates,
    prefix_mapping_notes: [
      "Handle prefix (AV, BA, …) maps to painting motif name via PAINTING_BY_PREFIX from pilot legacy titles.",
      "Workbook ВВ sheet uses generic WW-{suffix} codes; suffix match is primary signal.",
    ],
    molly_notes: [
      "mo-02-1 / mo-81-1 use prefix MO → Molly; workbook rows are still on ВВ sheet with WW codes.",
      "No separate Molly sheet in parsed-sheets.json.",
    ],
    sample_candidates: per_handle.slice(0, 5).map((h) => ({
      handle: h.handle,
      top: h.candidates[0] ?? null,
    })),
    per_handle,
  }
}

export function writeWorkbookSourceAudit(repoRoot: string, audit: WorkbookSourceAudit): void {
  const jsonPath = matrixFile(repoRoot, "workbook-candidate-source-audit.json")
  const mdPath = matrixFile(repoRoot, "workbook-candidate-source-audit.md")
  assertWritePath(jsonPath, repoRoot)
  assertWritePath(mdPath, repoRoot)

  fs.writeFileSync(jsonPath, JSON.stringify(audit, null, 2), "utf8")

  const lines = [
    "# Workbook candidate source audit",
    "",
    `Generated: ${audit.generated_at}`,
    "",
    "## Summary",
    "",
    `- Parsed sheets: \`${audit.parsed_sheets_path}\``,
    `- Total workbook rows: **${audit.total_workbook_rows}**`,
    `- ВВ / willie-winkie rows: **${audit.willie_winkie_sheet_rows}**`,
    `- Pilot handles: **${audit.pilot_handles}**`,
    `- Handles with candidates: **${audit.handles_with_candidates}**`,
    `- Handles with exact/likely top candidate: **${audit.handles_with_exact_or_likely}**`,
    `- Handles with no candidates: **${audit.handles_with_no_candidates.length}**`,
    "",
    "## Sheets",
    "",
    ...audit.sheets.map((s) => `- ${s.name}: ${s.row_count} rows`),
    "",
    "## Prefix / Molly notes",
    "",
    ...audit.prefix_mapping_notes.map((n) => `- ${n}`),
    "",
    ...audit.molly_notes.map((n) => `- ${n}`),
    "",
    "## Per-handle top candidate",
    "",
    ...audit.per_handle.map((h) => {
      const top = h.candidates[0]
      if (!top) return `- **${h.handle}**: no candidate`
      return `- **${h.handle}**: ${top.confidence} — \`${top.workbook_product_code}\` ${top.candidate_title} — ₽${top.price ?? "—"}`
    }),
  ]

  fs.writeFileSync(mdPath, lines.join("\n"), "utf8")
}
