/**
 * Media Ops assignment export — v2 assignments subtree stays byte-identical;
 * handoff wrapper adds do_not_auto_apply at the envelope level.
 */
import {
  buildV2ExportJSON,
  copyV2ExportToClipboard,
  downloadV2ExportJSON,
  getV2ExportDisabledReason,
  hasAnyV2Assignments,
} from "../legacy-media-assignment-board-v2/legacy-board-v2-export"
import type { V2ExportJSON } from "../legacy-media-assignment-board-v2/legacy-board-v2-export"
import type { InvItem, ProductRow, V2ProductState } from "../legacy-media-assignment-board-v2/legacy-board-v2-types"

export {
  buildV2ExportJSON,
  copyV2ExportToClipboard,
  downloadV2ExportJSON,
  getV2ExportDisabledReason,
  hasAnyV2Assignments,
}

export type {
  V2ExportJSON,
  V2ExportProduct,
  V2ExportVariant,
  V2ExportMediaRef,
} from "../legacy-media-assignment-board-v2/legacy-board-v2-export"

export type MediaOpsAssignmentExportPayload = {
  export_kind: "assignment_v2"
  do_not_auto_apply: true
  media_ops_handoff: true
  generated_at: string
  /** Byte-identical to `legacy-board-v2-export` output for the same board state. */
  assignment: V2ExportJSON
}

export function buildMediaOpsAssignmentExport(
  productStates: Record<string, V2ProductState>,
  invById: Map<string, InvItem>,
  products: ProductRow[]
): MediaOpsAssignmentExportPayload {
  return {
    export_kind: "assignment_v2",
    do_not_auto_apply: true,
    media_ops_handoff: true,
    generated_at: new Date().toISOString(),
    assignment: buildV2ExportJSON(productStates, invById, products),
  }
}

export async function copyMediaOpsAssignmentToClipboard(
  productStates: Record<string, V2ProductState>,
  invById: Map<string, InvItem>,
  products: ProductRow[]
): Promise<boolean> {
  const text = JSON.stringify(buildMediaOpsAssignmentExport(productStates, invById, products), null, 2)
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function downloadMediaOpsAssignmentJSON(
  productStates: Record<string, V2ProductState>,
  invById: Map<string, InvItem>,
  products: ProductRow[]
): void {
  const text = JSON.stringify(buildMediaOpsAssignmentExport(productStates, invById, products), null, 2)
  const blob = new Blob([text], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  const a = document.createElement("a")
  a.href = url
  a.download = `media-ops-assignment-export-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
