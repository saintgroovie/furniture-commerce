/**
 * Single source of truth for Media Pool preview tier (filter, sort, DOM attrs).
 */

import type { InvItem } from "./legacy-board-v2-types"
import { isStaticallyPreviewable, clientPreview } from "./MediaCardV2"

export const isStaticEffectivePreviewable = isStaticallyPreviewable

/** Runtime-aware: false after proxy 404 / img onError. */
export function isEffectivePreviewable(
  inv: InvItem,
  runtimeFailedIds?: ReadonlySet<string>
): boolean {
  if (runtimeFailedIds?.has(inv.id)) return false
  return isStaticallyPreviewable(inv)
}

export function getPoolPreviewMeta(inv: InvItem) {
  const preview = clientPreview(inv)
  const staticEffective = isStaticallyPreviewable(inv)
  return {
    preview,
    staticEffective,
    status: preview.status,
    reason: preview.reason,
  }
}
