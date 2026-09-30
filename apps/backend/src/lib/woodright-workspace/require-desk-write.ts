import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { decideDeskWrite, type DeskAction } from "./capabilities"

type ActorRequest = MedusaRequest & { auth_context?: { actor_id?: string } }

export async function requireDeskWrite(
  req: MedusaRequest,
  res: MedusaResponse,
  action: DeskAction
): Promise<{ actorId: string; email: string | null } | null> {
  const actorId = (req as ActorRequest).auth_context?.actor_id ?? null
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
  const decision = decideDeskWrite({
    actorId,
    email,
    action,
    ownerEmailsRaw: process.env.WOODRIGHT_WORKSPACE_OWNER_EMAILS,
  })
  if (!decision.ok) {
    res.status(decision.status).json({ message: decision.message })
    return null
  }
  return { actorId: actorId as string, email: decision.email }
}
