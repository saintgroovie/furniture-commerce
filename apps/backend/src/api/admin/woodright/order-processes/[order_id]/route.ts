import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { ORDER_PROCESS_MODULE } from "../../../../../modules/order-process"
import { PAYMENT_LINK_MODULE } from "../../../../../modules/payment-link"
import {
  ensureOrderProcess,
  type OrderProcessServiceLike,
} from "../../../../../lib/woodright-order-process/ensure-process"
import { orderExistenceHttp } from "../../../../../lib/woodright-order-process/assert-medusa-order-exists"
import { allowedTransitionsForAdmin } from "../../../../../lib/woodright-order-process/transition"
import {
  mapDeliveryBuyerLabel,
  mapPaymentBuyerLabel,
} from "../../../../../lib/woodright-order-process/derive-customer-status"
import {
  STAGE_OWNER_LABEL,
  type OrderProcessStage,
} from "../../../../../lib/woodright-order-process/stages"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params.order_id as string
  const service = req.scope.resolve(
    ORDER_PROCESS_MODULE
  ) as unknown as OrderProcessServiceLike
  const orderModule = req.scope.resolve(Modules.ORDER) as unknown as {
    retrieveOrder: (
      id: string,
      config?: Record<string, unknown>
    ) => Promise<Record<string, unknown>>
  }

  const ensured = await ensureOrderProcess(service, orderModule, orderId, {
    source: "admin_ensure",
    actor_type: "admin",
  })
  if (!ensured.ok) {
    const http = orderExistenceHttp(ensured)
    res.status(http.status).json({
      code: http.code,
      message: http.message,
    })
    return
  }
  const { process } = ensured

  const events = await service.listWoodrightOrderProcessEvents(
    { process_id: process.id },
    { order: { created_at: "DESC" } }
  )

  let medusaOrder: Record<string, unknown> | null = null
  let canceled = false
  try {
    medusaOrder = await orderModule.retrieveOrder(orderId, {
      select: [
        "id",
        "display_id",
        "status",
        "payment_status",
        "fulfillment_status",
        "canceled_at",
      ],
    })
    canceled = Boolean(
      medusaOrder?.canceled_at || medusaOrder?.status === "canceled"
    )
  } catch {
    medusaOrder = null
  }

  let paymentLinkStatus: string | null = null
  try {
    const paymentLinkService = req.scope.resolve(PAYMENT_LINK_MODULE) as {
      listPaymentLinks: (
        filters?: Record<string, unknown>
      ) => Promise<Array<{ status?: string }>>
    }
    const links = await paymentLinkService.listPaymentLinks({
      entity_type: "order",
      entity_id: orderId,
    })
    paymentLinkStatus = links?.[0]?.status ?? null
  } catch {
    paymentLinkStatus = null
  }

  const payment = mapPaymentBuyerLabel({
    medusa_payment_status: (medusaOrder?.payment_status as string) ?? null,
    payment_link_status: paymentLinkStatus,
  })
  const delivery = mapDeliveryBuyerLabel({
    medusa_fulfillment_status:
      (medusaOrder?.fulfillment_status as string) ?? null,
  })

  const allowed = allowedTransitionsForAdmin(process, canceled)

  res.json({
    order_process: {
      ...process,
      stage_label:
        STAGE_OWNER_LABEL[process.current_stage as OrderProcessStage] ??
        process.current_stage,
    },
    events: events ?? [],
    payment,
    delivery,
    medusa: {
      display_id: medusaOrder?.display_id ?? null,
      status: medusaOrder?.status ?? null,
      payment_status: medusaOrder?.payment_status ?? null,
      fulfillment_status: medusaOrder?.fulfillment_status ?? null,
      canceled,
    },
    allowed_transitions: allowed,
  })
}
