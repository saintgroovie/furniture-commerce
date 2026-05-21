/**
 * LocalStorage persistence for v2 board — isolated namespace, no v1 key reads or writes.
 *
 * Key: furniture-legacy-media-assignment-v2board-state
 *
 * QA-only: no Medusa writes, no catalog mutations.
 */

import type { V2ProductState } from "./legacy-board-v2-types"

// ---------------------------------------------------------------------------
// Key — v2-exclusive namespace
// ---------------------------------------------------------------------------

export const V2_LS_KEY = "furniture-legacy-media-assignment-v2board-state"
export const V2_LS_VERSION = "1" as const

// ---------------------------------------------------------------------------
// Persisted shape
// ---------------------------------------------------------------------------

export type V2PersistedState = {
  version: typeof V2_LS_VERSION
  savedAt: string
  productStates: Record<string, V2ProductState>
  selectedHandle: string | null
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Load the full persisted v2board state from localStorage.
 * Returns null if absent, corrupt, or version mismatch.
 * Never throws — always returns null on error.
 */
export function loadV2PersistedState(): V2PersistedState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(V2_LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as V2PersistedState).version !== V2_LS_VERSION
    ) {
      return null
    }
    return parsed as V2PersistedState
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Persist the current v2board state to localStorage.
 * Silently swallows storage quota or security errors.
 */
export function saveV2PersistedState(
  productStates: Record<string, V2ProductState>,
  selectedHandle: string | null
): void {
  if (typeof window === "undefined") return
  try {
    const value: V2PersistedState = {
      version: V2_LS_VERSION,
      savedAt: new Date().toISOString(),
      productStates,
      selectedHandle,
    }
    window.localStorage.setItem(V2_LS_KEY, JSON.stringify(value))
  } catch {
    // Storage quota or private browsing — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Clear
// ---------------------------------------------------------------------------

/**
 * Remove the v2board namespace from localStorage.
 * Does NOT touch any v1 or other keys.
 */
export function clearV2PersistedState(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(V2_LS_KEY)
  } catch {
    // Ignore
  }
}

// ---------------------------------------------------------------------------
// Diagnostic helpers
// ---------------------------------------------------------------------------

/** Return a human-readable "saved N minutes ago" string. */
export function formatSavedAt(iso: string): string {
  try {
    const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 5) return "только что"
    if (diff < 60) return `${diff} с назад`
    const mins = Math.round(diff / 60)
    if (mins < 60) return `${mins} мин назад`
    return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
  } catch {
    return ""
  }
}
