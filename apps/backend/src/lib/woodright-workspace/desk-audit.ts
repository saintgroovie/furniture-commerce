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

/** Action codes only. Payloads stay in the table and are not returned to the desk. */
export async function listDeskAuditActions(
  req: MedusaRequest,
  pairs: Array<{ entityType: string; entityId: string }>
): Promise<Array<{ id: string; action: string; created_at: string | null }>> {
  const usable = pairs.filter((pair) => pair.entityType && pair.entityId).slice(0, 30)
  if (usable.length === 0) return []
  try {
    const sql = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as SqlClient
    const clauses = usable.map(() => "(entity_type = ? and entity_id = ?)").join(" or ")
    const bindings = usable.flatMap((pair) => [pair.entityType, pair.entityId])
    const result = (await sql.raw(
      `select id, action, created_at from woodright_desk_audit where ${clauses} order by created_at desc limit 40`,
      bindings
    )) as { rows?: Array<Record<string, unknown>> }
    const rows = result?.rows ?? []
    return rows.map((row) => ({
      id: String(row.id),
      action: String(row.action ?? ""),
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : typeof row.created_at === "string" ? row.created_at : null,
    }))
  } catch {
    return []
  }
}
