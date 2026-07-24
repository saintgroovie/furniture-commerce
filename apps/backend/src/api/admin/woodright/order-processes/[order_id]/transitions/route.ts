import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createHash } from "node:crypto"
import { ORDER_PROCESS_MODULE } from "../../../../../../modules/order-process"
import {
  ensureOrderProcess,
  type OrderProcessServiceLike,
} from "../../../../../../lib/woodright-order-process/ensure-process"
import { applyAndPersistProcessTransition } from "../../../../../../lib/woodright-order-process/apply-transition"
import {
  isOrderProcessStage,
  type OrderProcessStage,
} from "../../../../../../lib/woodright-order-process/stages"

type SqlClient = {
  raw: (sql: string, bindings?: unknown[]) => Promise<{ rows?: unknown[] }>
  transaction?: <T>(fn: (trx: SqlClient) => Promise<T>) => Promise<T>
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params.order_id as string
  const body = req.body as {
    to_stage?: unknown
    expected_version?: unknown
    estimated_completion_date?: string | null
    customer_message?: string | null
    internal_note?: string | null
    paused_reason?: string | null
    notify_customer?: boolean
    correction?: boolean
    correction_reason?: string | null
    idempotency_key?: string | null
  }

  if (!isOrderProcessStage(body.to_stage)) {
    res.status(400).json({
      code: "INVALID_STAGE",
      message: "Некорректный этап производства",
    })
    return
  }
  if (
    typeof body.expected_version !== "number" ||
    !Number.isFinite(body.expected_version)
  ) {
    res.status(400).json({
      code: "EXPECTED_VERSION_REQUIRED",
      message: "Укажите expected_version",
    })
    return
  }

  const service = req.scope.resolve(
    ORDER_PROCESS_MODULE
  ) as unknown as OrderProcessServiceLike

  const { process } = await ensureOrderProcess(service, orderId, {
    source: "admin_ensure",
    actor_type: "admin",
  })

  let medusaCanceled = false
  try {
    const orderModule = req.scope.resolve(Modules.ORDER) as {
      retrieveOrder: (id: string) => Promise<Record<string, unknown>>
    }
    const order = await orderModule.retrieveOrder(orderId)
    medusaCanceled = Boolean(
      order?.canceled_at || order?.status === "canceled"
    )
  } catch {
    medusaCanceled = false
  }

  const actorId =
    (req as MedusaRequest & { auth_context?: { actor_id?: string } })
      .auth_context?.actor_id ?? null

  const rawKey =
    typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : ""
  const fingerprint = JSON.stringify({
    to_stage: body.to_stage,
    expected_version: body.expected_version,
    estimated_completion_date: body.estimated_completion_date ?? null,
    customer_message: body.customer_message ?? null,
    internal_note: body.internal_note ?? null,
    paused_reason: body.paused_reason ?? null,
    notify_customer: Boolean(body.notify_customer),
    correction: Boolean(body.correction),
    correction_reason: body.correction_reason ?? null,
  })
  const idempotency_key = rawKey
    ? `${rawKey}::${createHash("sha256").update(fingerprint).digest("hex")}`
    : null

  let sql: SqlClient | undefined
  try {
    sql = req.scope.resolve(
      ContainerRegistrationKeys.PG_CONNECTION
    ) as SqlClient
  } catch {
    sql = undefined
  }

  const result = await applyAndPersistProcessTransition(
    service,
    process,
    {
      to_stage: body.to_stage as OrderProcessStage,
      expected_version: body.expected_version,
      estimated_completion_date: body.estimated_completion_date,
      customer_message: body.customer_message,
      internal_note: body.internal_note,
      paused_reason: body.paused_reason,
      notify_customer: Boolean(body.notify_customer),
      correction: Boolean(body.correction),
      correction_reason: body.correction_reason,
      idempotency_key,
      actor_type: "admin",
      actor_id: actorId,
      actor_display: null,
      source: "admin_api",
      medusa_order_canceled: medusaCanceled,
      recipient_key: `order:${orderId}`,
    },
    { sql }
  )

  if (!result.ok) {
    res.status(result.http).json({
      code: result.code,
      message: result.message,
    })
    return
  }

  res.json({
    order_process: result.process,
    event: result.event ?? null,
    replay: Boolean(result.replay),
  })
}
