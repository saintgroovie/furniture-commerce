import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { BESPOKE_REQUEST_MODULE } from "../../../modules/bespoke-request";
import BespokeRequestModuleService from "../../../modules/bespoke-request/service";
import { page, deskFailure } from "../../../lib/woodright-desk/http";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const status = req.query.status as string | undefined;
  const bespokeService = req.scope.resolve(
    BESPOKE_REQUEST_MODULE,
  ) as BespokeRequestModuleService;
  const filters = status ? { status } : {};
  try {
    const { limit, offset } = page(req.query);
    const [list, count] = await bespokeService.listAndCountBespokeRequests(
      filters,
      { take: limit, skip: offset, order: { created_at: "DESC", id: "ASC" } },
    );
    res.json({ bespoke_requests: list, count, limit, offset });
  } catch (error) {
    deskFailure(res, error);
  }
}
