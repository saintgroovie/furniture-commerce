import * as fs from "fs"
import * as path from "path"
import type { LegacyMediaPreviewRecoveryEntry, LegacyMediaPreviewRecoveryMap } from "@/lib/qa/legacy-media-preview-recovery-types"

export type { LegacyMediaPreviewRecoveryEntry, LegacyMediaPreviewRecoveryMap } from "@/lib/qa/legacy-media-preview-recovery-types"
export { recoveryBadgeLabel } from "@/lib/qa/legacy-media-preview-recovery-types"

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
