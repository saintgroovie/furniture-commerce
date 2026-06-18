"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { V2LoadStatus } from "../legacy-media-assignment-board-v2/legacy-board-v2-types"

export type MediaOpsAssignBridge = {
  boardStatus: V2LoadStatus | "error"
  savedAt: string | null
  exportEnabled: boolean
  exportBlockedReason: string | null
  assignedCount: number
  totalMainCount: number
  onCopy: () => Promise<boolean>
  onDownload: () => void
  onReset: () => void
}

type BridgeContextValue = {
  bridge: MediaOpsAssignBridge | null
  setBridge: (bridge: MediaOpsAssignBridge | null) => void
}

const MediaOpsAssignBridgeContext = createContext<BridgeContextValue | null>(null)

export function MediaOpsAssignBridgeProvider({ children }: { children: ReactNode }) {
  const [bridge, setBridgeState] = useState<MediaOpsAssignBridge | null>(null)
  const setBridge = useCallback((next: MediaOpsAssignBridge | null) => {
    setBridgeState(next)
  }, [])
  const value = useMemo(() => ({ bridge, setBridge }), [bridge, setBridge])
  return (
    <MediaOpsAssignBridgeContext.Provider value={value}>
      {children}
    </MediaOpsAssignBridgeContext.Provider>
  )
}

export function useMediaOpsAssignBridge(): BridgeContextValue | null {
  return useContext(MediaOpsAssignBridgeContext)
}

/** Stable setter for media-ops assign adapter (avoids ctx identity churn). */
export function useMediaOpsSetAssignBridge(): ((bridge: MediaOpsAssignBridge | null) => void) | null {
  return useContext(MediaOpsAssignBridgeContext)?.setBridge ?? null
}

/** Register assign bridge from media-ops adapter (cleared on unmount). */
export function useRegisterMediaOpsAssignBridge(bridge: MediaOpsAssignBridge | null): void {
  const setBridge = useMediaOpsSetAssignBridge()
  useEffect(() => {
    if (!setBridge) return
    setBridge(bridge)
    return () => {
      setBridge(null)
    }
  }, [setBridge, bridge])
}
