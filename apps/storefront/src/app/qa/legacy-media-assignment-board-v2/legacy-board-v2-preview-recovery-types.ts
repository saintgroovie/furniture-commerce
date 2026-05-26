/** Client + server safe types/helpers — no Node fs. */

export type LegacyMediaPreviewRecoveryEntry = {
  found_path: string
  recovery_status: string
  confidence: string
  reason: string
}

export type LegacyMediaPreviewRecoveryMap = {
  audit_meta?: Record<string, unknown>
  entries: Record<string, LegacyMediaPreviewRecoveryEntry>
}

export function recoveryBadgeLabel(status: string): string {
  if (status === "recovered_exact" || status === "recovered_backend_static") return "recovered preview · exact"
  if (
    status === "recovered_basename" ||
    status === "recovered_case_insensitive" ||
    status === "recovered_variant_basename"
  ) {
    return "recovered preview · basename"
  }
  if (status === "recovered_pdf_extract") return "recovered preview · pdf"
  if (status === "recovered_duplicate_group") return "recovered preview · duplicate"
  return "recovered preview"
}
