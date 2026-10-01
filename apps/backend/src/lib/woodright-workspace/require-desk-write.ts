import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { decideDeskWrite, type DeskAction, type DeskWriteDecision } from "./capabilities"

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

/** Allows the write when any listed action is permitted. Writes the response only on a full deny. */
export async function requireDeskWriteAny(
  req: MedusaRequest,
  res: MedusaResponse,
  actions: DeskAction[]
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
  const ownerEmailsRaw = process.env.WOODRIGHT_WORKSPACE_OWNER_EMAILS
  let denied: DeskWriteDecision | null = null
  for (const action of actions) {
    const decision = decideDeskWrite({ actorId, email, action, ownerEmailsRaw })
    if (decision.ok) return { actorId: actorId as string, email: decision.email }
    denied = decision
  }
  const fallback = denied ?? { ok: false as const, status: 403 as const, message: "Недостаточно прав" }
  res.status(fallback.status).json({ message: fallback.message })
  return null
}
