import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  deskContext,
  deskFailure,
  page,
} from "../../../../../lib/woodright-desk/http";
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { sql } = await deskContext(req),
      { limit, offset } = page(req.query);
    const data = (
      await sql.raw(
        `select
      (select count(*)::int from woodright_private_attachment where deleted_at is null) as count,
      coalesce((select jsonb_agg(r order by r.created_at desc, r.id) from
        (select id, entity_type, entity_id, filename, mime_type, size, created_at from woodright_private_attachment
        where deleted_at is null order by created_at desc, id limit ? offset ?) r), '[]'::jsonb) as attachments`,
        [limit, offset],
      )
    ).rows[0];
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ ...data, limit, offset });
  } catch (e) {
    deskFailure(res, e);
  }
}
