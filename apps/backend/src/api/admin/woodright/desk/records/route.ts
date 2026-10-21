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
    const row = (
      await sql.raw(
        `select (select count(*)::int from woodright_desk_record) as count,
      coalesce((select jsonb_agg(r order by r.entity_type,r.entity_id) from (select * from woodright_desk_record order by entity_type,entity_id limit ? offset ?) r),'[]'::jsonb) as records`,
        [limit, offset],
      )
    ).rows[0];
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ ...row, limit, offset });
  } catch (e) {
    deskFailure(res, e);
  }
}
