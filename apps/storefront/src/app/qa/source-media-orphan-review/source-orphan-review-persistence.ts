import type { OrphanDecision } from "./source-orphan-review-types"

const STORAGE_KEY = "woodright:source-media-orphan-review:v1"

export type PersistedRow = {
  operator_decision: OrphanDecision
  operator_notes: string
  saved_at: string
}

export type PersistedState = {
  version: 1
  saved_at: string
  rows: Record<string, PersistedRow>
}

export function loadOrphanReviewState(): PersistedState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (parsed?.version !== 1 || !parsed.rows) return null
    return parsed
  } catch {
    return null
  }
}

export function saveOrphanReviewState(rows: Record<string, PersistedRow>): void {
  if (typeof window === "undefined") return
  const payload: PersistedState = {
    version: 1,
    saved_at: new Date().toISOString(),
    rows,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export function clearOrphanReviewState(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(STORAGE_KEY)
}

export function isOrphanDecision(v: string): v is OrphanDecision {
  return [
    "map_candidate",
    "reject_noise",
    "needs_more_context",
    "blocked_cross_sku",
    "content_request",
    "pending",
  ].includes(v)
}
