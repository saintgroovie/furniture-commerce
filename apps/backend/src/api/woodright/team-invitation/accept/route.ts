import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { acceptInviteWorkflow } from "@medusajs/core-flows";
export const AUTHENTICATE = false;
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const context = (
      req as MedusaRequest & {
        auth_context?: { actor_id?: string; auth_identity_id?: string };
      }
    ).auth_context;
    const body = req.body as { token?: unknown; name?: unknown };
    if (
      !context?.auth_identity_id ||
      context.actor_id ||
      typeof body.token !== "string" ||
      body.token.length > 4096 ||
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.length > 160
    )
      throw Error();
    const service = req.scope.resolve("user") as {
      validateInviteToken: (token: string) => Promise<{ email: string }>;
    };
    const invite = await service.validateInviteToken(body.token);
    // Use the native one-use invite workflow; keep the secret token out of request URLs.
    await acceptInviteWorkflow(req.scope).run({
      input: {
        invite_token: body.token,
        auth_identity_id: context.auth_identity_id,
        user: { email: invite.email, first_name: body.name.trim() },
      },
    });
    res.json({ ok: true });
  } catch {
    res
      .status(401)
      .json({
        message:
          "Приглашение не принято. Проверьте срок ссылки и учётную запись.",
      });
  }
}
