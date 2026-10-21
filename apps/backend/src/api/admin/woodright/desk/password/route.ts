import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  deskContext,
  deskFailure,
} from "../../../../../lib/woodright-desk/http";
import { DeskError } from "../../../../../lib/woodright-desk/commands";
const attempts = new Map<string, { count: number; until: number }>();
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { actorId } = await deskContext(req),
      body = req.body as { currentPassword?: unknown; newPassword?: unknown };
    if (
      typeof body.currentPassword !== "string" ||
      !body.currentPassword ||
      body.currentPassword.length > 1024 ||
      typeof body.newPassword !== "string" ||
      body.newPassword.length < 12 ||
      body.newPassword.length > 1024 ||
      body.newPassword === body.currentPassword
    )
      throw new DeskError(
        400,
        "INVALID_PASSWORD",
        "Укажите текущий пароль и новый пароль от 12 символов.",
      );
    const now = Date.now();
    for (const [key, a] of attempts) if (a.until < now) attempts.delete(key);
    if ((attempts.get(actorId)?.count ?? 0) >= 5)
      throw new DeskError(
        429,
        "PASSWORD_ATTEMPTS",
        "Повторите через 10 минут.",
      );
    attempts.set(actorId, {
      count: (attempts.get(actorId)?.count ?? 0) + 1,
      until: now + 600000,
    });
    const userService = req.scope.resolve("user") as {
      retrieveUser: (id: string) => Promise<{ email: string }>;
    };
    const user = await userService.retrieveUser(actorId);
    const auth = req.scope.resolve("auth") as {
      authenticate: (
        provider: string,
        input: any,
      ) => Promise<{
        success: boolean;
        authIdentity?: { app_metadata?: Record<string, unknown> };
      }>;
      updateProvider: (
        provider: string,
        input: any,
      ) => Promise<{ success: boolean }>;
    };
    const verified = await auth.authenticate("emailpass", {
      body: { email: user.email, password: body.currentPassword },
    });
    if (
      !verified.success ||
      verified.authIdentity?.app_metadata?.user_id !== actorId
    )
      throw new DeskError(401, "PASSWORD_INVALID", "Проверьте текущий пароль.");
    const updated = await auth.updateProvider("emailpass", {
      entity_id: user.email,
      password: body.newPassword,
    });
    if (!updated.success)
      throw new DeskError(
        503,
        "PASSWORD_UPDATE_FAILED",
        "Пароль не изменён. Повторите позже.",
      );
    attempts.delete(actorId);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ ok: true });
  } catch (e) {
    deskFailure(res, e);
  }
}
