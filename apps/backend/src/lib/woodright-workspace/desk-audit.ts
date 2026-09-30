import type { MedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { randomUUID } from "node:crypto"

type SqlClient = {
  raw: (sql: string, bindings?: unknown[]) => Promise<unknown>
}

export async function appendDeskAudit(
  req: MedusaRequest,
  input: {
    actorId: string
    actorEmail: string | null
    entityType: string
    entityId: string
    action: string
    before?: unknown
    after?: unknown
  }
): Promise<boolean> {
  try {
    const sql = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as SqlClient
    await sql.raw(
      `insert into woodright_desk_audit
        (id, actor_id, actor_email, entity_type, entity_id, action, before_json, after_json, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, now())`,
      [
        `audit_${randomUUID()}`,
        input.actorId,
        input.actorEmail,
        input.entityType,
        input.entityId,
        input.action,
        input.before == null ? null : JSON.stringify(input.before),
        input.after == null ? null : JSON.stringify(input.after),
      ]
    )
    return true
  } catch {
    return false
  }
}
