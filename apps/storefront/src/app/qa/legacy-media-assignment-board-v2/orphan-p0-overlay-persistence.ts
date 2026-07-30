import type { OrphanP0OverlayPersistedState } from "./orphan-p0-overlay-types"

export const ORPHAN_P0_OVERLAY_LS_KEY = "woodright:orphan-p0-overlay:v1"

export function loadOrphanP0OverlayState(): OrphanP0OverlayPersistedState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(ORPHAN_P0_OVERLAY_LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as OrphanP0OverlayPersistedState
    if (parsed?.version !== "1") return null
    return parsed
  } catch {
    return null
  }
}

export function getOrphanP0OverlayServerSnapshot(): null {
  return null
}

const orphanListeners = new Set<() => void>()

export function subscribeOrphanP0OverlayState(onStoreChange: () => void): () => void {
  orphanListeners.add(onStoreChange)
  if (typeof window === "undefined") {
    return () => {
      orphanListeners.delete(onStoreChange)
    }
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === ORPHAN_P0_OVERLAY_LS_KEY || e.key === null) onStoreChange()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    orphanListeners.delete(onStoreChange)
    window.removeEventListener("storage", onStorage)
  }
}

function notifyOrphanListeners(): void {
  for (const listener of orphanListeners) listener()
}

export function saveOrphanP0OverlayState(state: OrphanP0OverlayPersistedState): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(ORPHAN_P0_OVERLAY_LS_KEY, JSON.stringify(state))
    notifyOrphanListeners()
  } catch {
    /* quota / security */
  }
}

export function makeEmptyOrphanP0OverlayState(): OrphanP0OverlayPersistedState {
  return {
    version: "1",
    savedAt: new Date().toISOString(),
    focusedPackIndex: null,
    focusedCatalogHandle: null,
    routingNotes: {},
  }
}
