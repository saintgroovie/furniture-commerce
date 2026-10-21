import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
export const AUTHENTICATE = false;
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const token = (req.body as { token?: unknown })?.token;
    if (typeof token !== "string" || token.length > 4096 || token.length < 40)
      throw Error();
    const service = req.scope.resolve("user") as {
      validateInviteToken: (
        token: string,
      ) => Promise<{ email: string; expires_at: Date }>;
    };
    const invite = await service.validateInviteToken(token);
    res.json({ email: invite.email, expires_at: invite.expires_at });
  } catch {
    res
      .status(401)
      .json({
        message:
          "Приглашение недействительно или истекло. Попросите новую ссылку у администратора.",
      });
  }
}
