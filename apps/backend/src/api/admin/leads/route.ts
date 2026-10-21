import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { LEAD_MODULE } from "../../../modules/lead";
import LeadModuleService from "../../../modules/lead/service";
import { page, deskFailure } from "../../../lib/woodright-desk/http";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const leadService = req.scope.resolve(LEAD_MODULE) as LeadModuleService;
  try {
    const { limit, offset } = page(req.query);
    const [list, count] = await leadService.listAndCountLeads(
      {},
      { take: limit, skip: offset, order: { created_at: "DESC", id: "ASC" } },
    );
    res.json({ leads: list, count, limit, offset });
  } catch (error) {
    deskFailure(res, error);
  }
}
