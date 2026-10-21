import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  deskContext,
  deskFailure,
} from "../../../../../lib/woodright-desk/http";
import {
  DeskError,
  identifier,
  operation,
  audit,
} from "../../../../../lib/woodright-desk/commands";
import {
  STAFF_ROLES,
  ROLE_NAMES,
  parseStaffAccess,
  roleCapabilities,
} from "../../../../../lib/woodright-desk/staff-access";
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { access } = await deskContext(req);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      ...access,
      ...roleCapabilities(access.role).access,
      roles: STAFF_ROLES.map((role) => ({ role, label: ROLE_NAMES[role] })),
    });
  } catch (error) {
    deskFailure(res, error);
  }
}
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { sql, access } = await deskContext(req);
    if (access.role !== "god")
      throw new DeskError(
        403,
        "ROLE_FORBIDDEN",
        "Доступом управляет полный администратор",
      );
    const body = req.body as any,
      id = identifier(body.id);
    if (
      !STAFF_ROLES.includes(body.role) ||
      typeof body.enabled !== "boolean" ||
      !Number.isSafeInteger(body.expectedVersion) ||
      body.expectedVersion < 0
    )
      throw new DeskError(
        400,
        "INVALID_ACCESS",
        "Выберите роль и обновите карточку сотрудника",
      );
    if (id === access.actorId && (body.role !== "god" || !body.enabled))
      throw new DeskError(
        409,
        "SELF_ACCESS_GUARD",
        "Свой полный доступ нельзя закрыть из этого профиля",
      );
    if (
      body.expiresAt != null &&
      (typeof body.expiresAt !== "string" ||
        !Number.isFinite(Date.parse(body.expiresAt)) ||
        Date.parse(body.expiresAt) <= Date.now())
    )
      throw new DeskError(
        400,
        "INVALID_ACCESS_EXPIRY",
        "Выберите будущую дату окончания доступа",
      );
    const result = await operation(
      sql,
      access.actorId,
      body.key,
      {
        type: "staff.access",
        id,
        role: body.role,
        enabled: body.enabled,
        expectedVersion: body.expectedVersion,
        ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt } : {}),
      },
      async (trx) => {
        await trx.raw(
          "select pg_advisory_xact_lock(hashtext('woodright-staff-access'))",
        );
        const actor = (
          await trx.raw(
            'select * from "user" where id = ? and deleted_at is null for share',
            [access.actorId],
          )
        ).rows[0];
        if (parseStaffAccess(actor).role !== "god")
          throw new DeskError(403, "ROLE_FORBIDDEN", "Ваши права изменились");
        const target = (
          await trx.raw(
            'select * from "user" where id = ? and deleted_at is null for update',
            [id],
          )
        ).rows[0];
        if (!target)
          throw new DeskError(404, "NOT_FOUND", "Сотрудник не найден");
        const old = target.metadata?.woodright_access;
        if ((old?.version ?? 0) !== body.expectedVersion)
          throw new DeskError(
            409,
            "STALE_VERSION",
            "Коллега изменил доступ. Обновите список",
          );
        const updated = {
          role: body.role,
          enabled: body.enabled,
          version: (old?.version ?? 0) + 1,
          expiresAt:
            body.expiresAt === undefined
              ? old?.expiresAt || null
              : body.expiresAt,
        };
        await trx.raw(
          'update "user" set metadata = ?::jsonb, updated_at = now() where id = ?',
          [
            JSON.stringify({ ...target.metadata, woodright_access: updated }),
            id,
          ],
        );
        await audit(
          trx,
          access.actorId,
          "staff" as any,
          id,
          "staff.access_changed",
          { from: old, to: updated },
        );
        return { id, access: updated };
      },
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ ok: true, result });
  } catch (error) {
    deskFailure(res, error);
  }
}
