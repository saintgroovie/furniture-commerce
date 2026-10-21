import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  deskContext,
  deskFailure,
  page,
} from "../../../../../lib/woodright-desk/http";
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { sql, actorId } = await deskContext(req),
      { limit, offset } = page(req.query);
    const row = (
      await sql.raw(
        `select (select count(*)::int from "user" where deleted_at is null) as count,
      coalesce((select jsonb_agg(u order by u.email,u.id) from (select id,email,first_name,last_name,metadata from "user" where deleted_at is null order by email,id limit ? offset ?) u),'[]'::jsonb) as staff`,
        [limit, offset],
      )
    ).rows[0];
    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      ...row,
      staff: row.staff.map((u: any) => ({
        id: u.id,
        email: u.email,
        first_name: u.first_name,
        last_name: u.last_name,
        access: u.metadata?.woodright_access ?? null,
      })),
      actor_id: actorId,
      limit,
      offset,
    });
  } catch (e) {
    deskFailure(res, e);
  }
}
