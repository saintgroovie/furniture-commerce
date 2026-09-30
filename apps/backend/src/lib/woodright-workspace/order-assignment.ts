import type { MedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

type SqlClient = {
  raw: (sql: string, bindings?: unknown[]) => Promise<{ rows?: Array<Record<string, unknown>> }>
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

export async function readOrderAssignee(req: MedusaRequest, orderId: string): Promise<string | null> {
  try {
    const sql = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as SqlClient
    const result = await sql.raw(
      `select assignee_id from woodright_order_assignment where order_id = ? and deleted_at is null limit 1`,
      [orderId]
    )
    return text(result.rows?.[0]?.assignee_id)
  } catch {
    return null
  }
}

export async function writeOrderAssignee(
  req: MedusaRequest,
  orderId: string,
  assigneeId: string | null,
  actorId: string
): Promise<"ok" | "unavailable"> {
  try {
    const sql = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as SqlClient
    await sql.raw(
      `insert into woodright_order_assignment (order_id, assignee_id, updated_by, updated_at)
       values (?, ?, ?, now())
       on conflict (order_id) do update
       set assignee_id = excluded.assignee_id, updated_by = excluded.updated_by, updated_at = now(), deleted_at = null`,
      [orderId, assigneeId, actorId]
    )
    return "ok"
  } catch {
    return "unavailable"
  }
}
