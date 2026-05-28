import type { ChecklistItem, SkuPoolContext } from "./approval-board-types"

/** Canonical motif names — must match ww-sku-prefix-motifs.ts */
const KNOWN_MOTIF_NAMES = [
  "Fantasy Kingdom",
  "Royal Lilies",
  "Rural Scenery",
  "Teddy Bear",
  "Tiggy-Winkle",
  "Ant's Village",
  "Sweet Home",
  "Templars",
  "Fairies",
  "Ballet",
  "Pastoral",
  "Infanta",
  "Molly",
  "Tommy",
] as const

function normalizeMotif(s: string): string {
  return s
    .toLowerCase()
    .replace(/['`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

/** Parse explicit motif mention from operator notes (not ML). */
export function parseOperatorNoteMotif(notes: string | null | undefined): string | null {
  if (!notes?.trim()) return null
  const text = notes.replace(/\s+/g, " ")
  for (const motif of [...KNOWN_MOTIF_NAMES].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(?:это|это\\s+)?${motif.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i")
    if (re.test(text)) return motif
    if (text.toLowerCase().includes(motif.toLowerCase())) return motif
  }
  return null
}

export type CandidateMotifView = {
  expected_motif_from_sku_prefix: string | null
  legacy_page_motif: string | null
  operator_note_motif: string | null
  resolved_motif: string | null
  motif_confidence: SkuPoolContext["motif_confidence"]
  motif_source: SkuPoolContext["motif_source"]
  legacy_metadata_mismatch: boolean
  operator_confirmed_motif: boolean
  operator_confirmed_metadata_mismatch: boolean
}

export function buildCandidateMotifView(
  ctx: SkuPoolContext | undefined,
  item?: ChecklistItem
): CandidateMotifView {
  const expected =
    ctx?.expected_motif_from_sku_prefix ?? ctx?.motif_subcollection_expected ?? null
  const legacy = ctx?.legacy_page_motif ?? ctx?.motif_subcollection_observed ?? null
  const operatorNote = item ? parseOperatorNoteMotif(item.notes) : null
  const legacyMismatch = Boolean(
    ctx?.legacy_metadata_mismatch ?? ctx?.motif_mismatch ?? ctx?.decor_mismatch
  )

  let resolved = ctx?.resolved_motif ?? ctx?.motif_subcollection ?? expected
  let source = ctx?.motif_source ?? "unknown"
  let confidence = ctx?.motif_confidence ?? "unknown"

  const operatorConfirmed =
    Boolean(operatorNote && expected && normalizeMotif(operatorNote) === normalizeMotif(expected))

  if (operatorConfirmed) {
    resolved = expected
    source = "operator_note"
    confidence = "high"
  }

  const operatorConfirmedMismatch =
    legacyMismatch && operatorConfirmed && Boolean(operatorNote && expected)

  return {
    expected_motif_from_sku_prefix: expected,
    legacy_page_motif: legacy,
    operator_note_motif: operatorNote,
    resolved_motif: resolved,
    motif_confidence: confidence,
    motif_source: source,
    legacy_metadata_mismatch: legacyMismatch,
    operator_confirmed_motif: operatorConfirmed,
    operator_confirmed_metadata_mismatch: operatorConfirmedMismatch,
  }
}
