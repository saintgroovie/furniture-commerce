import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { DeskError, type Sql } from "./commands";
import { staffAccess } from "./staff-access";

export async function deskContext(req: MedusaRequest) {
  const actor = (
    req as MedusaRequest & {
      auth_context?: { actor_id?: string; actor_type?: string };
    }
  ).auth_context;
  if (!actor?.actor_id || actor.actor_type !== "user")
    throw new DeskError(401, "STAFF_REQUIRED", "Войдите под сотрудником");
  if (process.env.WOODRIGHT_DESK_FEATURES !== "1")
    throw new DeskError(
      503,
      "DESK_UNAVAILABLE",
      "Функции ещё не установлены в рабочем контуре",
    );
  const access = await staffAccess(req);
  const sql = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as Sql;
  const tables = (
    await sql.raw(`select to_regclass('woodright_desk_operation') as operations,
    to_regclass('woodright_follow_up') as reminders, to_regclass('woodright_private_attachment') as attachments`)
  ).rows[0];
  if (!tables?.operations || !tables?.reminders || !tables?.attachments)
    throw new DeskError(
      503,
      "DESK_SCHEMA_REQUIRED",
      "Обновление базы ещё не выполнено",
    );
  return { sql, actorId: actor.actor_id, access };
}
export function deskFailure(res: MedusaResponse, error: unknown) {
  const e =
    error instanceof DeskError
      ? error
      : new DeskError(
          503,
          "DESK_FAILED",
          "Не удалось подтвердить действие. Обновите карточку перед повтором",
        );
  res.setHeader("Cache-Control", "private, no-store");
  res.status(e.status).json({ code: e.code, message: e.message });
}
export function page(query: Record<string, unknown>) {
  const limit = query.limit === undefined ? 100 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 100000
  )
    throw new DeskError(400, "INVALID_PAGE", "Некорректная страница");
  return { limit, offset };
}
