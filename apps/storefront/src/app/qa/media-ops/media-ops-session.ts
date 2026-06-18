import {
  loadOrphanReviewState,
  saveOrphanReviewState,
  type PersistedRow,
} from "../source-media-orphan-review/source-orphan-review-persistence"
import type { MediaOpsSessionV1 } from "./media-ops-types"

export const MEDIA_OPS_STORAGE_KEY = "woodright:media-ops:v1"
export const MEDIA_OPS_DUAL_WRITE = true

const EMPTY_SESSION = (): MediaOpsSessionV1 => ({
  version: 1,
  savedAt: new Date().toISOString(),
  inbox: { orphan: {}, supplement: {} },
  migration: { importedFrom: [], importedAt: null },
})

function parseSession(raw: string | null): MediaOpsSessionV1 | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as MediaOpsSessionV1
    if (parsed?.version !== 1 || !parsed.inbox) return null
    return {
      ...EMPTY_SESSION(),
      ...parsed,
      inbox: {
        orphan: parsed.inbox.orphan ?? {},
        supplement: parsed.inbox.supplement ?? {},
      },
    }
  } catch {
    return null
  }
}

export function loadMediaOpsSession(): MediaOpsSessionV1 {
  if (typeof window === "undefined") return EMPTY_SESSION()
  return parseSession(localStorage.getItem(MEDIA_OPS_STORAGE_KEY)) ?? EMPTY_SESSION()
}

export function saveMediaOpsSession(session: MediaOpsSessionV1): void {
  if (typeof window === "undefined") return
  const payload: MediaOpsSessionV1 = {
    ...session,
    version: 1,
    savedAt: new Date().toISOString(),
  }
  localStorage.setItem(MEDIA_OPS_STORAGE_KEY, JSON.stringify(payload))
}

function rowTimestamp(row: PersistedRow | undefined): number {
  if (!row?.saved_at) return 0
  const t = Date.parse(row.saved_at)
  return Number.isFinite(t) ? t : 0
}

/** Merge orphan rows: media-ops session vs legacy key; newer `saved_at` wins per id. */
export function loadInboxOrphanRows(): Record<string, PersistedRow> {
  const merged: Record<string, PersistedRow> = {}

  const legacy = loadOrphanReviewState()
  if (legacy?.rows) {
    for (const [id, row] of Object.entries(legacy.rows)) {
      merged[id] = row
    }
  }

  const session = loadMediaOpsSession()
  for (const [id, row] of Object.entries(session.inbox.orphan)) {
    const prev = merged[id]
    if (!prev || rowTimestamp(row) >= rowTimestamp(prev)) {
      merged[id] = row
    }
  }

  return merged
}

export function saveInboxOrphanRows(rows: Record<string, PersistedRow>): void {
  if (typeof window === "undefined") return

  const session = loadMediaOpsSession()
  session.inbox.orphan = rows
  session.lastMode = "inbox"
  saveMediaOpsSession(session)

  if (MEDIA_OPS_DUAL_WRITE) {
    saveOrphanReviewState(rows)
  }
}

/** Update one orphan row; preserves other rows' `saved_at` for merge correctness. */
export function patchInboxOrphanRow(sourceId: string, patch: Partial<PersistedRow>): void {
  if (typeof window === "undefined") return
  const merged = loadInboxOrphanRows()
  const prev = merged[sourceId]
  merged[sourceId] = {
    operator_decision: patch.operator_decision ?? prev?.operator_decision ?? "pending",
    operator_notes: patch.operator_notes ?? prev?.operator_notes ?? "",
    saved_at: new Date().toISOString(),
  }
  saveInboxOrphanRows(merged)
}
