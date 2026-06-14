import { LS_KEY, type GateRow } from "./business-gate-board-types"

export type PersistedGateState = {
  saved_at: string
  rows: Partial<GateRow>[]
}

export function loadGateState(): PersistedGateState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersistedGateState
  } catch {
    return null
  }
}

export function saveGateState(rows: GateRow[]): void {
  if (typeof window === "undefined") return
  const payload: PersistedGateState = {
    saved_at: new Date().toISOString(),
    rows: rows.map((r) => ({
      handle: r.handle,
      workbook_row_key: r.workbook_row_key,
      workbook_product_code_ww: r.workbook_product_code_ww,
      price: r.price,
      currency: r.currency,
      product_type: r.product_type,
      variant_strategy: r.variant_strategy,
      publish_policy: r.publish_policy,
      operator_decision: r.operator_decision,
      operator_note: r.operator_note,
    })),
  }
  localStorage.setItem(LS_KEY, JSON.stringify(payload))
}

export function clearGateState(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(LS_KEY)
}

export function mergePersistedRows(base: GateRow[], persisted: PersistedGateState | null): GateRow[] {
  if (!persisted?.rows?.length) return base
  const byHandle = new Map(persisted.rows.map((r) => [r.handle, r]))
  return base.map((row) => {
    const p = byHandle.get(row.handle)
    if (!p) return row
    return { ...row, ...p, do_not_auto_apply: true as const }
  })
}
