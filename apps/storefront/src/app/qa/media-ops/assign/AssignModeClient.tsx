"use client"

import { useCallback, useMemo, useState } from "react"
import { LegacyMediaBoardV2Client } from "../../legacy-media-assignment-board-v2/LegacyMediaBoardV2Client"
import type { V2ShellBridgeSnapshot } from "../../legacy-media-assignment-board-v2/legacy-board-v2-shell-bridge"
import { useRegisterMediaOpsAssignBridge } from "../media-ops-assign-bridge"
import { buildMediaOpsBridgeFromV2Snapshot } from "./media-ops-v2-bridge-adapter"

export type AssignModeClientProps = {
  initialHandle?: string | null
  overlayMode?: string | null
  highlight?: string | null
  from?: string | null
  legacy?: string | null
}

export function AssignModeClient({
  initialHandle = null,
  overlayMode = null,
  highlight = null,
  from = null,
  legacy = null,
}: AssignModeClientProps) {
  const [snapshot, setSnapshot] = useState<V2ShellBridgeSnapshot | null>(null)

  const onShellBridgeSnapshot = useCallback((next: V2ShellBridgeSnapshot | null) => {
    setSnapshot(next)
  }, [])

  const bridge = useMemo(
    () => (snapshot ? buildMediaOpsBridgeFromV2Snapshot(snapshot) : null),
    [snapshot]
  )

  useRegisterMediaOpsAssignBridge(bridge)

  return (
    <LegacyMediaBoardV2Client
      embeddedInShell
      initialHandle={initialHandle}
      overlayMode={overlayMode}
      highlightInventoryId={highlight}
      navFrom={from}
      legacyQuery={legacy}
      onShellBridgeSnapshot={onShellBridgeSnapshot}
    />
  )
}
