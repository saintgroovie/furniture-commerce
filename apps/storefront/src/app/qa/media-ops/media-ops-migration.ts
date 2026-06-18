/**
 * Canonical registry of legacy operator localStorage sources for Media Ops migration.
 * Order = import priority (inbox → assign → launch). See docs/operator/media-ops-implementation-plan.md §3.
 */

export type LegacyStorageMode = "inbox" | "assign" | "launch"

export type LegacySessionSection =
  | "inbox.orphan"
  | "inbox.supplement"
  | "assign"
  | "assign.overlay"
  | "launch.rowPatches"

export type LegacyImportMode = "primary" | "fallback" | "metadata" | "deprecated"

export type LegacyStorageSource = {
  key: string
  label: string
  mode: LegacyStorageMode
  sessionSection: LegacySessionSection
  phase: 2 | 3 | 4 | 5 | 6
  /** Lower = import earlier (operator workflow order). */
  importOrder: number
  detectInBanner: boolean
  dualWrite: boolean
  persistenceFile: string
  importMode: LegacyImportMode
}

/** Sorted by `importOrder` — inbox triage → supplement → assign → overlay → launch (deprecated). */
export const LEGACY_STORAGE_SOURCES: readonly LegacyStorageSource[] = [
  {
    key: "woodright:source-media-orphan-review:v1",
    label: "orphan review",
    mode: "inbox",
    sessionSection: "inbox.orphan",
    phase: 2,
    importOrder: 10,
    detectInBanner: true,
    dualWrite: true,
    persistenceFile: "source-media-orphan-review/source-orphan-review-persistence.ts",
    importMode: "primary",
  },
  {
    key: "woodright:legacy-site-media-approval-board:v2",
    label: "supplement approval",
    mode: "inbox",
    sessionSection: "inbox.supplement",
    phase: 3,
    importOrder: 20,
    detectInBanner: true,
    dualWrite: true,
    persistenceFile: "legacy-site-media-approval-board/approval-board-persistence.ts",
    importMode: "primary",
  },
  {
    key: "woodright:legacy-site-media-approval-board:v1",
    label: "supplement approval (v1)",
    mode: "inbox",
    sessionSection: "inbox.supplement",
    phase: 3,
    importOrder: 21,
    detectInBanner: true,
    dualWrite: false,
    persistenceFile: "legacy-site-media-approval-board/approval-board-persistence.ts",
    importMode: "fallback",
  },
  {
    key: "furniture-legacy-media-assignment-v2board-state",
    label: "assignment v2",
    mode: "assign",
    sessionSection: "assign",
    phase: 4,
    importOrder: 30,
    detectInBanner: true,
    dualWrite: true,
    persistenceFile: "legacy-media-assignment-board-v2/legacy-board-v2-persistence.ts",
    importMode: "primary",
  },
  {
    key: "woodright:orphan-p0-overlay:v1",
    label: "orphan P0 overlay",
    mode: "assign",
    sessionSection: "assign.overlay",
    phase: 4,
    importOrder: 31,
    detectInBanner: true,
    dualWrite: true,
    persistenceFile: "legacy-media-assignment-board-v2/orphan-p0-overlay-persistence.ts",
    importMode: "metadata",
  },
  {
    key: "woodright:willie-winkie-business-gate-board:v1",
    label: "business gate launch review",
    mode: "launch",
    sessionSection: "launch.rowPatches",
    phase: 5,
    importOrder: 50,
    detectInBanner: true,
    dualWrite: false,
    persistenceFile: "willie-winkie-business-gate-board/business-gate-board-persistence.ts",
    importMode: "deprecated",
  },
] as const

export type LegacyMigrationDetectItem = {
  key: string
  label: string
  byteLength: number
  mode: LegacyStorageMode
  sessionSection: LegacySessionSection
  importOrder: number
}

export type LegacyMigrationDetect = {
  found: LegacyMigrationDetectItem[]
  hasAny: boolean
}

export function detectLegacyBoardStorage(): LegacyMigrationDetect {
  if (typeof window === "undefined") {
    return { found: [], hasAny: false }
  }
  const found: LegacyMigrationDetectItem[] = []
  for (const src of LEGACY_STORAGE_SOURCES) {
    if (!src.detectInBanner) continue
    const raw = localStorage.getItem(src.key)
    if (raw && raw.length > 0) {
      found.push({
        key: src.key,
        label: src.label,
        byteLength: raw.length,
        mode: src.mode,
        sessionSection: src.sessionSection,
        importOrder: src.importOrder,
      })
    }
  }
  found.sort((a, b) => a.importOrder - b.importOrder)
  return { found, hasAny: found.length > 0 }
}

/** Sources eligible for Phase 6 import, in workflow order. */
export function legacySourcesForImport(): readonly LegacyStorageSource[] {
  return LEGACY_STORAGE_SOURCES
}
