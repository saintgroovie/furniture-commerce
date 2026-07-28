/**
 * Canonical Medusa order existence gate for Woodright lifecycle.
 * Fail-closed: missing → not_found; unexpected query errors → query_failed.
 * Does not load customer / payment / address PII.
 */

export type OrderModuleLike = {
  retrieveOrder: (
    id: string,
    config?: Record<string, unknown>
  ) => Promise<Record<string, unknown>>
}

export type OrderExistenceOk = { ok: true; order_id: string }
export type OrderExistenceFail =
  | { ok: false; kind: "not_found" }
  | { ok: false; kind: "query_failed" }

export type OrderExistenceResult = OrderExistenceOk | OrderExistenceFail

function looksLikeNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    const msg = String(err ?? "").toLowerCase()
    return msg.includes("not found") || msg.includes("does not exist")
  }
  const e = err as {
    type?: string
    code?: string
    name?: string
    message?: string
    status?: number
    __isMedusaError?: boolean
  }
  if (e.status === 404) return true
  const blob = `${e.type ?? ""} ${e.code ?? ""} ${e.name ?? ""} ${e.message ?? ""}`.toLowerCase()
  return (
    blob.includes("not_found") ||
    blob.includes("not found") ||
    blob.includes("does not exist") ||
    blob.includes("entity_not_found")
  )
}

/**
 * Prove a real Medusa order exists for `orderId` (exact id match).
 * Empty / whitespace ids are treated as not_found (no write path).
 */
export async function assertMedusaOrderExists(
  orderModule: OrderModuleLike,
  orderId: string
): Promise<OrderExistenceResult> {
  const id = typeof orderId === "string" ? orderId.trim() : ""
  if (!id) {
    return { ok: false, kind: "not_found" }
  }

  try {
    const order = await orderModule.retrieveOrder(id, {
      select: ["id"],
    })
    const retrieved = order?.id != null ? String(order.id) : ""
    if (!retrieved || retrieved !== id) {
      return { ok: false, kind: "not_found" }
    }
    return { ok: true, order_id: retrieved }
  } catch (err) {
    if (looksLikeNotFound(err)) {
      return { ok: false, kind: "not_found" }
    }
    return { ok: false, kind: "query_failed" }
  }
}

export function orderExistenceHttp(
  result: OrderExistenceFail
): { status: number; code: string; message: string } {
  if (result.kind === "not_found") {
    return {
      status: 404,
      code: "ORDER_NOT_FOUND",
      message: "Заказ не найден",
    }
  }
  return {
    status: 503,
    code: "ORDER_LOOKUP_FAILED",
    message: "Не удалось проверить заказ",
  }
}
