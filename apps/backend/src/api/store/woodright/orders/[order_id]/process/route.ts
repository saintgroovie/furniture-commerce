import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { ORDER_PROCESS_MODULE } from "../../../../../../modules/order-process"
import { PAYMENT_LINK_MODULE } from "../../../../../../modules/payment-link"
import {
  asProcessRecord,
  ensureOrderProcess,
  type OrderProcessServiceLike,
} from "../../../../../../lib/woodright-order-process/ensure-process"
import { buildBuyerProcessDto } from "../../../../../../lib/woodright-order-process/buyer-process-dto"
import {
  isAccessExpired,
  tokensMatch,
} from "../../../../../../lib/woodright-order-process/guest-access-token"
import type { ProcessEventRecord } from "../../../../../../lib/woodright-order-process/transition"

function extractToken(req: MedusaRequest): string | null {
  const q = req.query.token
  if (typeof q === "string" && q.trim()) return q.trim()
  const auth = req.headers.authorization
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    const t = auth.slice(7).trim()
    return t || null
  }
  return null
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params.order_id as string
  const token = extractToken(req)
  // Uniform 404: no existence / auth oracle for guest order access (IDOR-safe).
  const deny = () => {
    res.status(404).json({
      code: "ORDER_NOT_FOUND",
      message: "Не удалось открыть заказ",
    })
  }
  if (!token) {
    deny()
    return
  }

  const service = req.scope.resolve(
    ORDER_PROCESS_MODULE
  ) as unknown as OrderProcessServiceLike

  const accesses = await service.listWoodrightOrderAccesses({
    order_id: orderId,
  })
  const access = accesses?.[0] as
    | {
        token_hash?: string
        expires_at?: string | Date
        revoked_at?: string | Date | null
      }
    | undefined

  if (!access?.token_hash) {
    deny()
    return
  }
  if (access.revoked_at) {
    deny()
    return
  }
  if (isAccessExpired(access.expires_at)) {
    deny()
    return
  }
  if (!tokensMatch(token, access.token_hash)) {
    deny()
    return
  }

  const { process } = await ensureOrderProcess(service, orderId, {
    source: "store_ensure",
  })

  const eventRows = await service.listWoodrightOrderProcessEvents(
    { process_id: process.id },
    { order: { created_at: "DESC" } }
  )

  const events = (eventRows ?? []).map((row) => {
    const r = row as Record<string, unknown>
    return {
      id: String(r.id),
      process_id: String(r.process_id),
      order_id: String(r.order_id),
      previous_stage: (r.previous_stage as ProcessEventRecord["previous_stage"]) ?? null,
      next_stage: r.next_stage as ProcessEventRecord["next_stage"],
      event_type: String(r.event_type),
      actor_type: r.actor_type as ProcessEventRecord["actor_type"],
      actor_id: (r.actor_id as string | null) ?? null,
      actor_display: (r.actor_display as string | null) ?? null,
      customer_visible: Boolean(r.customer_visible),
      customer_message: (r.customer_message as string | null) ?? null,
      internal_note: (r.internal_note as string | null) ?? null,
      notification_requested: Boolean(r.notification_requested),
      source: String(r.source ?? ""),
      idempotency_key: (r.idempotency_key as string | null) ?? null,
      correlation_id: (r.correlation_id as string | null) ?? null,
      created_at: String(r.created_at ?? new Date().toISOString()),
    } satisfies ProcessEventRecord
  })

  let displayId: string | number | null = null
  let paymentStatus: string | null = null
  let fulfillmentStatus: string | null = null
  let canceled = false
  try {
    const orderModule = req.scope.resolve(Modules.ORDER) as unknown as {
      retrieveOrder: (
        id: string,
        config?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>
    }
    const order = await orderModule.retrieveOrder(orderId, {
      select: [
        "id",
        "display_id",
        "status",
        "payment_status",
        "fulfillment_status",
        "canceled_at",
      ],
    })
    displayId = (order.display_id as string | number | undefined) ?? null
    paymentStatus = (order.payment_status as string) ?? null
    fulfillmentStatus = (order.fulfillment_status as string) ?? null
    canceled = Boolean(order.canceled_at || order.status === "canceled")
  } catch {
    // still return process DTO
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

  const dto = buildBuyerProcessDto({
    process: asProcessRecord(process as unknown as Record<string, unknown>),
    events,
    display_id: displayId,
    medusa_payment_status: paymentStatus,
    payment_link_status: paymentLinkStatus,
    medusa_fulfillment_status: fulfillmentStatus,
    canceled,
  })

  // Hard strip: never leak internal notes
  const body = JSON.parse(JSON.stringify(dto)) as Record<string, unknown>
  delete body.internal_note
  if (Array.isArray(body.events)) {
    body.events = body.events.map((e) => {
      const evt = { ...(e as Record<string, unknown>) }
      delete evt.internal_note
      return evt
    })
  }

  res.json(body)
}
