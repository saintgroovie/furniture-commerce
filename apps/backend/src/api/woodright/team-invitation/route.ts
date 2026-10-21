import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  STAFF_ROLES,
  ROLE_NAMES,
  type StaffRole,
} from "../../../lib/woodright-desk/staff-access";
export const AUTHENTICATE = false;
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const token = (req.body as { token?: unknown })?.token;
    if (typeof token !== "string" || token.length > 4096 || token.length < 40)
      throw Error();
    const service = req.scope.resolve("user") as {
      validateInviteToken: (token: string) => Promise<{
        email: string;
        expires_at: Date;
        metadata?: Record<string, any>;
      }>;
    };
    const invite = await service.validateInviteToken(token);
    const role = invite.metadata?.woodright_access?.role as StaffRole;
    if (!STAFF_ROLES.includes(role)) throw Error();
    const expiresAt = invite.metadata?.woodright_access?.expiresAt;
    if (
      expiresAt != null &&
      (!Number.isFinite(Date.parse(expiresAt)) ||
        Date.parse(expiresAt) <= Date.now())
    )
      throw Error();
    res.json({
      email: invite.email,
      expires_at: invite.expires_at,
      role,
      roleLabel: ROLE_NAMES[role],
      accessExpiresAt: expiresAt || null,
    });
  } catch {
    res.status(401).json({
      message:
        "Приглашение недействительно или истекло. Попросите новую ссылку у администратора.",
    });
  }
}
