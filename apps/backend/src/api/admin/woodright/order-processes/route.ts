import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ORDER_PROCESS_MODULE } from "../../../../modules/order-process"
import OrderProcessModuleService from "../../../../modules/order-process/service"
import { isOrderProcessStage } from "../../../../lib/woodright-order-process/stages"
import { asProcessRecord } from "../../../../lib/woodright-order-process/ensure-process"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve(
    ORDER_PROCESS_MODULE
  ) as OrderProcessModuleService

  const stageRaw =
    (req.query.stage as string | undefined) ??
    (req.query.current_stage as string | undefined)
  const filters: Record<string, unknown> = {}
  if (stageRaw && isOrderProcessStage(stageRaw)) {
    filters.current_stage = stageRaw
  }

  const list = await service.listWoodrightOrderProcesses(filters, {
    order: { updated_at: "DESC" },
  })
  const processes = (list ?? []).map((row) =>
    asProcessRecord(row as unknown as Record<string, unknown>)
  )
  res.json({ order_processes: processes, count: processes.length })
}
