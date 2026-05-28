import type { BoardPersistedState, DesignerDecision, DuplicateStatus, OperatorRole, PersistedItemState } from "./approval-board-types"

const STORAGE_KEY = "woodright:legacy-site-media-approval-board:v2"
const LEGACY_KEY = "woodright:legacy-site-media-approval-board:v1"

export function loadBoardState(): BoardPersistedState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as BoardPersistedState & { version?: number }
    if (!parsed?.decisions) return null
    if (parsed.version === 1) {
      const migrated: BoardPersistedState = {
        version: 2,
        savedAt: parsed.savedAt || new Date().toISOString(),
        decisions: {},
      }
      for (const [id, d] of Object.entries(parsed.decisions as Record<string, PersistedItemState>)) {
        migrated.decisions[id] = {
          designer_decision: d.designer_decision,
          notes: d.notes ?? "",
        }
      }
      return migrated
    }
    if (parsed.version !== 2) return null
    return parsed
  } catch {
    return null
  }
}

export function saveBoardState(decisions: BoardPersistedState["decisions"]): string {
  const savedAt = new Date().toISOString()
  const payload: BoardPersistedState = { version: 2, savedAt, decisions }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  return savedAt
}

export function clearBoardState(): void {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(LEGACY_KEY)
}

export function formatSavedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export function isDecision(d: string): d is DesignerDecision {
  return d === "approve" || d === "reject" || d === "needs_review" || d === "pending"
}

export function isOperatorRole(d: string | null | undefined): d is OperatorRole {
  return (
    d === "front" ||
    d === "front_3_4" ||
    d === "side" ||
    d === "detail" ||
    d === "interior" ||
    d === "scheme" ||
    d === "unknown"
  )
}

export function isDuplicateStatus(d: string | null | undefined): d is DuplicateStatus {
  return (
    d === "unchecked" ||
    d === "not_duplicate" ||
    d === "possible_duplicate" ||
    d === "duplicate_reject"
  )
}
