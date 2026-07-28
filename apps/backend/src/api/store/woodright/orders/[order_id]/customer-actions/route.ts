import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ORDER_PROCESS_MODULE } from "../../../../../../modules/order-process"
import {
  ensureOrderProcess,
  type OrderProcessServiceLike,
} from "../../../../../../lib/woodright-order-process/ensure-process"
import { applyAndPersistProcessTransition } from "../../../../../../lib/woodright-order-process/apply-transition"
import {
  isAccessExpired,
  tokensMatch,
} from "../../../../../../lib/woodright-order-process/guest-access-token"

function extractToken(req: MedusaRequest): string | null {
  const q = req.query.token
  if (typeof q === "string" && q.trim()) return q.trim()
  const auth = req.headers.authorization
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    const t = auth.slice(7).trim()
    return t || null
  }
  const body = req.body as { token?: string } | undefined
  if (typeof body?.token === "string" && body.token.trim()) {
    return body.token.trim()
  }
  return null
}

/**
 * Customer actions on awaiting_customer_approval.
 * MVP: confirm → confirmed; request_changes → specification_in_progress.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const orderId = req.params.order_id as string
  const body = req.body as {
    action?: string
    comment?: string
    idempotency_key?: string
    expected_version?: number
  }

  const deny = () => {
    res.status(404).json({
      code: "ORDER_NOT_FOUND",
      message: "Не удалось открыть заказ",
    })
  }

  const token = extractToken(req)
  if (!token) {
    deny()
    return
  }

  const action = body.action
  if (action !== "confirm" && action !== "request_changes") {
    res.status(400).json({
      code: "INVALID_ACTION",
      message: "Доступны действия confirm и request_changes",
    })
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

  if (
    !access?.token_hash ||
    access.revoked_at ||
    isAccessExpired(access.expires_at) ||
    !tokensMatch(token, access.token_hash)
  ) {
    deny()
    return
  }

  const { process } = await ensureOrderProcess(service, orderId)
  if (process.current_stage !== "awaiting_customer_approval") {
    res.status(400).json({
      code: "ACTION_NOT_AVAILABLE",
      message: "Сейчас подтверждение комплектации не требуется",
    })
    return
  }

  const expected =
    typeof body.expected_version === "number"
      ? body.expected_version
      : process.version

  const to_stage =
    action === "confirm" ? "confirmed" : "specification_in_progress"

  let sql:
    | {
        raw: (sql: string, bindings?: unknown[]) => Promise<{ rows?: unknown[] }>
        transaction?: <T>(fn: (trx: never) => Promise<T>) => Promise<T>
      }
    | undefined
  try {
    sql = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as typeof sql
  } catch {
    sql = undefined
  }

  const result = await applyAndPersistProcessTransition(
    service,
    process,
    {
      to_stage,
      expected_version: expected,
      customer_message: body.comment ?? null,
      notify_customer: false,
      actor_type: "customer",
      source: "customer_api",
      idempotency_key: body.idempotency_key ?? null,
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
