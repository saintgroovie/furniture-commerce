import {
  buildBuyerTimeline,
  deriveCustomerOrderStatus,
  mapDeliveryBuyerLabel,
  mapPaymentBuyerLabel,
} from "./derive-customer-status"
import {
  STAGE_BUYER_DESCRIPTION,
  STAGE_BUYER_LABEL,
  type OrderProcessStage,
} from "./stages"
import {
  toStoreProcessEvent,
  type ProcessEventRecord,
  type ProcessRecord,
} from "./transition"

export type BuyerProcessDtoInput = {
  process: ProcessRecord
  events: ProcessEventRecord[]
  display_id?: string | number | null
  medusa_payment_status?: string | null
  payment_link_status?: string | null
  medusa_fulfillment_status?: string | null
  tracking?: {
    carrier?: string | null
    tracking_number?: string | null
    tracking_url?: string | null
  } | null
  canceled?: boolean
}

/** Buyer-safe Store DTO - never includes internal_note. */
export function buildBuyerProcessDto(input: BuyerProcessDtoInput) {
  const stage = input.process.current_stage
  const payment = mapPaymentBuyerLabel({
    medusa_payment_status: input.medusa_payment_status,
    payment_link_status: input.payment_link_status,
  })
  const delivery = mapDeliveryBuyerLabel({
    medusa_fulfillment_status: input.medusa_fulfillment_status,
    tracking: input.tracking ?? null,
  })
  const customer_status = deriveCustomerOrderStatus({
    stage,
    payment,
    delivery,
    canceled: input.canceled,
    estimated_date: input.process.estimated_completion_date,
  })
  const timeline = buildBuyerTimeline({
    stage,
    delivery,
    canceled: input.canceled,
  })

  const events = input.events
    .filter((e) => e.customer_visible)
    .map(toStoreProcessEvent)

  return {
    order_id: input.process.order_id,
    display_id: input.display_id ?? null,
    customer_status,
    payment,
    production: {
      stage,
      label: STAGE_BUYER_LABEL[stage as OrderProcessStage] ?? stage,
      description:
        STAGE_BUYER_DESCRIPTION[stage as OrderProcessStage] ?? null,
      customer_message: input.process.customer_message,
      estimated_completion_date: input.process.estimated_completion_date,
    },
    delivery,
    timeline,
    events,
  }
}
