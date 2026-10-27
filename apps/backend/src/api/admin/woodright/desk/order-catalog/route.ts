import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  deskContext,
  deskFailure,
} from "../../../../../lib/woodright-desk/http";
import { DeskError } from "../../../../../lib/woodright-desk/commands";
import { roleCapabilities } from "../../../../../lib/woodright-desk/staff-access";
import { orderCatalog } from "../../../../../lib/woodright-desk/orders-runtime";
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { access } = await deskContext(req);
    if (!roleCapabilities(access.role).orderCreate)
      throw new DeskError(
        403,
        "ROLE_FORBIDDEN",
        "Создание заказов доступно продажам и руководству",
      );
    const products = await orderCatalog(req.scope);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ products });
  } catch (e) {
    deskFailure(res, e);
  }
}
