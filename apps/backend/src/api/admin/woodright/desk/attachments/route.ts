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
    const data = (
      await sql.raw(
        `select
      (select count(*)::int from woodright_private_attachment where entity_type = ? and entity_id = ? and deleted_at is null) as count,
      coalesce((select jsonb_agg(r order by r.created_at desc, r.id) from
        (select id, filename, mime_type, size, created_at, uploaded_by from woodright_private_attachment
        where entity_type = ? and entity_id = ? and deleted_at is null order by created_at desc, id limit ? offset ?) r), '[]'::jsonb) as attachments`,
        [type, id, type, id, limit, offset],
      )
    ).rows[0];
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ ...data, limit, offset });
  } catch (e) {
    deskFailure(res, e);
  }
}
