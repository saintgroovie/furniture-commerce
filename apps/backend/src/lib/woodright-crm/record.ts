import type { MedusaRequest } from "@medusajs/framework/http"
import { appendDeskAudit } from "../woodright-workspace/desk-audit"
import { auditSnapshot } from "./audit-snapshot"

export type CrmAuditInput = {
  actorId: string
  actorEmail?: string | null
  entityType: string
  entityId: string
  action: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

/** Actor email is never stored, even if the caller has it. */
export function crmAuditInsert(input: CrmAuditInput) {
  return {
    actorId: input.actorId,
    actorEmail: null,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    before: auditSnapshot(input.before),
    after: auditSnapshot(input.after),
  }
}

export async function recordCrmAudit(req: MedusaRequest, input: CrmAuditInput): Promise<boolean> {
  return appendDeskAudit(req, crmAuditInsert(input))
}
