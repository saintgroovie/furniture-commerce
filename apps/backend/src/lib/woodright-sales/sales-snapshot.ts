import type { SalesMode, SalesModifier } from "./sales-modes"
import type { BuyerPurchaseContract } from "./buyer-purchase-contract"

export const SALES_SNAPSHOT_SCHEMA = "woodright_sales_snapshot_v1" as const

export type WoodrightSalesSnapshotV1 = {
  schema: typeof SALES_SNAPSHOT_SCHEMA
  sales_mode: SalesMode
  modifiers: SalesModifier[]
  lead_time_text: string | null
  configuration_summary: string | null
  quote_ref: string | null
  showroom_sample_id: string | null
  customer_visible_promise: string | null
  captured_at: string
}

/** Server-authoritative snapshot - never trust client-supplied blob. */
export function buildSalesSnapshot(input: {
  contract: BuyerPurchaseContract
  configuration_summary?: string | null
  quote_ref?: string | null
  showroom_sample_id?: string | null
  now?: Date
}): WoodrightSalesSnapshotV1 {
  const { contract } = input
  return {
    schema: SALES_SNAPSHOT_SCHEMA,
    sales_mode: contract.sales_mode,
    modifiers: contract.modifiers,
    lead_time_text: contract.lead_time_text,
    configuration_summary: input.configuration_summary ?? null,
    quote_ref: input.quote_ref ?? null,
    showroom_sample_id: input.showroom_sample_id ?? null,
    customer_visible_promise:
      contract.buyer_message ?? contract.availability_label,
    captured_at: (input.now ?? new Date()).toISOString(),
  }
}

export function stripClientSalesSnapshot(
  metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const next = { ...(metadata ?? {}) }
  delete next.woodright_sales_snapshot
  delete next.woodright_sales_snapshot_v1
  return next
}
