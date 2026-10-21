import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  deskContext,
  deskFailure,
} from "../../../../../lib/woodright-desk/http";
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { sql, actorId } = await deskContext(req);
    // Query only assigned entities. Client contacts, budgets, totals and payment details never leave this route.
    const requests = (
      await sql.raw(
        `select b.id,b.lead_id,b.product_id,b.room_set_id,b.dimensions,b.materials,b.comment,b.status,b.internal_notes,b.created_at,b.updated_at
      from bespoke_request b join woodright_desk_record r on r.entity_type='request' and r.entity_id=b.id
      where r.assignee_id=? and b.deleted_at is null order by b.created_at desc,b.id`,
        [actorId],
      )
    ).rows;
    const orderIds = (
      await sql.raw(
        "select entity_id from woodright_desk_record where entity_type='order' and assignee_id=? order by entity_id",
        [actorId],
      )
    ).rows.map((r: any) => r.entity_id);
    let orders: any[] = [],
      processes: any[] = [];
    if (orderIds.length) {
      const query = req.scope.resolve("query") as any;
      orders = (
        await query.graph({
          entity: "order",
          fields: [
            "id",
            "display_id",
            "status",
            "created_at",
            "items.id",
            "items.title",
            "items.quantity",
          ],
          filters: { id: orderIds },
        })
      ).data;
      processes = (
        await sql.raw(
          "select id,order_id,current_stage,version,estimated_completion_date,internal_note from woodright_order_process where order_id = any(?::text[]) and deleted_at is null",
          [orderIds],
        )
      ).rows;
    }
    const companies = (
      await sql.raw(
        `select distinct c.id,c.name,c.status from woodright_company c join woodright_desk_record r on r.company_id=c.id
      where r.assignee_id=? and r.entity_type in ('request','order') and c.deleted_at is null order by c.name,c.id`,
        [actorId],
      )
    ).rows;
    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      requests: { bespoke_requests: requests, count: requests.length },
      orders: { orders, count: orders.length },
      processes: { order_processes: processes, count: processes.length },
      companies: { companies, count: companies.length },
    });
  } catch (error) {
    deskFailure(res, error);
  }
}
