/**
 * Single source of truth for Media Pool preview tier (filter, sort, DOM attrs).
 */

import type { InvItem } from "./legacy-board-v2-types"
import type { LegacyMediaPreviewRecoveryEntry } from "./legacy-board-v2-preview-recovery-types"
import {
  isLegacyBoardClientPreviewable,
  resolveLegacyBoardClientPreview,
} from "./legacy-board-v2-client-preview"

export function isStaticEffectivePreviewable(
  inv: InvItem,
  recoveryById?: ReadonlyMap<string, LegacyMediaPreviewRecoveryEntry>
): boolean {
  const recovery = recoveryById?.get(inv.id) ?? null
  return isLegacyBoardClientPreviewable(inv, recovery)
}

/** Runtime-aware: false after proxy 404 / img onError. */
export function isEffectivePreviewable(
  inv: InvItem,
  runtimeFailedIds?: ReadonlySet<string>,
  recoveryById?: ReadonlyMap<string, LegacyMediaPreviewRecoveryEntry>
): boolean {
  if (runtimeFailedIds?.has(inv.id)) return false
  return isStaticEffectivePreviewable(inv, recoveryById)
}

export function getPoolPreviewMeta(
  inv: InvItem,
  recoveryById?: ReadonlyMap<string, LegacyMediaPreviewRecoveryEntry>
) {
  const recovery = recoveryById?.get(inv.id) ?? null
  const preview = resolveLegacyBoardClientPreview(inv, recovery)
  const staticEffective = isLegacyBoardClientPreviewable(inv, recovery)
  return {
    preview,
    staticEffective,
    status: preview.status,
    reason: preview.reason,
  }
}
