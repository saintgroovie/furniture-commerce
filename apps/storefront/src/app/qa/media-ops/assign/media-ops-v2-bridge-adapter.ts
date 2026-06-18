import { clearV2PersistedState } from "../../legacy-media-assignment-board-v2/legacy-board-v2-persistence"
import type { V2ShellBridgeSnapshot } from "../../legacy-media-assignment-board-v2/legacy-board-v2-shell-bridge"
import {
  copyMediaOpsAssignmentToClipboard,
  downloadMediaOpsAssignmentJSON,
  getV2ExportDisabledReason,
  hasAnyV2Assignments,
} from "../media-ops-export"
import type { MediaOpsAssignBridge } from "../media-ops-assign-bridge"

export function buildMediaOpsBridgeFromV2Snapshot(
  snapshot: V2ShellBridgeSnapshot
): MediaOpsAssignBridge {
  const { productStates, invById, products, selectedHandle, savedAt, boardStatus } = snapshot
  const assignedCount = Object.values(productStates).filter(
    (s) =>
      Object.values(s.rolesByVariant).some((r) => Object.values(r).some((v) => !!v)) ||
      Object.values(s.galleriesByVariant).some((g) => g.length > 0)
  ).length
  const totalMainCount = Object.values(productStates).reduce((acc, s) => {
    return acc + Object.values(s.rolesByVariant).filter((r) => !!r.main).length
  }, 0)

  return {
    boardStatus,
    savedAt,
    exportEnabled: hasAnyV2Assignments(productStates),
    exportBlockedReason: getV2ExportDisabledReason(productStates, selectedHandle),
    assignedCount,
    totalMainCount,
    onCopy: () => copyMediaOpsAssignmentToClipboard(productStates, invById, products),
    onDownload: () => downloadMediaOpsAssignmentJSON(productStates, invById, products),
    onReset: () => {
      clearV2PersistedState()
      snapshot.onReset()
    },
  }
}
