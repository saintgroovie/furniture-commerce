import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { decideInbox } from "../../../../../lib/woodright-mail/inbox-state"
import { mailConnectorEnabled } from "../../../../../lib/woodright-workspace/mail-boundary"
import { accessAllows } from "../../../../../lib/woodright-workspace/capabilities"
import { resolveStaffAccess } from "../../../../../lib/woodright-workspace/permissions"
import { COMMUNICATION_MODULE } from "../../../../../modules/communication"

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const actorId = (req as MedusaRequest & { auth_context?: { actor_id?: string } }).auth_context?.actor_id ?? null
  let email: string | null = null
  if (actorId) {
    try {
      const user = await (req.scope.resolve("user") as {
        retrieveUser: (id: string) => Promise<{ email?: string | null }>
      }).retrieveUser(actorId)
      email = user?.email ?? null
    } catch {
      email = null
    }
  }
  const access = resolveStaffAccess({
    email,
    ownerEmailsRaw: process.env.WOODRIGHT_WORKSPACE_OWNER_EMAILS,
    mailEmailsRaw: process.env.WOODRIGHT_WORKSPACE_MAIL_EMAILS,
  })
  let connectionStatus: "disabled" | "configured" | "error" | null = null
  try {
    const rows = await (req.scope.resolve(COMMUNICATION_MODULE) as {
      listMailConnections: (filters: object, config?: object) => Promise<Array<Record<string, unknown>>>
    }).listMailConnections({}, { take: 1 })
    const status = text(rows?.[0]?.status)
    if (status === "disabled" || status === "configured" || status === "error") connectionStatus = status
  } catch {
    connectionStatus = null
  }
  const decision = decideInbox({
    connectionStatus,
    permitted: Boolean(actorId) && accessAllows(access, "mail.view"),
    liveConnector: mailConnectorEnabled(),
  })
  res.json({ visible: decision.visible, reason: decision.reason })
}
