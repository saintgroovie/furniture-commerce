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
    // One snapshot supplies rows and count so a concurrent insert cannot silently truncate the list.
    const data = (
      await sql.raw(
        `select
      (select count(*)::int from woodright_follow_up where deleted_at is null) as count,
      coalesce((select jsonb_agg(r order by r.due_at, r.id) from
        (select * from woodright_follow_up where deleted_at is null order by due_at, id limit ? offset ?) r), '[]'::jsonb) as reminders`,
        [limit, offset],
      )
    ).rows[0];
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ ...data, limit, offset });
  } catch (e) {
    deskFailure(res, e);
  }
}
