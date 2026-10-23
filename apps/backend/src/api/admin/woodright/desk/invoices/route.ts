import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  deskContext,
  deskFailure,
  page,
} from "../../../../../lib/woodright-desk/http";
import { DeskError } from "../../../../../lib/woodright-desk/commands";
import { invoicesInstalled } from "../../../../../lib/woodright-desk/invoices";
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { sql, access } = await deskContext(req),
      { limit, offset } = page(req.query);
    if (access.role === "production")
      throw new DeskError(
        403,
        "ROLE_FORBIDDEN",
        "Счета доступны продажам и бухгалтерии",
      );
    if (!(await invoicesInstalled(sql)))
      throw new DeskError(
        503,
        "INVOICE_SCHEMA_REQUIRED",
        "Раздел счетов ещё не установлен в базе",
      );
    const data = (
      await sql.raw(
        `select
      (select count(*)::int from woodright_invoice where deleted_at is null) as count,
      coalesce((select jsonb_agg(r order by r.created_at desc,r.id) from
      (select * from woodright_invoice where deleted_at is null order by created_at desc,id limit ? offset ?) r),'[]'::jsonb) as invoices`,
        [limit, offset],
      )
    ).rows[0];
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ ...data, limit, offset });
  } catch (e) {
    deskFailure(res, e);
  }
}
