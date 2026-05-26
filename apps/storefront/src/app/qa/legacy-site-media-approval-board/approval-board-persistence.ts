import type { BoardPersistedState, DesignerDecision } from "./approval-board-types"

const STORAGE_KEY = "woodright:legacy-site-media-approval-board:v1"

export function loadBoardState(): BoardPersistedState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as BoardPersistedState
    if (parsed?.version !== 1 || !parsed.decisions) return null
    return parsed
  } catch {
    return null
  }
}

export function saveBoardState(decisions: BoardPersistedState["decisions"]): string {
  const savedAt = new Date().toISOString()
  const payload: BoardPersistedState = { version: 1, savedAt, decisions }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  return savedAt
}

export function clearBoardState(): void {
  localStorage.removeItem(STORAGE_KEY)
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
