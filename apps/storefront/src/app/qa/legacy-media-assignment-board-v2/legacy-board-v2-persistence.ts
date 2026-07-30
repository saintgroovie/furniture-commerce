/**
 * LocalStorage persistence for v2 board — isolated namespace, no v1 key reads or writes.
 *
 * Key: furniture-legacy-media-assignment-v2board-state
 *
 * QA-only: no Medusa writes, no catalog mutations.
 */

import type { V2ProductState } from "./legacy-board-v2-types"
import {
  mergeOperatorVariantEdits,
  mergeVariantColorMeta,
  migratePersistedProductStates,
  syncVariantLabelOverridesFromMeta,
} from "./legacy-board-v2-color-label-persistence"

// ---------------------------------------------------------------------------
// Key — v2-exclusive namespace
// ---------------------------------------------------------------------------

export const V2_LS_KEY = "furniture-legacy-media-assignment-v2board-state"
export const V2_LS_VERSION = "2" as const
export const V2_LS_VERSION_LEGACY = "1" as const

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
    if (typeof parsed !== "object" || parsed === null) return null
    const version = (parsed as { version?: string }).version
    if (version !== V2_LS_VERSION && version !== V2_LS_VERSION_LEGACY) return null

    const stored = parsed as V2PersistedState
    const productStates =
      version === V2_LS_VERSION_LEGACY
        ? migratePersistedProductStates(stored.productStates ?? {})
        : stored.productStates ?? {}

    return {
      version: V2_LS_VERSION,
      savedAt: stored.savedAt,
      productStates,
      selectedHandle: stored.selectedHandle ?? null,
    }
  } catch {
    return null
  }
}

/** Server / hydration snapshot — always empty so SSR and first client paint match. */
export function getV2PersistedServerSnapshot(): null {
  return null
}

/** Cross-tab + same-tab notify after writes (storage event is cross-tab only). */
const v2PersistedListeners = new Set<() => void>()

export function subscribeV2PersistedState(onStoreChange: () => void): () => void {
  v2PersistedListeners.add(onStoreChange)
  if (typeof window === "undefined") {
    return () => {
      v2PersistedListeners.delete(onStoreChange)
    }
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === V2_LS_KEY || e.key === null) onStoreChange()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    v2PersistedListeners.delete(onStoreChange)
    window.removeEventListener("storage", onStorage)
  }
}

function notifyV2PersistedListeners(): void {
  for (const listener of v2PersistedListeners) listener()
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Persist the current v2board state to localStorage.
 * Silently swallows storage quota or security errors.
 */
/** Merge hydrated LS state with in-memory edits — operator overrides win per variant key. */
export function mergeV2ProductStates(
  persisted: Record<string, V2ProductState>,
  current: Record<string, V2ProductState>
): Record<string, V2ProductState> {
  const handles = new Set([...Object.keys(persisted), ...Object.keys(current)])
  const merged: Record<string, V2ProductState> = {}
  for (const handle of handles) {
    const fromDisk = persisted[handle]
    const fromMemory = current[handle]
    if (!fromDisk) {
      if (fromMemory) merged[handle] = fromMemory
      continue
    }
    if (!fromMemory) {
      merged[handle] = fromDisk
      continue
    }
    const mergedState: V2ProductState = {
      ...fromDisk,
      ...fromMemory,
      variantLabelOverrides: {
        ...(fromDisk.variantLabelOverrides ?? {}),
        ...(fromMemory.variantLabelOverrides ?? {}),
      },
      variantColorMeta: mergeVariantColorMeta(fromDisk.variantColorMeta, fromMemory.variantColorMeta),
      rolesByVariant: { ...fromDisk.rolesByVariant, ...fromMemory.rolesByVariant },
      galleriesByVariant: { ...fromDisk.galleriesByVariant, ...fromMemory.galleriesByVariant },
      roleOverrides: { ...(fromDisk.roleOverrides ?? {}), ...(fromMemory.roleOverrides ?? {}) },
      operatorVariantEdits: mergeOperatorVariantEdits(
        fromDisk.operatorVariantEdits,
        fromMemory.operatorVariantEdits
      ),
    }
    const synced = syncVariantLabelOverridesFromMeta(mergedState)
    if (synced) mergedState.variantLabelOverrides = synced
    merged[handle] = mergedState
  }
  return merged
}

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
    notifyV2PersistedListeners()
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
    notifyV2PersistedListeners()
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
