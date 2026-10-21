import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  deskContext,
  deskFailure,
  page,
} from "../../../../../lib/woodright-desk/http";
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { sql, access } = await deskContext(req),
      { limit, offset } = page(req.query);
    const scoped =
      access.role === "production"
        ? "and exists (select 1 from woodright_desk_record a where a.entity_type=woodright_private_attachment.entity_type and a.entity_id=woodright_private_attachment.entity_id and a.assignee_id=?)"
        : "";
    const bindings =
      access.role === "production"
        ? [access.actorId, access.actorId, limit, offset]
        : [limit, offset];
    const data = (
      await sql.raw(
        `select
      (select count(*)::int from woodright_private_attachment where deleted_at is null ${scoped}) as count,
      coalesce((select jsonb_agg(r order by r.created_at desc, r.id) from
        (select id, entity_type, entity_id, filename, mime_type, size, created_at from woodright_private_attachment
        where deleted_at is null ${scoped} order by created_at desc, id limit ? offset ?) r), '[]'::jsonb) as attachments`,
        bindings,
      )
    ).rows[0];
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ ...data, limit, offset });
  } catch (e) {
    deskFailure(res, e);
  }
}
