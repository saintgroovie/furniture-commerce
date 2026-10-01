import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { resolveStaffAccess, safeAdminFallbackUrl } from "../../../../lib/woodright-workspace/permissions"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const actorId = (req as MedusaRequest & { auth_context?: { actor_id?: string } }).auth_context?.actor_id
  let email: string | null = null
  if (actorId) {
    try {
      const userModule = req.scope.resolve("user") as {
        retrieveUser: (id: string) => Promise<{ email?: string | null }>
      }
      const user = await userModule.retrieveUser(actorId)
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
  res.json({
    access,
    medusa_admin_url: access.escape_hatch
      ? safeAdminFallbackUrl(process.env.WOODRIGHT_MEDUSA_ADMIN_URL)
      : null,
  })
}
