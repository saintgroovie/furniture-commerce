import * as fs from "fs"
import * as path from "path"

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

const RECOVERY_MAP_REL = "data/normalized/legacy-media-preview-recovery-map.json"

let cachedMap: Map<string, LegacyMediaPreviewRecoveryEntry> | null = null
let cachedRepoRoot: string | null = null

export function loadLegacyMediaPreviewRecoveryMap(repoRoot: string | null): Map<string, LegacyMediaPreviewRecoveryEntry> {
  if (!repoRoot) return new Map()
  if (cachedMap && cachedRepoRoot === repoRoot) return cachedMap

  const abs = path.join(repoRoot, RECOVERY_MAP_REL)
  const next = new Map<string, LegacyMediaPreviewRecoveryEntry>()
  try {
    if (fs.existsSync(abs)) {
      const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as LegacyMediaPreviewRecoveryMap
      for (const [id, entry] of Object.entries(raw.entries ?? {})) {
        if (entry?.found_path) next.set(id, entry)
      }
    }
  } catch {
    /* ignore — board falls back to inventory-only preview */
  }

  cachedMap = next
  cachedRepoRoot = repoRoot
  return next
}

export function recoveryBadgeLabel(status: string): string {
  if (status === "recovered_exact" || status === "recovered_backend_static") return "recovered preview · exact"
  if (status === "recovered_basename" || status === "recovered_case_insensitive" || status === "recovered_variant_basename") {
    return "recovered preview · basename"
  }
  if (status === "recovered_pdf_extract") return "recovered preview · pdf"
  if (status === "recovered_duplicate_group") return "recovered preview · duplicate"
  return "recovered preview"
}
