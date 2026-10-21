import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ORDER_PROCESS_MODULE } from "../../../../modules/order-process";
import OrderProcessModuleService from "../../../../modules/order-process/service";
import { isOrderProcessStage } from "../../../../lib/woodright-order-process/stages";
import { page, deskFailure } from "../../../../lib/woodright-desk/http";
import { asProcessRecord } from "../../../../lib/woodright-order-process/ensure-process";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(
    ORDER_PROCESS_MODULE,
  ) as OrderProcessModuleService;

  const stageRaw =
    (req.query.stage as string | undefined) ??
    (req.query.current_stage as string | undefined);
  const filters: Record<string, unknown> = {};
  if (stageRaw && isOrderProcessStage(stageRaw)) {
    filters.current_stage = stageRaw;
  }

  try {
    const { limit, offset } = page(req.query);
    const [list, count] = await service.listAndCountWoodrightOrderProcesses(
      filters,
      {
        take: limit,
        skip: offset,
        order: { updated_at: "DESC", id: "ASC" },
      },
    );
    const processes = (list ?? []).map((row) =>
      asProcessRecord(row as unknown as Record<string, unknown>),
    );
    res.json({ order_processes: processes, count, limit, offset });
  } catch (error) {
    deskFailure(res, error);
  }
}
