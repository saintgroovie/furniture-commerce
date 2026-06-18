/**
 * Neutral shell integration snapshot — no media-ops imports.
 * Media Ops adapter reads this and builds its own export/bridge layer.
 */

import type { InvItem, ProductRow, V2LoadStatus, V2ProductState } from "./legacy-board-v2-types"

export type V2ShellBridgeSnapshot = {
  boardStatus: V2LoadStatus | "error"
  savedAt: string | null
  productStates: Record<string, V2ProductState>
  invById: Map<string, InvItem>
  products: ProductRow[]
  selectedHandle: string | null
  onReset: () => void
}
