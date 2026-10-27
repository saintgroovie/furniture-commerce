import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getOrdersListWorkflow } from "@medusajs/medusa/core-flows";
import {
  deskContext,
  deskFailure,
  page,
} from "../../../../../lib/woodright-desk/http";
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { access } = await deskContext(req);
    // Production uses its restricted workload projection, never the financial graph.
    if (access.role === "production") {
      res.status(403).json({ message: "Откройте назначенные работы" });
      return;
    }
    const { limit, offset } = page(req.query);
    const { result } = await getOrdersListWorkflow(req.scope).run({
      input: {
        fields: [
          "id",
          "display_id",
          "status",
          "is_draft_order",
          "email",
          "currency_code",
          "metadata",
          "created_at",
          "total",
          "items.id",
          "items.title",
          "items.variant_title",
          "items.variant_sku",
          "items.variant_id",
          "items.quantity",
          "items.unit_price",
        ],
        variables: {
          take: limit,
          skip: offset,
          order: { created_at: "DESC", id: "ASC" },
        },
      },
    });
    res.setHeader("Cache-Control", "private, no-store");
    const rows = Array.isArray(result) ? result : result.rows;
    res.json({
      orders: rows,
      count: Array.isArray(result) ? rows.length : result.metadata.count,
      limit,
      offset,
    });
  } catch (e) {
    deskFailure(res, e);
  }
}
