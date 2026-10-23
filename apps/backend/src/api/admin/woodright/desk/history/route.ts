import { assertEntityAccess } from "../../../../../lib/woodright-desk/staff-access";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  entity,
  identifier,
  requireEntity,
} from "../../../../../lib/woodright-desk/commands";
import {
  deskContext,
  deskFailure,
  page,
} from "../../../../../lib/woodright-desk/http";
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { sql, access } = await deskContext(req),
      { limit, offset } = page(req.query);
    const type = entity(req.query.entity_type),
      id = identifier(req.query.entity_id);
    await assertEntityAccess(sql, access, type, id);
    await sql.transaction(async (trx) => {
      await requireEntity(trx, type, id);
    });
    const scoped =
      access.role === "production"
        ? "and (action not like 'attachment.%' or exists (select 1 from woodright_private_attachment f where f.id=woodright_desk_event.details->>'attachment_id' and f.visibility='assigned' and f.entity_type=woodright_desk_event.entity_type and f.entity_id=woodright_desk_event.entity_id))"
        : "";
    const data = (
      await sql.raw(
        `select
      (select count(*)::int from woodright_desk_event where entity_type = ? and entity_id = ? ${scoped}) as count,
      coalesce((select jsonb_agg(r order by r.created_at desc, r.id) from
        (select id, action, actor_id, details, created_at from woodright_desk_event
        where entity_type = ? and entity_id = ? ${scoped} order by created_at desc, id limit ? offset ?) r), '[]'::jsonb) as events`,
        [type, id, type, id, limit, offset],
      )
    ).rows[0];
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ ...data, limit, offset });
  } catch (e) {
    deskFailure(res, e);
  }
}
